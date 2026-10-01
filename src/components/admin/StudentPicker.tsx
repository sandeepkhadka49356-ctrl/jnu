'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { getJson } from '@/lib/admin-client'

/**
 * Pick a student from the register by roll number or name.
 *
 * Results used to take a typed roll number. Nothing checked it against the
 * register, and nothing could: the exam cell has the mark sheet in front of
 * them, not the roll list. A result filed against a roll number with no
 * student saves, publishes, and is then invisible to that student for ever,
 * because /api/results/lookup matches a Result to a Student before it shows
 * anything. The first symptom is a candidate being told their result does not
 * exist. Choosing from the register instead makes that state unreachable.
 *
 * Searching rather than a <select>: a university's register is thousands of
 * rows, and a dropdown of thousands is not a control, it is a wall. The
 * endpoint already filters on roll number, enrolment number and name, and
 * pages at 25 — so this sends what was typed and shows what comes back.
 *
 * Permission is not a concern here: students.view and results.manage are held
 * by exactly the same roles (admin, registrar, exam_cell), so anyone who can
 * reach this screen can already read the register.
 */

export type PickedStudent = {
  rollNo: string
  fullName: string
  programme: string
}

type Row = PickedStudent & { id: string; enrollmentNo: string | null }

export function StudentPicker({
  id,
  label,
  value,
  onPick,
}: {
  id: string
  label: string
  /** The roll number currently chosen, or '' for none. */
  value: string
  onPick: (student: PickedStudent | null) => void
}) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [searched, setSearched] = useState(false)
  const [total, setTotal] = useState(0)

  const listId = useId()
  const boxRef = useRef<HTMLDivElement>(null)

  /*
   * Debounced, and every response carries the query it was for. Without that
   * check a slow request for "JNU20" can land after a fast one for
   * "JNU2024BT0190" and replace the right list with a stale one — the classic
   * way a type-ahead shows results for something you have already finished
   * typing.
   */
  useEffect(() => {
    if (!open) return

    let current = true
    setLoading(true)
    // No minimum length. Opening the box with nothing typed lists the first
    // page of the register, so there is something to choose from rather than
    // an empty box that looks broken; typing narrows it.
    const t = setTimeout(async () => {
      const res = await getJson<{ students: Row[]; total: number }>(
        `/api/admin/students?q=${encodeURIComponent(query.trim())}`
      )
      if (!current) return
      setLoading(false)
      setSearched(true)
      setRows(res.ok ? res.data.students : [])
      setTotal(res.ok ? res.data.total : 0)
      setActive(0)
    }, query.trim() === '' ? 0 : 250)

    return () => {
      current = false
      clearTimeout(t)
    }
  }, [query, open])

  // Clicking anywhere else closes the list. A type-ahead left hanging over the
  // rest of the form is worse than one that shuts eagerly.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function choose(row: Row) {
    onPick({ rollNo: row.rollNo, fullName: row.fullName, programme: row.programme })
    setQuery('')
    setRows([])
    setOpen(false)
    setSearched(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || rows.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + rows.length) % rows.length)
    } else if (e.key === 'Enter') {
      // Only swallow Enter when it is choosing someone, so the key still
      // submits the form the rest of the time.
      e.preventDefault()
      choose(rows[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Chosen: show who, and a way to change it. The input is gone at this point
  // on purpose — there is nothing left to type.
  if (value) {
    return (
      <div>
        <span className="mb-1 block text-[12px] font-semibold text-jnu-800">{label}</span>
        <div className="flex items-center gap-2 rounded border border-hair bg-shell px-2.5 py-1.5">
          <span className="tnum text-[13px] font-semibold text-jnu-800">{value}</span>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="ml-auto text-[12px] text-jnu-600 underline"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-[12px] font-semibold text-jnu-800">
        {label}
      </label>
      <input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Click to list students, or type a roll number or name"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows.length > 0 ? `${listId}-${active}` : undefined}
        className="w-full rounded border border-hair px-2.5 py-1.5 text-[13px] focus:border-jnu-400"
      />

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching students"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded border border-hair bg-white shadow-chrome"
        >
          {loading ? (
            <li className="px-3 py-2 text-[12px] text-muted">Searching…</li>
          ) : rows.length === 0 ? (
            // Only after a search has actually come back, so the first
            // keystroke does not flash "no students" at someone mid-word.
            searched ? (
              <li className="px-3 py-2 text-[12px] text-muted">
                {query.trim()
                  ? 'No student matches that. Check the roll number, or add the student under Students.'
                  : 'The student register is empty. Add a student under Students first.'}
              </li>
            ) : null
          ) : (
            rows.map((r, i) => (
              <li key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                  className={`block w-full px-3 py-2 text-left text-[12px] ${
                    i === active ? 'bg-shell' : 'bg-white'
                  }`}
                >
                  <span className="tnum font-semibold text-jnu-800">{r.rollNo}</span>
                  <span className="text-jnu-700"> — {r.fullName}</span>
                  {r.programme ? <span className="block text-muted">{r.programme}</span> : null}
                </button>
              </li>
            ))
          )}

          {/* The endpoint pages at 25. Without saying so, a register of two
              thousand looks like a register of twenty-five and the student
              being searched for looks absent. */}
          {!loading && total > rows.length ? (
            <li className="border-t border-hair px-3 py-2 text-[11px] text-muted">
              Showing {rows.length} of {total}. Type to narrow the list.
            </li>
          ) : null}
        </ul>
      ) : null}

      <p className="m-0 mt-1 text-[11px] text-muted">
        Only registered students can be given a result.
      </p>
    </div>
  )
}
