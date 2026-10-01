/**
 * Roll and enrollment numbers: how one is proposed for a new student.
 *
 * Format, as the university uses it:
 *
 *   Roll        JNU 2024 BT 0190      JNU2024BT0190
 *   Enrollment  JNU/2024/BT/0190      JNU/2024/BT/0190
 *
 * prefix + admission year + programme code + a four-digit serial that counts
 * within that year and that programme, so the two hundredth B.Tech admitted
 * in 2024 is 0200 regardless of how many BBA students were admitted alongside.
 *
 * Every number this proposes can be overwritten before saving. That is not a
 * concession: students transfer in carrying a number from elsewhere, a paper
 * register gets reconciled years later, and a block of numbers is sometimes
 * reserved in advance. A generator that cannot be overruled would simply be
 * worked around by typing something else into a different field.
 *
 * Pure. No database and no imports, so the rules can be read and tested on
 * their own; the caller supplies the numbers already in use.
 */

const PREFIX = 'JNU'
const SERIAL_DIGITS = 4

/**
 * Programme codes that are not just the award with its punctuation removed.
 *
 * B.Tech is the one the university's existing numbers settle: JNU2024BT0190
 * is a B.Tech roll number, so B.Tech is BT and not BTECH. M.Tech follows it
 * for consistency rather than from evidence — correct it here if the paper
 * register disagrees, and nothing else needs to change.
 */
const CODE_OVERRIDES: Record<string, string> = {
  'B.TECH': 'BT',
  'M.TECH': 'MT',
}

/**
 * The code for an award.
 *
 * Falls back to the award with everything but letters and digits removed, so
 * a programme added next year gets a sensible code without anyone editing
 * this file: B.Com becomes BCOM, LL.B becomes LLB, BBA stays BBA. Parenthesised
 * qualifiers are dropped first — "B.Sc (Hons.) Agriculture" is a B.Sc for
 * numbering, and BSCHONSAGRICULTURE is nobody's roll number.
 */
export function programmeCode(award: string): string {
  const trimmed = (award ?? '').trim()
  if (!trimmed) return ''

  const upper = trimmed.toUpperCase()
  if (CODE_OVERRIDES[upper]) return CODE_OVERRIDES[upper]

  const head = upper.split('(')[0].trim()
  if (CODE_OVERRIDES[head]) return CODE_OVERRIDES[head]

  return head.replace(/[^A-Z0-9]/g, '')
}

/** `JNU2024BT` — everything before the serial. */
export function rollStem(year: number, code: string): string {
  return `${PREFIX}${year}${code}`
}

const pad = (n: number) => String(n).padStart(SERIAL_DIGITS, '0')

export function formatRoll(year: number, code: string, serial: number): string {
  return `${rollStem(year, code)}${pad(serial)}`
}

export function formatEnrollment(year: number, code: string, serial: number): string {
  return `${PREFIX}/${year}/${code}/${pad(serial)}`
}

/**
 * The next free serial, given the roll numbers already issued.
 *
 * Takes the highest in use and adds one, rather than counting the rows or
 * filling the first gap. Counting breaks the moment a student is withdrawn
 * and their row deleted — the next admission would be handed a number that
 * has already been printed on somebody's admit card. Gaps are left alone for
 * the same reason: a missing 0147 usually means 0147 exists on paper.
 *
 * `existing` is every roll number for this year and programme; anything that
 * does not end in a serial is ignored, which covers transfers that came in
 * with a number from another institution.
 */
export function nextSerial(existing: string[], year: number, code: string): number {
  const stem = rollStem(year, code)
  let highest = 0

  for (const roll of existing) {
    if (!roll.startsWith(stem)) continue
    const tail = roll.slice(stem.length)
    if (!/^\d+$/.test(tail)) continue
    const n = Number.parseInt(tail, 10)
    if (n > highest) highest = n
  }

  return highest + 1
}

export type Proposal = {
  rollNo: string
  enrollmentNo: string
  serial: number
  code: string
  year: number
}

/**
 * What to put in the two boxes for a new student.
 *
 * Returns null when the award has no usable code, rather than proposing
 * `JNU20240001` with the programme silently missing — a number that looks
 * right and is wrong is worse than an empty box the registrar has to fill.
 */
export function propose(
  award: string,
  year: number,
  existing: string[]
): Proposal | null {
  const code = programmeCode(award)
  if (!code) return null

  const serial = nextSerial(existing, year, code)
  return {
    rollNo: formatRoll(year, code, serial),
    enrollmentNo: formatEnrollment(year, code, serial),
    serial,
    code,
    year,
  }
}
