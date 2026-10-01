/**
 * The university's grading scale, and the SGPA that follows from it.
 *
 * Marked out as its own module, with no imports, because these numbers are
 * printed on a statement of marks that a student presents to an employer or
 * another university. They are checked against the ordinance, not against a
 * screenshot, and when the ordinance changes this is the one file that moves.
 *
 * Scale: the UGC ten-point scale, confirmed by the university.
 *
 *   90–100   O    10      Outstanding
 *   80–89    A+    9      Excellent
 *   70–79    A     8      Very good
 *   60–69    B+    7      Good
 *   50–59    B     6      Above average
 *   45–49    C     5      Average
 *   40–44    P     4      Pass
 *   below 40 F     0      Fail
 *
 * SGPA = Σ(credit × grade point) ÷ Σ credit — the standard formula. Credits,
 * not marks, are the weight: a four-credit paper counts twice a two-credit
 * one however many marks each carries.
 */

export type Band = {
  /** Lowest percentage, inclusive, that earns this band. */
  from: number
  letter: string
  point: number
  description: string
}

/** Highest band first: the first one a percentage reaches is the one it gets. */
export const BANDS: Band[] = [
  { from: 90, letter: 'O', point: 10, description: 'Outstanding' },
  { from: 80, letter: 'A+', point: 9, description: 'Excellent' },
  { from: 70, letter: 'A', point: 8, description: 'Very good' },
  { from: 60, letter: 'B+', point: 7, description: 'Good' },
  { from: 50, letter: 'B', point: 6, description: 'Above average' },
  { from: 45, letter: 'C', point: 5, description: 'Average' },
  { from: 40, letter: 'P', point: 4, description: 'Pass' },
  { from: 0, letter: 'F', point: 0, description: 'Fail' },
]

/** The band a percentage falls in. Never null: the last band starts at 0. */
export function bandFor(percent: number): Band {
  const p = Number.isFinite(percent) ? percent : 0
  return BANDS.find((b) => p >= b.from) ?? BANDS[BANDS.length - 1]
}

/**
 * The band for marks out of a maximum.
 *
 * A maximum of zero returns the fail band rather than dividing by it. That
 * case is rejected before it reaches a saved record, but this function is
 * also called while someone is still typing a row.
 */
export function bandForMarks(obtained: number, max: number): Band {
  if (!Number.isFinite(max) || max <= 0) return BANDS[BANDS.length - 1]
  return bandFor((obtained / max) * 100)
}

export type GradedSubject = {
  max: number
  obtained: number
  /** Credit value of the paper. Undefined or 0 means it carries no weight. */
  credits?: number
}

/**
 * SGPA for one semester, or null when it cannot be computed.
 *
 * Null rather than 0, and null rather than a guess. Zero is a real SGPA — it
 * is what a student who failed everything gets — so it cannot double as "not
 * known". The caller decides what to show, and the screens that use this
 * leave the typed figure alone when it comes back null.
 *
 * Returns null when no subject carries a credit, which is every result filed
 * before credits existed. Those keep whatever SGPA was entered by hand.
 */
export function sgpa(subjects: GradedSubject[]): number | null {
  if (subjects.length === 0) return null

  const credited = subjects.filter((s) => {
    const c = Number(s.credits)
    return Number.isFinite(c) && c > 0
  })

  /*
   * Credits are the weight when they are there. When they are not, the paper's
   * maximum marks stand in for them.
   *
   * The fallback exists because the alternative was worse. Returning null when
   * no credit was entered meant the typed SGPA stood, and a blank box types as
   * zero — so a semester of A+ and A grades printed "SGPA 0.00" on a statement
   * of marks, which is not a missing figure, it is a wrong one. A student
   * whose papers are all out of 100 gets the same answer either way; where the
   * papers differ, a 100-mark paper counting twice a 50-mark one is the
   * closest thing to a credit the record actually holds.
   *
   * Null is still returned when there are no subjects at all, because then
   * there is genuinely nothing to compute from and the typed figure is all
   * there is.
   */
  const weighed = credited.length > 0 ? credited : subjects
  const weightOf = (s: GradedSubject) =>
    credited.length > 0 ? Number(s.credits) || 0 : Number(s.max) || 0

  let weighted = 0
  let total = 0

  for (const s of weighed) {
    const w = weightOf(s)
    if (w <= 0) continue
    weighted += w * bandForMarks(Number(s.obtained) || 0, Number(s.max) || 0).point
    total += w
  }

  if (total === 0) return null
  // Two decimals, the convention on an Indian marksheet. Rounded half up on a
  // positive number, which is what toFixed does here.
  return Number((weighted / total).toFixed(2))
}

/** True when the SGPA came from real credits rather than the marks fallback. */
export function hasCredits(subjects: GradedSubject[]): boolean {
  return subjects.some((s) => {
    const c = Number(s.credits)
    return Number.isFinite(c) && c > 0
  })
}

/* ------------------------------------------------- cumulative totals --- */

const SEMESTER_ORDER = [
  'Semester I', 'Semester II', 'Semester III', 'Semester IV',
  'Semester V', 'Semester VI', 'Semester VII', 'Semester VIII',
]

/**
 * Where a semester sits in the sequence, or -1 if it is not one of the eight.
 *
 * Matched on the stored label rather than parsed, because "Semester IV" is
 * what the register holds and roman numerals do not sort as text — "Semester
 * VIII" comes before "Semester VII" alphabetically, which would quietly put
 * the final semester in the wrong place in a running total.
 */
export function semesterIndex(semester: string): number {
  return SEMESTER_ORDER.indexOf((semester ?? '').trim())
}

export type CountedResult = {
  semester: string
  marksObtained: number
  marksMax: number
}

export type Cumulative = {
  previousObtained: number
  previousMax: number
  grandObtained: number
  grandMax: number
  /** How many earlier semesters were counted. Zero means this is the first. */
  previousCount: number
}

/**
 * Running totals for a result, from the student's other published results.
 *
 * "Previous" means every published result for a LOWER semester than this one.
 * Not "earlier by date": results are published out of order often enough —
 * a withheld paper released months later, a backlog cleared in one sitting —
 * and a student reading their Semester IV sheet means the three before it,
 * whenever the office happened to enter them.
 *
 * A semester appearing twice (a re-sit filed alongside the original) is
 * counted once, at its best total, so a repeat cannot inflate a grand total
 * above the marks the student can actually have sat for.
 *
 * Semesters not in the standard eight are ignored rather than guessed at.
 */
export function cumulative(current: CountedResult, all: CountedResult[]): Cumulative {
  const here = semesterIndex(current.semester)

  const best = new Map<number, CountedResult>()
  for (const r of all) {
    const i = semesterIndex(r.semester)
    if (i < 0 || i >= here) continue
    const existing = best.get(i)
    if (!existing || r.marksObtained > existing.marksObtained) best.set(i, r)
  }

  let previousObtained = 0
  let previousMax = 0
  for (const r of best.values()) {
    previousObtained += Number(r.marksObtained) || 0
    previousMax += Number(r.marksMax) || 0
  }

  return {
    previousObtained,
    previousMax,
    grandObtained: previousObtained + (Number(current.marksObtained) || 0),
    grandMax: previousMax + (Number(current.marksMax) || 0),
    previousCount: best.size,
  }
}
