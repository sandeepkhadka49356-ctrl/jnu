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
  let weighted = 0
  let credits = 0

  for (const s of subjects) {
    const c = Number(s.credits)
    if (!Number.isFinite(c) || c <= 0) continue
    weighted += c * bandForMarks(Number(s.obtained) || 0, Number(s.max) || 0).point
    credits += c
  }

  if (credits === 0) return null
  // Two decimals, the convention on an Indian marksheet. Rounded half up on a
  // positive number, which is what toFixed does here.
  return Number((weighted / credits).toFixed(2))
}
