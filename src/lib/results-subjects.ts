import type { Subject } from '@/lib/store'

/**
 * A subject row while it is being typed.
 *
 * Every field is a string, including the numbers. A half-typed "1" in a marks
 * box is not a number yet, and storing these as numbers meant an empty box
 * became 0 and a deleted digit became NaN — both of which then failed
 * validation for reasons the typist could not see. They convert once, on save.
 */
export type SubjectDraft = {
  code: string
  name: string
  max: string
  theory: string
  practical: string
  obtained: string
  grade: string
}

export const emptySubject = (): SubjectDraft => ({
  code: '', name: '', max: '', theory: '', practical: '', obtained: '', grade: '',
})

/** Is this row using the theory/practical split, or a single total? */
export const hasSplit = (d: SubjectDraft) => d.theory.trim() !== '' || d.practical.trim() !== ''

/**
 * What the row scores. With the split in use this is theory + practical and
 * the Total box is not typed at all — the server requires the two to agree
 * exactly, so deriving it removes the only way to get that wrong.
 */
export function subjectObtained(d: SubjectDraft): number {
  if (hasSplit(d)) return (Number(d.theory) || 0) + (Number(d.practical) || 0)
  return Number(d.obtained) || 0
}

export function toSubject(d: SubjectDraft): Subject {
  const obtained = subjectObtained(d)
  return {
    code: d.code.trim(),
    name: d.name.trim(),
    max: Number(d.max) || 0,
    obtained,
    grade: d.grade.trim(),
    // Only written when actually used: a row without the split prints its
    // total in the Theory column and an em dash under Practical, which is how
    // a paper with no practical component is meant to read.
    ...(hasSplit(d) ? { theory: Number(d.theory) || 0, practical: Number(d.practical) || 0 } : {}),
  }
}

export function fromSubject(s: Subject): SubjectDraft {
  const split = typeof s.theory === 'number' || typeof s.practical === 'number'
  return {
    code: s.code ?? '',
    name: s.name ?? '',
    max: String(s.max ?? ''),
    theory: split ? String(s.theory ?? 0) : '',
    practical: split ? String(s.practical ?? 0) : '',
    obtained: split ? '' : String(s.obtained ?? ''),
    grade: s.grade ?? '',
  }
}

/** Grand totals, summed from the rows. */
export function subjectTotals(list: SubjectDraft[]) {
  return list.reduce(
    (acc, d) => ({ obtained: acc.obtained + subjectObtained(d), max: acc.max + (Number(d.max) || 0) }),
    { obtained: 0, max: 0 }
  )
}

/**
 * Client-side check, phrased for the person typing.
 *
 * The server checks all of this too and is the authority — this exists so the
 * exam cell finds out at the row that is wrong, rather than being told after
 * a round trip that "the grand total does not match the subjects".
 */
export function subjectProblem(list: SubjectDraft[]): string | null {
  for (const [i, d] of list.entries()) {
    const where = d.code.trim() || d.name.trim() || `row ${i + 1}`
    if (!d.code.trim() && !d.name.trim()) return `Subject row ${i + 1} needs a code or a name.`
    const max = Number(d.max)
    if (!Number.isFinite(max) || max <= 0) return `${where}: maximum marks must be a number above zero.`
    const obtained = subjectObtained(d)
    if (obtained < 0) return `${where}: marks cannot be negative.`
    if (obtained > max) return `${where}: ${obtained} out of ${max} — obtained cannot exceed the maximum.`
  }
  return null
}
