'use client'

import { useEffect, useState } from 'react'
import { getJson, move } from '@/lib/admin-client'
import { Modal } from './ui'
import { StudentPicker } from './StudentPicker'
import {
  listResults,
  addResult,
  updateResult,
  setResultPublished,
  deleteResult,
  importResults,
  type ResultRecord,
} from '@/lib/store'
import type { Subject } from '@/lib/store'
import {
  creditTotal,
  emptySubject,
  fromSubject,
  hasSplit,
  subjectObtained,
  subjectProblem,
  gradeFor,
  sgpaFor,
  subjectTotals,
  toSubject,
  type SubjectDraft,
} from '@/lib/results-subjects'

const SEMESTERS = [
  'Semester I', 'Semester II', 'Semester III', 'Semester IV',
  'Semester V', 'Semester VI', 'Semester VII', 'Semester VIII',
]

function emptyForm() {
  return {
    roll_no: '',
    student_name: '',
    programme: '',
    semester: 'Semester IV',
    exam_session: 'Even 2025-26',
    status: 'PASS' as ResultRecord['status'],
    marks_obtained: '',
    marks_max: '',
    sgpa: '',
  }
}

/**
 * Results CRUD plus CSV bulk import.
 *
 * `published` is the control that matters: a row is invisible to students
 * until the exam cell flips it, and adding a result and publishing it are
 * deliberately two separate actions so a bad import can be corrected first.
 */
export function ResultsManager() {
  // Programme names come from Faculties & programmes; this screen only reads
  // them, so it uses the lightweight endpoint rather than the catalogue API.
  const [programmeNames, setProgrammeNames] = useState<string[]>([])
  useEffect(() => {
    void getJson<{ faculties: { programmes: string[] }[] }>('/api/admin/programme-names').then((res) => {
      if (res.ok) setProgrammeNames(res.data.faculties.flatMap((f) => f.programmes))
    })
  }, [])

  const [rows, setRows] = useState<ResultRecord[]>([])
  const [form, setForm] = useState(emptyForm)
  const [subjects, setSubjects] = useState<SubjectDraft[]>([])

  // Null while there are no subject rows, and the two totals are typed by hand
  // as they always were. Once a row exists the totals are summed from the rows
  // instead: the server rejects a grand total that disagrees with its own
  // subjects, so letting both be typed only creates a contradiction to report.
  const addTotals = subjects.length > 0 ? subjectTotals(subjects) : null

  // Null when no subject carries a credit — results filed before credits
  // existed, and rows still being typed. The typed figure stands in that case
  // rather than being overwritten with a guess.
  const addSgpa = sgpaFor(subjects)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<ResultRecord | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  async function load() {
    setRows(await listResults())
  }

  useEffect(() => {
    load()
  }, [])

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)

    if (!form.roll_no.trim() || !form.student_name.trim()) {
      setMsg({ tone: 'err', text: 'Choose a student from the register first.' })
      return
    }

    const problem = subjectProblem(subjects)
    if (problem) {
      setMsg({ tone: 'err', text: problem })
      return
    }

    setBusy(true)
    const res = await addResult({
      roll_no: form.roll_no,
      student_name: form.student_name.trim(),
      programme: form.programme,
      semester: form.semester,
      exam_session: form.exam_session,
      subjects: subjects.map(toSubject),
      marks_obtained: addTotals ? addTotals.obtained : Number(form.marks_obtained) || 0,
      marks_max: addTotals ? addTotals.max : Number(form.marks_max) || 0,
      sgpa: addSgpa ?? (Number(form.sgpa) || 0),
      status: form.status,
    })
    setBusy(false)

    if (!res.ok) {
      setMsg({ tone: 'err', text: res.error })
      return
    }

    setMsg({ tone: 'ok', text: 'Result saved as a draft. Publish it when ready.' })
    setForm(emptyForm())
    setSubjects([])
    load()
  }

  async function togglePublish(row: ResultRecord) {
    await setResultPublished(row.id, !row.published)
    setMsg({
      tone: 'ok',
      text: row.published
        ? `${row.roll_no} is now hidden from students.`
        : `${row.roll_no} is now visible on the results page.`,
    })
    load()
  }

  /**
   * A published result is read-only on purpose: its marksheet may already be
   * printed with a serial that must keep verifying against these figures.
   * Rather than hide the button, say why and name the way round it.
   */
  function startEdit(row: ResultRecord) {
    setMsg(null)
    if (row.published) {
      setMsg({
        tone: 'err',
        text: `Unpublish ${row.roll_no} before editing it. A published result may already be printed with a serial that must keep matching the record.`,
      })
      return
    }
    setEditing(row)
  }

  async function remove(row: ResultRecord) {
    if (!window.confirm(`Delete the result for ${row.roll_no} (${row.semester})? This is logged.`)) {
      return
    }
    await deleteResult(row.id)
    setMsg({ tone: 'ok', text: `Deleted ${row.roll_no}.` })
    load()
  }

  async function publishAllDrafts() {
    const drafts = rows.filter((r) => !r.published)
    if (drafts.length === 0) return
    if (!window.confirm(`Publish ${drafts.length} draft result(s) to the public results page?`)) {
      return
    }
    for (const d of drafts) await setResultPublished(d.id, true)
    setMsg({ tone: 'ok', text: `Published ${drafts.length} result(s).` })
    load()
  }

  /**
   * CSV import. Expected header:
   *   roll_no,student_name,programme,semester,exam_session,marks_obtained,marks_max,sgpa,status
   */
  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true)
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

    if (lines.length < 2) {
      setBusy(false)
      e.target.value = ''
      setMsg({ tone: 'err', text: 'That file has a header but no data rows.' })
      return
    }

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const required = ['roll_no', 'student_name', 'semester', 'exam_session']
    const missing = required.filter((r) => !header.includes(r))

    if (missing.length > 0) {
      setBusy(false)
      e.target.value = ''
      setMsg({ tone: 'err', text: `The CSV is missing required column(s): ${missing.join(', ')}.` })
      return
    }

    /*
     * Two shapes, told apart by the header.
     *
     * Without subject columns: one row per student, exactly as before.
     *
     * With them: ONE ROW PER SUBJECT, the student's own columns repeated on
     * each — which is the shape an exam cell's spreadsheet is already in, and
     * the only flat one that copes with a variable number of papers.
     * (subject1_code, subject2_code … would cap the count and leave most of
     * the sheet empty.) Rows are grouped on roll number + semester + session,
     * because the same student legitimately appears again for another semester.
     */
    const hasSubjectCols = header.some((h) => h.startsWith('subject_'))

    type Draft = {
      roll_no: string; student_name: string; programme: string; semester: string
      exam_session: string; subjects: Subject[]; marks_obtained: number
      marks_max: number; sgpa: number; status: ResultRecord['status']
    }

    const grouped = new Map<string, Draft>()

    for (const line of lines.slice(1)) {
      const cells = line.split(',').map((c) => c.trim())
      const get = (k: string) => cells[header.indexOf(k)] ?? ''
      const num = (k: string) => Number(get(k)) || 0

      const key = `${get('roll_no')}|${get('semester')}|${get('exam_session')}`
      let draft = grouped.get(key)

      if (!draft) {
        draft = {
          roll_no: get('roll_no'),
          student_name: get('student_name'),
          programme: get('programme') || form.programme,
          semester: get('semester'),
          exam_session: get('exam_session'),
          subjects: [],
          marks_obtained: num('marks_obtained'),
          marks_max: num('marks_max'),
          sgpa: num('sgpa'),
          status: ((get('status') || 'PASS').toUpperCase() as ResultRecord['status']),
        }
        grouped.set(key, draft)
      }

      if (!hasSubjectCols) continue

      const code = get('subject_code')
      const name = get('subject_name')
      if (!code && !name) continue

      // Same rule as the form: fill either half and the total is their sum.
      const split = get('subject_theory') !== '' || get('subject_practical') !== ''
      const theory = num('subject_theory')
      const practical = num('subject_practical')

      draft.subjects.push({
        code,
        name,
        max: num('subject_max'),
        obtained: split ? theory + practical : num('subject_obtained'),
        grade: get('subject_grade'),
        ...(get('subject_credits') !== '' ? { credits: num('subject_credits') } : {}),
        ...(split ? { theory, practical } : {}),
      })
    }

    const records = [...grouped.values()].map((d) =>
      // Totals come from the subjects whenever there are any, so a sheet whose
      // own total column disagrees is corrected rather than rejected by the
      // server for a mismatch the typist cannot see from here.
      d.subjects.length === 0
        ? d
        : {
            ...d,
            marks_obtained: d.subjects.reduce((s, x) => s + x.obtained, 0),
            marks_max: d.subjects.reduce((s, x) => s + x.max, 0),
          }
    )

    const n = await importResults(records)
    setBusy(false)
    e.target.value = ''
    setMsg({ tone: 'ok', text: `Imported ${n} row(s) as drafts. Review, then publish.` })
    load()
  }

  function downloadTemplate() {
    // Three rows for one student, one per paper: the subject-wise shape is the
    // one people get wrong from a column list alone, so the template shows it
    // rather than describing it. Delete the subject_* columns and the last two
    // rows to file totals only.
    const csv = [
      'roll_no,student_name,programme,semester,exam_session,status,subject_code,subject_name,subject_max,subject_credits,subject_theory,subject_practical,subject_obtained',
      'JNU2024BT0190,Example Student,B.Tech Computer Science & Engineering,Semester IV,Even 2025-26,PASS,BT-401,Data Structures,100,4,62,18,',
      'JNU2024BT0190,Example Student,B.Tech Computer Science & Engineering,Semester IV,Even 2025-26,PASS,BT-402,Operating Systems,100,4,71,,',
      'JNU2024BT0190,Example Student,B.Tech Computer Science & Engineering,Semester IV,Even 2025-26,PASS,BT-403,Engineering Mathematics III,100,3,,,68',
    ].join('\n')

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'results-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const visible = rows.filter((r) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return (
      r.roll_no.toLowerCase().includes(q) ||
      r.student_name.toLowerCase().includes(q) ||
      r.programme.toLowerCase().includes(q)
    )
  })

  const drafts = rows.filter((r) => !r.published).length

  return (
    <div className="space-y-6">
      {msg ? (
        <p
          role="status"
          className={`m-0 rounded border px-3 py-2 text-[13px] ${
            msg.tone === 'ok'
              ? 'border-[#2c6549]/40 bg-[#2c6549]/5 text-[#2c6549]'
              : 'border-[#a8322b]/40 bg-[#a8322b]/5 text-[#a8322b]'
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      {/* ---- add ---- */}
      <form onSubmit={onAdd} className="panel">
        <h2 className="panel-head m-0">Add a Result</h2>
        <div className="panel-body">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StudentPicker
              id="roll_no"
              label="Student"
              value={form.roll_no}
              onPick={(s) =>
                setForm({
                  ...form,
                  roll_no: s?.rollNo ?? '',
                  // The register is the authority on both. Typing them again
                  // here is how a result ends up under a slightly different
                  // spelling of the same person's name.
                  student_name: s?.fullName ?? '',
                  programme: s?.programme || form.programme,
                })
              }
            />
            <Text id="student_name" label="Student Name" value={form.student_name} onChange={(v) => setForm({ ...form, student_name: v })} readOnly={!!form.roll_no} hint={form.roll_no ? 'From the student register.' : undefined} />

            <Select id="programme" label="Programme" value={form.programme} onChange={(v) => setForm({ ...form, programme: v })} options={programmeNames} />
            <Select id="semester" label="Semester" value={form.semester} onChange={(v) => setForm({ ...form, semester: v })} options={SEMESTERS} />

            <Text id="exam_session" label="Exam Session" value={form.exam_session} onChange={(v) => setForm({ ...form, exam_session: v })} placeholder="Even 2025-26" />
            <Select id="status" label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as ResultRecord['status'] })} options={['PASS', 'FAIL', 'ATKT', 'WITHHELD']} />

            <Text id="marks_obtained" label="Marks Obtained" value={addTotals ? String(addTotals.obtained) : form.marks_obtained} onChange={(v) => setForm({ ...form, marks_obtained: v })} placeholder="412" readOnly={!!addTotals} hint={addTotals ? 'Added up from the subjects below.' : undefined} />
            <Text id="marks_max" label="Maximum Marks" value={addTotals ? String(addTotals.max) : form.marks_max} onChange={(v) => setForm({ ...form, marks_max: v })} placeholder="550" readOnly={!!addTotals} hint={addTotals ? 'Added up from the subjects below.' : undefined} />
            <Text id="sgpa" label="SGPA" value={addSgpa === null ? form.sgpa : addSgpa.toFixed(2)} onChange={(v) => setForm({ ...form, sgpa: v })} placeholder="7.88" readOnly={addSgpa !== null} hint={addSgpa === null ? 'Enter credits per subject to calculate this automatically.' : 'Credit-weighted, from the subjects below.'} />
          </div>

          <SubjectEditor idPrefix="add" value={subjects} onChange={setSubjects} />

          <p className="m-0 mt-3 text-xs text-muted">
            Saved as a draft. Students see nothing until you publish it.
          </p>
          <button type="submit" disabled={busy} className="btn btn-primary mt-3">
            {busy ? 'Saving…' : 'Save as draft'}
          </button>
        </div>
      </form>

      {/* ---- import ---- */}
      <div className="panel">
        <h2 className="panel-head m-0">Bulk Import (CSV)</h2>
        <div className="panel-body">
          <p className="m-0 mb-3 text-[13px] text-muted">
            Required columns: <code className="text-[12px]">roll_no</code>,{' '}
            <code className="text-[12px]">student_name</code>,{' '}
            <code className="text-[12px]">semester</code>,{' '}
            <code className="text-[12px]">exam_session</code>. Optional:{' '}
            <code className="text-[12px]">programme</code>,{' '}
            <code className="text-[12px]">marks_obtained</code>,{' '}
            <code className="text-[12px]">marks_max</code>,{' '}
            <code className="text-[12px]">sgpa</code>,{' '}
            <code className="text-[12px]">status</code>.
          </p>
          <p className="m-0 mb-3 text-[13px] text-muted">
            <strong className="font-semibold text-jnu-800">For subject-wise marks</strong>, add{' '}
            <code className="text-[12px]">subject_code</code>,{' '}
            <code className="text-[12px]">subject_name</code>,{' '}
            <code className="text-[12px]">subject_max</code>,{' '}
            <code className="text-[12px]">subject_theory</code>,{' '}
            <code className="text-[12px]">subject_practical</code>,{' '}
            <code className="text-[12px]">subject_obtained</code>,{' '}
            <code className="text-[12px]">subject_credits</code> and give each paper{' '}
            <strong className="font-semibold text-jnu-800">its own row</strong>, repeating the
            student&rsquo;s columns. Rows are grouped by roll number, semester and session. Fill
            theory and practical and the paper&rsquo;s total is their sum; leave both empty and{' '}
            <code className="text-[12px]">subject_obtained</code> is used instead. Grand totals are
            added up from the subjects, so <code className="text-[12px]">marks_obtained</code> and{' '}
            <code className="text-[12px]">marks_max</code> can be left out, and so can{' '}
            <code className="text-[12px]">sgpa</code> — it is calculated from the credits, and the
            letter grade from the marks.
          </p>
          <p className="m-0 mb-3 text-[13px] text-muted">
            Every roll number must already exist under{' '}
            <strong className="font-semibold text-jnu-800">Students</strong>. The import names any
            that do not and files nothing, because a result with no student record is never visible
            to the student.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onCsv}
              disabled={busy}
              className="text-[13px]"
              aria-label="Choose a CSV file of results"
            />
            <button type="button" onClick={downloadTemplate} className="btn btn-secondary">
              Download template
            </button>
          </div>
        </div>
      </div>

      {/* ---- list ---- */}
      <div className="panel">
        <h2 className="panel-head m-0 flex flex-wrap items-center justify-between gap-2">
          <span>Results</span>
          <span className="tnum text-[11px] font-normal text-muted">
            {rows.length} total · {drafts} draft
          </span>
        </h2>
        <div className="panel-body">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by roll number, name or programme"
              aria-label="Filter results"
              className="w-full max-w-[320px] rounded border border-hair px-2.5 py-1.5 text-[13px] focus:border-jnu-400"
            />
            {drafts > 0 ? (
              <button type="button" onClick={publishAllDrafts} className="btn btn-secondary">
                Publish all {drafts} drafts
              </button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-left">Roll No.</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-left">Name</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-left">Semester</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-left">Session</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-right">SGPA</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-left">Status</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-left">Visible</th>
                  <th className="border-b border-hair bg-shell px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted">
                      No results match that filter.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.id}>
                      <td className="tnum border-b border-hair px-3 py-2 font-semibold">{r.roll_no}</td>
                      <td className="border-b border-hair px-3 py-2">{r.student_name}</td>
                      <td className="whitespace-nowrap border-b border-hair px-3 py-2">{r.semester}</td>
                      <td className="whitespace-nowrap border-b border-hair px-3 py-2">{r.exam_session}</td>
                      <td className="tnum border-b border-hair px-3 py-2 text-right">{r.sgpa.toFixed(2)}</td>
                      <td className="border-b border-hair px-3 py-2">{r.status}</td>
                      <td className="border-b border-hair px-3 py-2">
                        <span
                          className={`rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                            r.published ? 'border-[#2c6549] text-[#2c6549]' : 'border-hair text-muted'
                          }`}
                        >
                          {r.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap border-b border-hair px-3 py-2 text-right">
                        <button type="button" onClick={() => startEdit(r)} className="mr-3 text-jnu-600 underline">
                          Edit
                        </button>
                        <button type="button" onClick={() => togglePublish(r)} className="mr-3 text-jnu-600 underline">
                          {r.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button type="button" onClick={() => remove(r)} className="text-[#a8322b] underline">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {editing ? (
        <EditResultModal
          row={editing}
          programmeNames={programmeNames}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null)
            setMsg({ tone: 'ok', text })
            load()
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * Editing a draft result. The roll number is deliberately not editable: it is
 * half of the student's login credential and the key the result is matched
 * on. A result filed against the wrong student is a delete and a re-entry,
 * not an edit, so the audit trail shows both.
 */
function EditResultModal({
  row,
  programmeNames,
  onClose,
  onSaved,
}: {
  row: ResultRecord
  programmeNames: string[]
  onClose: () => void
  onSaved: (text: string) => void
}) {
  const [form, setForm] = useState({
    student_name: row.student_name,
    programme: row.programme,
    semester: row.semester,
    exam_session: row.exam_session,
    status: row.status,
    marks_obtained: String(row.marks_obtained),
    marks_max: String(row.marks_max),
    sgpa: String(row.sgpa),
  })
  const [subjects, setSubjects] = useState<SubjectDraft[]>(() => (row.subjects ?? []).map(fromSubject))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = subjects.length > 0 ? subjectTotals(subjects) : null
  const autoSgpa = sgpaFor(subjects)

  async function save() {
    if (!form.student_name.trim()) {
      setError('Student name is required.')
      return
    }
    const problem = subjectProblem(subjects)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    const res = await updateResult(row.id, {
      student_name: form.student_name.trim(),
      programme: form.programme,
      semester: form.semester,
      exam_session: form.exam_session,
      subjects: subjects.map(toSubject),
      marks_obtained: totals ? totals.obtained : Number(form.marks_obtained) || 0,
      marks_max: totals ? totals.max : Number(form.marks_max) || 0,
      sgpa: autoSgpa ?? (Number(form.sgpa) || 0),
      status: form.status,
      published_at: row.published_at,
      serial: row.serial,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onSaved(`Updated ${row.roll_no}. It is still a draft — publish it when the figures are right.`)
  }

  return (
    <Modal title={`Edit result — ${row.roll_no}`} onClose={onClose} wide>
      {error ? (
        <p role="alert" className="m-0 mb-3 rounded border border-[#a8322b]/40 bg-[#a8322b]/5 px-3 py-2 text-[13px] text-[#a8322b]">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Text id="edit_student_name" label="Student Name" value={form.student_name} onChange={(v) => setForm({ ...form, student_name: v })} />
        <Select id="edit_programme" label="Programme" value={form.programme} onChange={(v) => setForm({ ...form, programme: v })} options={programmeNames} />
        <Select id="edit_semester" label="Semester" value={form.semester} onChange={(v) => setForm({ ...form, semester: v })} options={SEMESTERS} />
        <Text id="edit_exam_session" label="Exam Session" value={form.exam_session} onChange={(v) => setForm({ ...form, exam_session: v })} />
        <Select id="edit_status" label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as ResultRecord['status'] })} options={['PASS', 'FAIL', 'ATKT', 'WITHHELD']} />
        <Text id="edit_marks_obtained" label="Marks Obtained" value={totals ? String(totals.obtained) : form.marks_obtained} onChange={(v) => setForm({ ...form, marks_obtained: v })} readOnly={!!totals} hint={totals ? 'Added up from the subjects below.' : undefined} />
        <Text id="edit_marks_max" label="Maximum Marks" value={totals ? String(totals.max) : form.marks_max} onChange={(v) => setForm({ ...form, marks_max: v })} readOnly={!!totals} hint={totals ? 'Added up from the subjects below.' : undefined} />
        <Text id="edit_sgpa" label="SGPA" value={autoSgpa === null ? form.sgpa : autoSgpa.toFixed(2)} onChange={(v) => setForm({ ...form, sgpa: v })} readOnly={autoSgpa !== null} hint={autoSgpa === null ? 'Enter credits per subject to calculate this automatically.' : 'Credit-weighted, from the subjects below.'} />
      </div>

      <SubjectEditor idPrefix="edit" value={subjects} onChange={setSubjects} />

      <p className="m-0 mt-3 text-xs text-muted">
        Roll number cannot be changed here. Obtained marks may not exceed the maximum.
      </p>
      <button type="button" onClick={save} disabled={busy} className="btn btn-primary mt-3">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </Modal>
  )
}

function Text({
  id, label, value, onChange, placeholder, readOnly, hint,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  placeholder?: string; readOnly?: boolean; hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-jnu-800">{label}</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        // readOnly rather than disabled: a disabled box is skipped by the tab
        // order and read out as unavailable, when the value is in fact the
        // point — it is the figure that will be filed.
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded border border-hair px-2.5 py-1.5 text-[13px] focus:border-jnu-400 ${
          readOnly ? 'bg-shell text-muted' : ''
        }`}
      />
      {hint ? <p id={`${id}-hint`} className="m-0 mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}

/**
 * The subject-wise marks for one result.
 *
 * Nothing here is required: a result with no subject rows files exactly as it
 * did before this existed, with a total and no breakdown, and its marksheet
 * prints the totals row alone. Adding rows switches the grand total over to
 * the sum of them.
 *
 * Theory and Practical are optional per row. Fill either and the row's Total
 * becomes their sum and stops being typed — the server requires theory +
 * practical to equal the total exactly, so there is no version of this where
 * typing all three helps. Leave both empty and the row keeps a single total,
 * which is how a paper with no practical component is filed; the marksheet
 * then prints that total under Theory and an em dash under Practical.
 */
function SubjectEditor({
  idPrefix, value, onChange,
}: {
  idPrefix: string
  value: SubjectDraft[]
  onChange: (next: SubjectDraft[]) => void
}) {
  const set = (i: number, patch: Partial<SubjectDraft>) =>
    onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const totals = subjectTotals(value)

  return (
    <fieldset className="mt-4 rounded border border-hair p-3">
      <legend className="px-1 text-[12px] font-semibold text-jnu-800">
        Subject-wise marks <span className="font-normal text-muted">— optional</span>
      </legend>

      {value.length === 0 ? (
        <p className="m-0 mb-3 text-[12px] text-muted">
          No subjects. The marksheet will show the grand total only. Add a row to print a
          subject table with theory and practical columns.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="border-b border-hair px-1.5 py-1 text-left font-semibold">#</th>
                <th className="border-b border-hair px-1.5 py-1 text-left font-semibold">Code</th>
                <th className="border-b border-hair px-1.5 py-1 text-left font-semibold">Subject</th>
                <th className="border-b border-hair px-1.5 py-1 text-right font-semibold">Max</th>
                <th className="border-b border-hair px-1.5 py-1 text-right font-semibold">Theory</th>
                <th className="border-b border-hair px-1.5 py-1 text-right font-semibold">Practical</th>
                <th className="border-b border-hair px-1.5 py-1 text-right font-semibold">Total</th>
                <th className="border-b border-hair px-1.5 py-1 text-right font-semibold">Credits</th>
                <th className="border-b border-hair px-1.5 py-1 text-left font-semibold">Grade</th>
                <th className="border-b border-hair px-1.5 py-1" />
              </tr>
            </thead>
            <tbody>
              {value.map((d, i) => {
                const split = hasSplit(d)
                const obtained = subjectObtained(d)
                const max = Number(d.max) || 0
                const over = max > 0 && obtained > max
                return (
                  <tr key={i}>
                    <td className="tnum border-b border-hair px-1.5 py-1 text-muted">{i + 1}.</td>
                    <td className="border-b border-hair px-1.5 py-1">
                      <Cell id={`${idPrefix}_code_${i}`} label={`Subject code, row ${i + 1}`} value={d.code} onChange={(v) => set(i, { code: v })} width="w-24" placeholder="BT-401" />
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      <Cell id={`${idPrefix}_name_${i}`} label={`Subject name, row ${i + 1}`} value={d.name} onChange={(v) => set(i, { name: v })} width="w-full min-w-[9rem]" placeholder="Data Structures" />
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      <Cell id={`${idPrefix}_max_${i}`} label={`Maximum marks, row ${i + 1}`} value={d.max} onChange={(v) => set(i, { max: v })} width="w-16" numeric />
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      <Cell id={`${idPrefix}_theory_${i}`} label={`Theory marks, row ${i + 1}`} value={d.theory} onChange={(v) => set(i, { theory: v })} width="w-16" numeric />
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      <Cell id={`${idPrefix}_practical_${i}`} label={`Practical marks, row ${i + 1}`} value={d.practical} onChange={(v) => set(i, { practical: v })} width="w-16" numeric />
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      {split ? (
                        <span className={`tnum block w-16 px-1 py-1 text-right ${over ? 'font-semibold text-[#a8322b]' : 'text-muted'}`}>
                          {obtained}
                        </span>
                      ) : (
                        <Cell id={`${idPrefix}_obtained_${i}`} label={`Total marks, row ${i + 1}`} value={d.obtained} onChange={(v) => set(i, { obtained: v })} width="w-16" numeric invalid={over} />
                      )}
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      <Cell id={`${idPrefix}_credits_${i}`} label={`Credits, row ${i + 1}`} value={d.credits} onChange={(v) => set(i, { credits: v })} width="w-14" numeric placeholder="4" />
                    </td>
                    <td className="border-b border-hair px-1.5 py-1">
                      {/* Derived from the marks: a letter that disagrees with
                          its own percentage is only ever an error. */}
                      <span className="block w-14 px-1 py-1 font-semibold text-jnu-800">{gradeFor(d)}</span>
                    </td>
                    <td className="whitespace-nowrap border-b border-hair px-1.5 py-1 text-right">
                      <button type="button" onClick={() => onChange(move(value, i, i - 1))} disabled={i === 0} className="mr-1 px-1 text-jnu-600 disabled:opacity-30" aria-label={`Move row ${i + 1} up`}>↑</button>
                      <button type="button" onClick={() => onChange(move(value, i, i + 1))} disabled={i === value.length - 1} className="mr-1 px-1 text-jnu-600 disabled:opacity-30" aria-label={`Move row ${i + 1} down`}>↓</button>
                      <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="px-1 text-[#a8322b]" aria-label={`Remove row ${i + 1}`}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="px-1.5 py-1.5 text-right font-semibold">Grand total</td>
                <td className="tnum px-1.5 py-1.5 text-right font-semibold">{totals.max}</td>
                <td colSpan={2} />
                <td className="tnum px-1.5 py-1.5 text-right font-semibold">{totals.obtained}</td>
                <td className="tnum px-1.5 py-1.5 text-right font-semibold">{creditTotal(value) || ''}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, emptySubject()])}
        className="btn btn-secondary mt-3"
      >
        Add subject
      </button>
    </fieldset>
  )
}

/** One box inside the subject table. Labelled for screen readers only. */
function Cell({
  id, label, value, onChange, width, placeholder, numeric, invalid,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  width: string; placeholder?: string; numeric?: boolean; invalid?: boolean
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        // inputMode rather than type="number": a number input in Chrome
        // silently discards the value on a stray scroll wheel, and this is a
        // grid people tab through at speed with a mark sheet beside them.
        inputMode={numeric ? 'numeric' : undefined}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className={`${width} ${numeric ? 'tnum text-right' : ''} rounded border px-1.5 py-1 text-[12px] focus:border-jnu-400 ${
          invalid ? 'border-[#a8322b] bg-[#a8322b]/5' : 'border-hair'
        }`}
      />
    </>
  )
}

function Select({
  id, label, value, onChange, options,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-jnu-800">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-hair px-2.5 py-1.5 text-[13px] focus:border-jnu-400"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}
