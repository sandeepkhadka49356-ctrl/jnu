'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  getStudentPortal,
  studentSignIn,
  studentSignOut,
  type CorrectionRequest,
  type ResultRecord,
  type StudentProfile,
} from '@/lib/store'
import { formatNoticeDate } from '@/lib/content-types'
import { bandFor, cumulative } from '@/lib/grading'
import {
  announceStudentSessionChanged,
  onStudentSessionChanged,
} from '@/lib/student-session-events'
import { ProfilePanel } from './ProfilePanel'
import { MarksheetOverlay } from './MarksheetOverlay'

/**
 * Student portal: sign in with roll number + date of birth, then see your own
 * profile and published results.
 *
 * One auth flow serves both. The alternative — a login page plus a separate
 * public roll-number lookup — would mean two doors into the same personal
 * data, one of them unauthenticated, so the login would secure nothing.
 *
 * Everything rendered here comes from /api/student/me, which reads the student
 * id from the session cookie. No roll number is sent, so there is no parameter
 * to tamper with to reach another student's record.
 */
export function StudentPortal() {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [results, setResults] = useState<ResultRecord[]>([])
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([])
  const [checking, setChecking] = useState(true)
  /** The result whose printable statement is open, if any. */
  const [sheet, setSheet] = useState<ResultRecord | null>(null)
  const closeSheet = useCallback(() => setSheet(null), [])

  const refresh = useCallback(async () => {
    const data = await getStudentPortal()
    setProfile(data.student)
    setResults(data.results)
    setCorrections(data.corrections)
    setChecking(false)
  }, [])

  useEffect(() => {
    void refresh()
    // Signing out from the masthead menu must clear this screen too.
    return onStudentSessionChanged(() => void refresh())
  }, [refresh])

  /** Sign-in: reload the record, and tell the masthead menu. */
  const onSignedIn = useCallback(async () => {
    await refresh()
    announceStudentSessionChanged()
  }, [refresh])

  // While the session check is in flight, show the sign-in form rather than a
  // spinner. On a login page the overwhelmingly common state is signed out, so
  // a "Loading…" flash on every visit costs every visitor to save the few who
  // arrive with a live session — and those few see the form for one round trip
  // instead, which is the cheaper mistake.
  if (!profile) {
    return <SignInForm onSignedIn={onSignedIn} busyCheck={checking} />
  }

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14px]">
          Signed in as <span className="font-semibold">{profile.fullName}</span>{' '}
          <span className="tnum text-muted">({profile.rollNo})</span>
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            await studentSignOut()
            await refresh()
            announceStudentSessionChanged()
          }}
        >
          Sign out
        </button>
      </div>

      <ProfilePanel profile={profile} corrections={corrections} onChanged={refresh} />

      <h2 className="rule-heading mt-8">Examination Results</h2>
      {results.length === 0 ? (
        <p className="text-[14px] text-muted">
          No results have been published against your roll number yet. Results appear here
          once the examination cell declares them.
        </p>
      ) : (
        results.map((r) => (
          <Marksheet key={r.id} row={r} profile={profile} all={results} onDownload={() => setSheet(r)} />
        ))
      )}

      {sheet ? <MarksheetOverlay row={sheet} profile={profile} all={results} onClose={closeSheet} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------- sign in --- */

function SignInForm({
  onSignedIn,
  busyCheck = false,
}: {
  onSignedIn: () => Promise<void>
  busyCheck?: boolean
}) {
  const [rollNo, setRollNo] = useState('')
  const [dob, setDob] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rollNo.trim() || !dob) return

    setBusy(true)
    setError(null)

    const res = await studentSignIn(rollNo, dob)
    if (!res.ok) {
      setError(res.error)
      setBusy(false)
      return
    }
    await onSignedIn()
  }

  return (
    <form onSubmit={onSubmit} className="panel max-w-[460px]">
      <h2 className="panel-head m-0">Student Login</h2>
      <div className="panel-body">
        <div className="mb-4">
          <label htmlFor="s-roll" className="mb-1.5 block text-[13px] font-semibold text-jnu-800">
            Roll Number
          </label>
          <input
            id="s-roll"
            type="text"
            autoComplete="username"
            required
            maxLength={24}
            value={rollNo}
            onChange={(e) => setRollNo(e.target.value)}
            placeholder="JNU2024BT0147"
            className="w-full rounded border border-hair px-3 py-2 text-[14px] uppercase tracking-wide focus:border-jnu-400"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="s-dob" className="mb-1.5 block text-[13px] font-semibold text-jnu-800">
            Date of Birth
          </label>
          <input
            id="s-dob"
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="tnum w-full rounded border border-hair px-3 py-2 text-[14px] focus:border-jnu-400"
          />
          <p className="m-0 mt-1.5 text-xs text-muted">
            As recorded on your admit card. Contact the examination cell if it is wrong.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="m-0 mb-4 rounded border border-[#a8322b] bg-[#fdf4f3] px-3 py-2 text-[13px] text-[#a8322b]"
          >
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={busy || busyCheck}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="m-0 mt-4 text-xs text-muted">
          After five failed attempts the account is locked for fifteen minutes.
        </p>
      </div>
    </form>
  )
}

/* ----------------------------------------------------------- marksheet --- */

export function Marksheet({
  row,
  profile,
  all,
  onDownload,
}: {
  row: ResultRecord
  profile: StudentProfile
  /**
   * Every published result for this student, used for the running totals.
   * Already in hand at both call sites — the portal and the public lookup
   * both fetch the whole set — so this costs no extra request.
   */
  all: ResultRecord[]
  onDownload: () => void
}) {
  const subjects = Array.isArray(row.subjects) ? row.subjects : []
  const pct = row.marks_max > 0 ? (row.marks_obtained / row.marks_max) * 100 : 0

  const cum = cumulative(
    { semester: row.semester, marksObtained: row.marks_obtained, marksMax: row.marks_max },
    all.map((r) => ({ semester: r.semester, marksObtained: r.marks_obtained, marksMax: r.marks_max }))
  )
  // The overall grade is taken from the running total, not this semester
  // alone: a grade printed beside a grand total has to describe that total.
  const overallPct = cum.grandMax > 0 ? (cum.grandObtained / cum.grandMax) * 100 : 0
  const overall = bandFor(overallPct)

  return (
    <article className="panel mb-5">
      <h2 className="panel-head m-0 flex flex-wrap items-center justify-between gap-2">
        <span>
          {row.semester} — {row.exam_session}
        </span>
        <span
          className={`rounded-sm border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
            row.status === 'PASS'
              ? 'border-[#2c6549] text-[#2c6549]'
              : row.status === 'ATKT'
                ? 'border-[#9a6a10] text-[#9a6a10]'
                : 'border-[#a8322b] text-[#a8322b]'
          }`}
        >
          {row.status}
        </span>
      </h2>

      <div className="panel-body">
        {/* The marksheet repeats the identifying details so a printed copy
            stands on its own — a page printed from here should be readable
            without the screen above it. */}
        <div className="mb-4 flex flex-wrap items-start gap-5">
        <dl className="m-0 grid flex-1 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <Row label="Roll Number" value={row.roll_no} mono bold />
          <Row label="Enrollment No." value={profile.enrollmentNo} mono bold />
          <Row label="Candidate Name" value={row.student_name} bold />
          <Row label="Father's Name" value={profile.fatherName} />
          <Row label="Mother's Name" value={profile.motherName} />
          <Row label="Date of Birth" value={formatNoticeDate(profile.dob)} mono />
          <Row label="Programme" value={row.programme} />
          <Row label="SGPA" value={row.sgpa.toFixed(2)} mono />
          <Row label="Marks" value={`${row.marks_obtained} / ${row.marks_max}`} mono />
          <Row label="Percentage" value={`${pct.toFixed(2)}%`} mono />

          {/* Running totals, shown only once there is a previous semester to
              run from. On a first semester they would just repeat the two
              rows above with different labels. */}
          {cum.previousCount > 0 ? (
            <>
              <Row
                label="Previous Sem. Total"
                value={`${cum.previousObtained} / ${cum.previousMax}`}
                mono
              />
              <Row
                label="Grand Total"
                value={`${cum.grandObtained} / ${cum.grandMax}`}
                mono
                bold
              />
            </>
          ) : null}
          <Row label="Overall Grade" value={`${overall.letter} — ${overall.description}`} bold />
        </dl>

        {/* eslint-disable-next-line @next/next/no-img-element --
            the photo is served from an authenticated route, not /public, so
            next/image cannot optimise it and would only proxy it again. */}
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={`Photograph of ${row.student_name}`}
            className="h-[120px] w-[95px] shrink-0 rounded-sm border border-hair object-cover"
          />
        ) : null}
        </div>

        {subjects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border border-hair bg-shell px-3 py-2 text-left">Code</th>
                  <th className="border border-hair bg-shell px-3 py-2 text-left">Subject</th>
                  <th className="border border-hair bg-shell px-3 py-2 text-right">Max</th>
                  {/*
                    Theory and Practical were on the downloaded marksheet but
                    not here, so the page and the PDF disagreed about how a
                    total was arrived at. Same columns, same order, both places.
                  */}
                  <th className="border border-hair bg-shell px-3 py-2 text-right">Theory</th>
                  <th className="border border-hair bg-shell px-3 py-2 text-right">Practical</th>
                  <th className="border border-hair bg-shell px-3 py-2 text-right">Obtained</th>
                  <th className="border border-hair bg-shell px-3 py-2 text-left">Grade</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s, i) => {
                  // Same fallbacks the marksheet uses: with no split recorded,
                  // the whole mark is theory and there is no practical paper.
                  const theory = typeof s.theory === 'number' ? s.theory : s.obtained
                  const practical = typeof s.practical === 'number' ? s.practical : null
                  return (
                    <tr key={`${s.code}-${i}`}>
                      <td className="tnum border border-hair px-3 py-2">{s.code}</td>
                      <td className="border border-hair px-3 py-2">{s.name}</td>
                      <td className="tnum border border-hair px-3 py-2 text-right">{s.max}</td>
                      <td className="tnum border border-hair px-3 py-2 text-right">{theory}</td>
                      <td className="tnum border border-hair px-3 py-2 text-right">{practical ?? '—'}</td>
                      <td
                        className={`tnum border border-hair px-3 py-2 text-right ${
                          s.obtained < s.max * 0.4 ? 'font-semibold text-[#a8322b]' : ''
                        }`}
                      >
                        {s.obtained}
                      </td>
                      <td className="border border-hair px-3 py-2">{s.grade}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  {/* The total row is the line anyone reads first — bold throughout. */}
                  <td colSpan={2} className="border border-hair bg-shell px-3 py-2 font-bold">
                    Total
                  </td>
                  <td className="tnum border border-hair bg-shell px-3 py-2 text-right font-bold">
                    {row.marks_max}
                  </td>
                  {/* Theory and practical do not total meaningfully across
                      subjects when some papers have no practical component. */}
                  <td className="border border-hair bg-shell px-3 py-2 text-right">—</td>
                  <td className="border border-hair bg-shell px-3 py-2 text-right">—</td>
                  <td className="tnum border border-hair bg-shell px-3 py-2 text-right font-bold">
                    {row.marks_obtained}
                  </td>
                  <td className="border border-hair bg-shell px-3 py-2" />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}

        {row.status === 'ATKT' ? (
          <p className="m-0 mt-4 text-[13px] text-[#9a6a10]">
            Subjects below the minimum are shown in red. You are permitted to carry these
            forward and must appear in the next available back-paper examination.
          </p>
        ) : null}

        <p className="m-0 mt-4 text-xs text-muted">
          This is a provisional statement of marks for information only. It is not a
          substitute for the official marksheet issued by the examination cell.
        </p>

        <p className="no-print m-0 mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onDownload} className="btn btn-primary">
            Download marksheet
          </button>
          {row.serial ? (
            <span className="tnum text-[12px] text-muted">Sr. No. {row.serial}</span>
          ) : null}
        </p>
      </div>
    </article>
  )
}

function Row({
  label,
  value,
  mono = false,
  bold = false,
}: {
  label: string
  value: string
  mono?: boolean
  bold?: boolean
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className={`m-0 min-w-0 ${mono ? 'tnum' : ''} ${bold ? 'font-semibold' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
