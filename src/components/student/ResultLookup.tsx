'use client'

import { useCallback, useState } from 'react'

import { lookupResults, type ResultRecord, type StudentProfile } from '@/lib/store'
import { Marksheet } from './StudentPortal'
import { MarksheetOverlay } from './MarksheetOverlay'

/**
 * Public result lookup: roll number in, result out, no sign-in.
 *
 * The portal at /student/ is unchanged and still needs a session — it is what
 * shows the photograph, contact details and correction requests. This screen
 * deliberately shows less: the server sends only what a result needs, so there
 * is nothing extra here to leak.
 */
export function ResultLookup() {
  const [rollNo, setRollNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<{ student: StudentProfile; results: ResultRecord[] } | null>(
    null
  )
  const [sheet, setSheet] = useState<ResultRecord | null>(null)
  const closeSheet = useCallback(() => setSheet(null), [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rollNo.trim()) return

    setBusy(true)
    setError(null)
    setFound(null)

    const res = await lookupResults(rollNo)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setFound({ student: res.student, results: res.results })
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="panel no-print max-w-[460px]">
        <h2 className="panel-head m-0">Check Your Result</h2>
        <div className="panel-body">
          <label htmlFor="r-roll" className="mb-1.5 block text-[13px] font-semibold text-jnu-800">
            Roll Number
          </label>
          <input
            id="r-roll"
            type="text"
            required
            maxLength={24}
            value={rollNo}
            onChange={(e) => setRollNo(e.target.value)}
            placeholder="JNU2024BT0147"
            className="w-full rounded border border-hair px-3 py-2 text-[14px] uppercase tracking-wide focus:border-jnu-400"
          />
          <p className="m-0 mt-1.5 text-xs text-muted">
            As printed on your admit card. No sign-in is needed.
          </p>

          {error ? (
            <p
              role="alert"
              className="m-0 mt-4 rounded border border-[#a8322b] bg-[#fdf4f3] px-3 py-2 text-[13px] text-[#a8322b]"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
            {busy ? 'Searching…' : 'View Result'}
          </button>
        </div>
      </form>

      {found ? (
        <div className="mt-8">
          <h2 className="rule-heading">
            {found.student.fullName}{' '}
            <span className="tnum text-[14px] font-normal text-muted">({found.student.rollNo})</span>
          </h2>
          {found.results.map((r) => (
            <Marksheet
              key={r.id}
              row={r}
              profile={found.student}
              all={found.results}
              onDownload={() => setSheet(r)}
            />
          ))}
        </div>
      ) : null}

      {sheet && found ? (
        <MarksheetOverlay row={sheet} profile={found.student} all={found.results} onClose={closeSheet} />
      ) : null}
    </div>
  )
}
