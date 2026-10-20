'use client'

import { useCallback, useEffect, useState } from 'react'

import { del, getJson, move, postJson, putJson } from '@/lib/admin-client'
import type { FacultyDTO, ProgrammeDTO } from '@/lib/content-dto'
import { PROGRAMME_MODES } from '@/lib/content-types'
import { BlockEditor } from '@/components/admin/BlockEditor'
import type { Block } from '@/lib/content-types'
import {
  Button,
  Card,
  Check,
  ConfirmButton,
  Field,
  IconButton,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pill,
  Row,
  Select,
  StatusLine,
  Table,
  Td,
  Textarea,
  useStatus,
} from '@/components/admin/ui'

/**
 * Faculties and their programmes.
 *
 * A faculty with no published programme is hidden from search engines — an
 * empty page ranks for nothing and drags the rest down — so this screen says
 * so plainly rather than leaving it a mystery.
 */
export default function ProgrammesPage() {
  const [faculties, setFaculties] = useState<FacultyDTO[] | null>(null)
  const [editingFaculty, setEditingFaculty] = useState<Partial<FacultyDTO> | null>(null)
  const [editingProgramme, setEditingProgramme] = useState<(Partial<ProgrammeDTO> & { facultyId: string }) | null>(null)
  const { status, show, saved } = useStatus()

  const load = useCallback(async () => {
    const res = await getJson<{ faculties: FacultyDTO[] }>('/api/admin/faculties')
    if (res.ok) setFaculties(res.data.faculties)
    else show({ tone: 'error', text: res.error })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function reorder(list: FacultyDTO[]) {
    setFaculties(list)
    await postJson('/api/admin/reorder', { entity: 'faculty', ids: list.map((f) => f.id) })
  }

  async function reorderProgrammes(f: FacultyDTO, list: ProgrammeDTO[]) {
    setFaculties((prev) => (prev ?? []).map((x) => (x.id === f.id ? { ...x, programmes: list } : x)))
    await postJson('/api/admin/reorder', { entity: 'programme', ids: list.map((p) => p.id) })
  }

  async function remove(kind: 'faculties' | 'programmes', id: string, label: string) {
    const res = await del(`/api/admin/${kind}/${id}`)
    if (!res.ok) {
      show({ tone: 'error', text: res.error })
      return
    }
    show({ tone: 'ok', text: `Deleted ${label}.` })
    await load()
  }

  if (faculties === null) return <Loading />

  return (
    <div>
      <PageHeader
        title="Faculties & programmes"
        description="Each faculty has its own page at /programmes/…, listing the programmes below it."
        actions={<Button onClick={() => setEditingFaculty({})}>New faculty</Button>}
      />
      <StatusLine status={status} />

      {faculties.map((f, i) => (
        <Card
          key={f.id}
          title={f.name}
          description={`/programmes/${f.slug}/`}
          actions={
            <>
              <IconButton label="Move up" onClick={() => reorder(move(faculties, i, i - 1))}>
                ↑
              </IconButton>
              <IconButton label="Move down" onClick={() => reorder(move(faculties, i, i + 1))}>
                ↓
              </IconButton>
              <Button variant="secondary" size="sm" onClick={() => setEditingFaculty(f)}>
                Edit
              </Button>
              <Button size="sm" onClick={() => setEditingProgramme({ facultyId: f.id })}>
                Add programme
              </Button>
              <ConfirmButton question={`Delete the faculty "${f.name}"?`} onConfirm={() => remove('faculties', f.id, f.name)}>
                Delete
              </ConfirmButton>
            </>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {f.published ? <Pill tone="ok">Published</Pill> : <Pill tone="muted">Hidden</Pill>}
            {f.programmes.filter((p) => p.published).length === 0 ? (
              <Pill tone="warn">No programmes — page hidden from search engines</Pill>
            ) : null}
            <span className="text-[12px] text-muted">{f.summary}</span>
          </div>

          {f.programmes.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">
              No programmes yet. Add the first one, with its real duration and eligibility.
            </p>
          ) : (
            <Table head={['', 'Programme', 'Award', 'Duration', 'Mode', 'Eligibility', 'Status', '']}>
              {f.programmes.map((p, j) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap">
                    <IconButton label="Move up" onClick={() => reorderProgrammes(f, move(f.programmes, j, j - 1))}>
                      ↑
                    </IconButton>
                    <IconButton label="Move down" onClick={() => reorderProgrammes(f, move(f.programmes, j, j + 1))}>
                      ↓
                    </IconButton>
                  </Td>
                  <Td className="font-semibold">{p.name}</Td>
                  <Td>{p.award}</Td>
                  <Td className="tnum whitespace-nowrap">
                    {p.durationMonths % 12 === 0 ? `${p.durationMonths / 12} yr` : `${p.durationMonths} mo`}
                  </Td>
                  <Td className="whitespace-nowrap">{p.mode}</Td>
                  <Td className="max-w-[320px] text-[12px] text-muted">{p.eligibility}</Td>
                  <Td>{p.published ? <Pill tone="ok">Live</Pill> : <Pill tone="muted">Hidden</Pill>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <button
                      type="button"
                      className="mr-3 text-[12px] text-jnu-700 underline"
                      onClick={() => setEditingProgramme({ ...p, facultyId: f.id })}
                    >
                      Edit
                    </button>
                    <ConfirmButton question={`Delete "${p.name}"?`} onConfirm={() => remove('programmes', p.id, p.name)}>
                      Delete
                    </ConfirmButton>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ))}

      {editingFaculty ? (
        <FacultyModal
          faculty={editingFaculty}
          onClose={() => setEditingFaculty(null)}
          onSaved={async () => {
            setEditingFaculty(null)
            saved()
            await load()
          }}
          onError={(text) => show({ tone: 'error', text })}
        />
      ) : null}

      {editingProgramme ? (
        <ProgrammeModal
          programme={editingProgramme}
          faculties={faculties}
          onClose={() => setEditingProgramme(null)}
          onSaved={async () => {
            setEditingProgramme(null)
            saved()
            await load()
          }}
          onError={(text) => show({ tone: 'error', text })}
        />
      ) : null}
    </div>
  )
}

function FacultyModal({
  faculty,
  onClose,
  onSaved,
  onError,
}: {
  faculty: Partial<FacultyDTO>
  onClose: () => void
  onSaved: () => void
  onError: (t: string) => void
}) {
  const [form, setForm] = useState({
    name: faculty.name ?? '',
    slug: faculty.slug ?? '',
    summary: faculty.summary ?? '',
    published: faculty.published ?? true,
  })
  const [body, setBody] = useState<Block[]>(faculty.body ?? [])
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const payload = { ...form, body }
    const res = faculty.id
      ? await putJson(`/api/admin/faculties/${faculty.id}`, payload)
      : await postJson('/api/admin/faculties', payload)
    setBusy(false)
    if (!res.ok) {
      onError(res.error)
      return
    }
    onSaved()
  }

  return (
    <Modal title={faculty.id ? 'Edit faculty' : 'New faculty'} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="URL name" hint={`The page will be /programmes/${form.slug || '…'}/. Leave empty to make one from the name.`}>
          <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        </Field>
        <Field label="Summary" hint="One or two sentences, shown on the faculty page and in search results.">
          <Textarea rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>
        <Field
          label="Page content"
          hint="Shown below the programme table. Note boxes set to 'Maintainer' are kept here for staff and never appear on the public page."
        >
          <BlockEditor blocks={body} onChange={setBody} />
        </Field>
        <Check
          label="Published"
          checked={form.published}
          onChange={(e) => setForm({ ...form, published: e.target.checked })}
        />
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save faculty'}
        </Button>
      </div>
    </Modal>
  )
}

function ProgrammeModal({
  programme,
  faculties,
  onClose,
  onSaved,
  onError,
}: {
  programme: Partial<ProgrammeDTO> & { facultyId: string }
  faculties: FacultyDTO[]
  onClose: () => void
  onSaved: () => void
  onError: (t: string) => void
}) {
  const [form, setForm] = useState({
    facultyId: programme.facultyId,
    name: programme.name ?? '',
    slug: programme.slug ?? '',
    award: programme.award ?? '',
    durationMonths: programme.durationMonths ?? 36,
    mode: programme.mode ?? 'Full-time',
    eligibility: programme.eligibility ?? '',
    intake: programme.intake ?? '',
    published: programme.published ?? true,
  })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const res = programme.id
      ? await putJson(`/api/admin/programmes/${programme.id}`, form)
      : await postJson('/api/admin/programmes', form)
    setBusy(false)
    if (!res.ok) {
      onError(res.error)
      return
    }
    onSaved()
  }

  return (
    <Modal title={programme.id ? 'Edit programme' : 'New programme'} onClose={onClose} wide>
      <div className="space-y-4">
        <Row>
          <Field label="Faculty" required>
            <Select
              value={form.facultyId}
              options={faculties.map((f) => ({ value: f.id, label: f.name }))}
              onChange={(e) => setForm({ ...form, facultyId: e.target.value })}
            />
          </Field>
          <Field label="Name" required hint="e.g. Bachelor of Business Administration">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Award" required hint="e.g. BBA, B.Tech, M.Pharm">
            <Input value={form.award} onChange={(e) => setForm({ ...form, award: e.target.value })} />
          </Field>
          <Field label="Duration (months)" required hint="36 = three years">
            <Input
              type="number"
              min={1}
              max={120}
              value={form.durationMonths}
              onChange={(e) => setForm({ ...form, durationMonths: Number(e.target.value) })}
            />
          </Field>
          <Field label="Mode" required>
            <Select
              value={form.mode}
              options={PROGRAMME_MODES.map((m) => ({ value: m, label: m }))}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            />
          </Field>
          <Field label="Sanctioned intake" hint="Optional.">
            <Input
              type="number"
              min={1}
              value={form.intake}
              onChange={(e) => setForm({ ...form, intake: e.target.value })}
            />
          </Field>
        </Row>
        <Field
          label="Eligibility"
          required
          hint="What an applicant needs in order to apply. This is the first thing applicants look for, and it is published as structured data."
        >
          <Textarea rows={2} value={form.eligibility} onChange={(e) => setForm({ ...form, eligibility: e.target.value })} />
        </Field>
        <Check label="Published" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save programme'}
        </Button>
      </div>
    </Modal>
  )
}
