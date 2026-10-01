'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { api, del, getJson } from '@/lib/admin-client'
import { StudentModal } from '@/components/admin/StudentModal'
import {
  Button,
  Card,
  ConfirmButton,
  Loading,
  PageHeader,
  Pill,
  StatusLine,
  Table,
  Td,
  useStatus,
} from '@/components/admin/ui'
import { formatNoticeDate } from '@/lib/content-types'

type Detail = {
  id: string
  rollNo: string
  enrollmentNo: string
  fullName: string
  fatherName: string
  motherName: string
  dob: string
  programme: string
  status: string
  mobile: string | null
  email: string | null
  addressLine: string | null
  district: string | null
  state: string | null
  pincode: string | null
  photoUrl: string | null
  pendingPhotoUrl: string | null
  lockedUntil: string | null
  lastLoginAt: string | null
  failedLogins: number
  results: { id: string; semester: string; examSession: string; status: string; published: boolean; marksObtained: number; marksMax: number }[]
  certificates: { id: string; certificateNo: string; status: string; awardYear: number; programme: string }[]
  corrections: { id: string; field: string }[]
}

/** One student: their record, results, degrees and sign-in state. */
export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [s, setS] = useState<Detail | null>(null)
  const [editing, setEditing] = useState(false)
  const { status, show, saved } = useStatus()

  const load = useCallback(async () => {
    const res = await getJson<{ student: Detail }>(`/api/admin/students/${id}`)
    if (res.ok) setS(res.data.student)
    else show({ tone: 'error', text: res.error })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!s) return <Loading />

  const locked = s.lockedUntil && new Date(s.lockedUntil) > new Date()

  return (
    <div>
      <PageHeader
        title={s.fullName}
        description={`${s.rollNo} · ${s.enrollmentNo} · ${s.programme}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <ConfirmButton
              size="md"
              question={`Delete ${s.fullName}? This cannot be undone.`}
              onConfirm={async () => {
                const res = await del(`/api/admin/students/${id}`)
                if (!res.ok) {
                  show({ tone: 'error', text: res.error })
                  return
                }
                router.push('/admin/students')
              }}
            >
              Delete
            </ConfirmButton>
          </>
        }
      />
      <StatusLine status={status} />
      <p className="mb-4 text-[12px]">
        <Link href="/admin/students" className="text-jnu-700 underline">
          ← All students
        </Link>
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Card title="Record">
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <Row label="Roll number" value={s.rollNo} />
              <Row label="Enrollment number" value={s.enrollmentNo} />
              <Row label="Date of birth" value={`${formatNoticeDate(s.dob)} (${s.dob})`} />
              <Row label="Programme" value={s.programme} />
              <Row label="Father's name" value={s.fatherName} />
              <Row label="Mother's name" value={s.motherName} />
              <Row label="Mobile" value={s.mobile ?? '—'} />
              <Row label="Email" value={s.email ?? '—'} />
              <Row
                label="Address"
                value={[s.addressLine, s.district, s.state, s.pincode].filter(Boolean).join(', ') || '—'}
              />
              <Row label="Status" value={s.status} />
            </dl>
          </Card>

          <Card title={`Results (${s.results.length})`}>
            {s.results.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">No results recorded.</p>
            ) : (
              <Table head={['Semester', 'Session', 'Marks', 'Result', 'Published']}>
                {s.results.map((r) => (
                  <tr key={r.id}>
                    <Td>{r.semester}</Td>
                    <Td>{r.examSession}</Td>
                    <Td className="tnum">
                      {r.marksObtained}/{r.marksMax}
                    </Td>
                    <Td>{r.status}</Td>
                    <Td>{r.published ? <Pill tone="ok">Published</Pill> : <Pill tone="muted">Draft</Pill>}</Td>
                  </tr>
                ))}
              </Table>
            )}
            <p className="m-0 mt-3 text-[12px]">
              <Link href="/admin/results" className="text-jnu-700 underline">
                Manage results →
              </Link>
            </p>
          </Card>

          <Card title={`Degrees (${s.certificates.length})`}>
            {s.certificates.length === 0 ? (
              <p className="m-0 text-[13px] text-muted">No degree issued.</p>
            ) : (
              <Table head={['Certificate no.', 'Programme', 'Year', 'Status']}>
                {s.certificates.map((c) => (
                  <tr key={c.id}>
                    <Td className="tnum">{c.certificateNo}</Td>
                    <Td>{c.programme}</Td>
                    <Td className="tnum">{c.awardYear}</Td>
                    <Td>
                      {c.status === 'VERIFIED' ? <Pill tone="ok">Valid</Pill> : c.status === 'REVOKED' ? <Pill tone="bad">Revoked</Pill> : <Pill tone="warn">Withheld</Pill>}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div>
          <Card title="Photograph">
            {s.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.photoUrl} alt="" className="h-40 w-32 rounded border border-hair object-cover" />
            ) : (
              <p className="m-0 text-[13px] text-muted">None on record.</p>
            )}
            {s.pendingPhotoUrl ? (
              <p className="m-0 mt-3 text-[12px]">
                <Pill tone="warn">New photo awaiting approval</Pill>{' '}
                <Link href="/admin/requests" className="text-jnu-700 underline">
                  Review →
                </Link>
              </p>
            ) : null}

            <PhotoUpload
              studentId={id}
              hasPhoto={Boolean(s.photoUrl)}
              onDone={async (text) => {
                show({ tone: 'ok', text })
                await load()
              }}
              onError={(text) => show({ tone: 'error', text })}
            />
          </Card>

          <Card title="Sign-in">
            <dl className="m-0 space-y-2 text-[13px]">
              <Row label="Last signed in" value={s.lastLoginAt ? formatNoticeDate(s.lastLoginAt.slice(0, 10)) : 'Never'} />
              <Row label="Failed attempts" value={String(s.failedLogins)} />
            </dl>
            {locked ? (
              <div className="mt-3">
                <p className="m-0 mb-2 text-[12px] text-[#9a6a10]">
                  Locked after repeated failed sign-ins.
                </p>
                <Button
                  size="sm"
                  onClick={async () => {
                    const res = await api(`/api/admin/students/${id}/unlock`, { method: 'POST' })
                    if (!res.ok) {
                      show({ tone: 'error', text: res.error })
                      return
                    }
                    show({ tone: 'ok', text: 'Sign-in unlocked.' })
                    await load()
                  }}
                >
                  Unlock sign-in
                </Button>
              </div>
            ) : null}
            <p className="m-0 mt-3 text-[11.5px] text-muted">
              Students sign in with their roll number and date of birth. If a student cannot get in, check the
              date of birth above matches their documents.
            </p>
          </Card>

          {s.corrections.length ? (
            <Card title="Open requests">
              <p className="m-0 text-[13px]">
                {s.corrections.length} correction request(s) waiting.{' '}
                <Link href="/admin/requests" className="text-jnu-700 underline">
                  Review →
                </Link>
              </p>
            </Card>
          ) : null}
        </div>
      </div>

      {editing ? (
        <StudentModal
          student={s as unknown as Record<string, unknown>}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            saved()
            await load()
          }}
          onError={(t) => show({ tone: 'error', text: t })}
        />
      ) : null}
    </div>
  )
}

/**
 * Staff upload of a student's photograph.
 *
 * Writes the live photo directly rather than queueing one for approval: a
 * registrar uploading from the admission file IS the approval, and sending it
 * to a queue would mean approving one's own upload.
 *
 * The file input is replaced after every attempt (the `key`), because a
 * browser will not re-fire change for the same file twice — so a failed
 * upload could not be retried by picking the same file again, which is
 * exactly what someone does first.
 */
function PhotoUpload({
  studentId,
  hasPhoto,
  onDone,
  onError,
}: {
  studentId: string
  hasPhoto: boolean
  onDone: (text: string) => void | Promise<void>
  onError: (text: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [nonce, setNonce] = useState(0)

  async function upload(file: File) {
    setBusy(true)
    const body = new FormData()
    body.append('photo', file)
    const res = await api(`/api/admin/photos/${studentId}`, { method: 'PUT', body })
    setBusy(false)
    setNonce((n) => n + 1)
    if (!res.ok) {
      onError(res.error)
      return
    }
    await onDone('Photograph saved.')
  }

  async function remove() {
    if (!window.confirm('Remove this photograph? It will disappear from the results page.')) return
    setBusy(true)
    const res = await del(`/api/admin/photos/${studentId}`)
    setBusy(false)
    if (!res.ok) {
      onError(res.error)
      return
    }
    await onDone('Photograph removed.')
  }

  return (
    <div className="mt-3 border-t border-hair pt-3">
      <label htmlFor="student-photo" className="mb-1 block text-[12px] font-semibold text-jnu-800">
        {hasPhoto ? 'Replace photograph' : 'Upload photograph'}
      </label>
      <input
        key={nonce}
        id="student-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className="w-full text-[12px]"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      <p className="m-0 mt-1 text-[11px] text-muted">
        JPEG, PNG or WebP. Shown on the student&rsquo;s results page, so use the admission
        photograph rather than a snapshot.
      </p>
      {busy ? <p className="m-0 mt-2 text-[12px] text-muted">Uploading…</p> : null}
      {hasPhoto && !busy ? (
        <button type="button" onClick={remove} className="mt-2 text-[12px] text-[#a8322b] underline">
          Remove photograph
        </button>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{value}</dd>
    </div>
  )
}
