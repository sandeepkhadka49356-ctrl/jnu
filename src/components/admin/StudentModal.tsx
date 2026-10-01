'use client'

import { useEffect, useState } from 'react'

import { getJson, postJson, putJson } from '@/lib/admin-client'
import { Button, Field, Input, Modal, Row, Select, Textarea } from './ui'
import { STUDENT_STATUSES } from '@/lib/student-constants'

/**
 * Add or edit a student. Used from the register and from the student page.
 *
 * The roll number and date of birth are the student's sign-in credential and
 * what certificate verification checks, so the form says so rather than
 * leaving staff to find out when a student cannot sign in.
 */
export function StudentModal({
  student,
  onClose,
  onSaved,
  onError,
}: {
  student?: Record<string, unknown>
  onClose: () => void
  onSaved: () => void
  onError: (t: string) => void
}) {
  const [form, setForm] = useState({
    rollNo: (student?.rollNo as string) ?? '',
    enrollmentNo: (student?.enrollmentNo as string) ?? '',
    fullName: (student?.fullName as string) ?? '',
    fatherName: (student?.fatherName as string) ?? '',
    motherName: (student?.motherName as string) ?? '',
    dob: (student?.dob as string) ?? '',
    programme: (student?.programme as string) ?? '',
    status: (student?.status as string) ?? 'ACTIVE',
    mobile: (student?.mobile as string) ?? '',
    email: (student?.email as string) ?? '',
    addressLine: (student?.addressLine as string) ?? '',
    district: (student?.district as string) ?? '',
    state: (student?.state as string) ?? '',
    pincode: (student?.pincode as string) ?? '',
  })
  const [busy, setBusy] = useState(false)
  const id = student?.id as string | undefined

  /*
   * Numbering.
   *
   * Offered, never imposed: the proposal fills two boxes that stay editable.
   * Students transfer in carrying a number from elsewhere, paper registers get
   * reconciled years later, and blocks are sometimes reserved in advance — a
   * generator that could not be overruled would be worked around rather than
   * used.
   *
   * Only for new students. Changing an existing roll number silently breaks
   * that student's sign-in and every result and certificate matched to it, so
   * the button is not offered on an edit.
   */
  const [programmes, setProgrammes] = useState<string[]>([])
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [numbering, setNumbering] = useState(false)
  const [numberNote, setNumberNote] = useState<string | null>(null)

  useEffect(() => {
    if (id) return
    void getJson<{ faculties: { programmes: string[] }[] }>('/api/admin/programme-names').then((res) => {
      if (res.ok) setProgrammes(res.data.faculties.flatMap((f) => f.programmes))
    })
  }, [id])

  async function generate() {
    setNumberNote(null)
    if (!form.programme) {
      setNumberNote('Choose a programme first — the code comes from it.')
      return
    }
    setNumbering(true)
    const res = await getJson<{ rollNo: string; enrollmentNo: string; serial: number; code: string }>(
      `/api/admin/next-student-number?programme=${encodeURIComponent(form.programme)}&year=${encodeURIComponent(year)}`
    )
    setNumbering(false)
    if (!res.ok) {
      setNumberNote(res.error)
      return
    }
    setForm((f) => ({ ...f, rollNo: res.data.rollNo, enrollmentNo: res.data.enrollmentNo }))
    setNumberNote(
      `Proposed ${res.data.code} number ${res.data.serial} for ${year}. Edit either box if the register says otherwise.`
    )
  }

  async function save() {
    setBusy(true)
    const res = id
      ? await putJson(`/api/admin/students/${id}`, form)
      : await postJson('/api/admin/students', form)
    setBusy(false)
    if (!res.ok) {
      onError(res.error)
      return
    }
    onSaved()
  }

  return (
    <Modal title={id ? 'Edit student' : 'Add student'} onClose={onClose} wide>
      <div className="space-y-4">
        {!id ? (
          <div className="rounded border border-hair bg-shell px-3 py-2">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Admission year">
                <Input
                  value={year}
                  inputMode="numeric"
                  onChange={(e) => setYear(e.target.value)}
                  className="w-24"
                />
              </Field>
              <Button variant="secondary" onClick={generate} disabled={numbering}>
                {numbering ? 'Checking…' : 'Generate numbers'}
              </Button>
              <p className="m-0 text-[12px] text-muted">
                Fills both boxes below from the programme and year — JNU2024BT0190. Both stay
                editable.
              </p>
            </div>
            {numberNote ? (
              <p role="status" className="m-0 mt-2 text-[12px] text-jnu-700">
                {numberNote}
              </p>
            ) : null}
          </div>
        ) : null}

        <Row cols={3}>
          <Field label="Roll number" required hint="Used to sign in. Letters, digits, / and -.">
            <Input value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} />
          </Field>
          <Field label="Enrollment number" required>
            <Input value={form.enrollmentNo} onChange={(e) => setForm({ ...form, enrollmentNo: e.target.value })} />
          </Field>
          <Field label="Date of birth" required hint="The other half of the student's sign-in. Check it carefully.">
            <Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          </Field>
          <Field label="Full name" required>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </Field>
          <Field label="Father's name" required>
            <Input value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
          </Field>
          <Field label="Mother's name" required>
            <Input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} />
          </Field>
          <Field label="Programme" required>
            {/* A list for new students, because the numbering reads the
                programme's award to work out its code and a typo would mean
                no code at all. Existing students keep a free-text box: their
                programme may predate the current catalogue, and silently
                blanking it on an unrelated edit would be worse than a typo. */}
            {!id && programmes.length > 0 ? (
              <Select
                value={form.programme}
                options={[{ value: '', label: 'Choose…' }, ...programmes.map((p) => ({ value: p, label: p }))]}
                onChange={(e) => setForm({ ...form, programme: e.target.value })}
              />
            ) : (
              <Input value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })} />
            )}
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              options={STUDENT_STATUSES.map((s) => ({ value: s, label: s }))}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            />
          </Field>
        </Row>

        <details className="rounded border border-hair p-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-jnu-800">Contact details</summary>
          <Row cols={3}>
            <Field label="Mobile">
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="District">
              <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
            </Field>
            <Field label="State">
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </Field>
            <Field label="PIN code">
              <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
            </Field>
            <Field label="Address" full>
              <Textarea rows={2} value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} />
            </Field>
          </Row>
        </details>

        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save student'}
        </Button>
      </div>
    </Modal>
  )
}
