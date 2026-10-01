'use client'

/**
 * Client-side data access.
 *
 * Every function here is a thin fetch against the API routes in src/app/api.
 * Nothing is read from or written to the browser any more — the database is
 * the single source of truth, and the server decides what a caller is allowed
 * to see.
 *
 * The important consequence: unpublished results and password hashes never
 * reach the browser at all. Previously the whole dataset shipped to the client
 * and only the UI hid the parts a student should not see.
 *
 * The signatures are unchanged from the localStorage version, so the
 * components did not need rewriting.
 */

export type Subject = {
  code: string
  name: string
  max: number
  obtained: number
  grade: string
  /**
   * Optional theory / practical split, shown in separate columns on the
   * printed statement. Stored inside the subjects JSON, so rows written before
   * the split existed simply omit them and print their total as theory.
   */
  theory?: number
  practical?: number
  /**
   * Credit value of the paper, used to weight SGPA.
   *
   * Optional for the same reason as the split: results filed before credits
   * existed simply omit it. A result where no subject carries a credit cannot
   * have its SGPA computed, so it keeps whatever was entered by hand — see
   * sgpa() in lib/grading.ts, which returns null rather than guessing.
   */
  credits?: number
}

export type ResultRecord = {
  id: string
  roll_no: string
  student_name: string
  programme: string
  semester: string
  exam_session: string
  subjects: Subject[]
  marks_obtained: number
  marks_max: number
  sgpa: number
  status: 'PASS' | 'FAIL' | 'ATKT' | 'WITHHELD'
  published: boolean
  /** ISO timestamp the exam cell published it — the "Dated" line. */
  published_at?: string | null
  /** Printed serial, e.g. JNU-SOM-7K3M-Q9XA-2BCD. Encoded in the QR code. */
  serial?: string | null
}

export type CertificateRecord = {
  id: string
  certificate_no: string
  student_name: string
  programme: string
  award_year: number
  enrollment_no: string
  division: string
  status: 'VERIFIED' | 'REVOKED' | 'WITHHELD'
  registrar_remarks?: string | null
  issued_on: string
  roll_no?: string | null
  /** Printed with the QR code, e.g. JNU-DEG-7K3M-Q9XA-2BCD. */
  serial?: string | null
}

import { statusMessage } from './http-errors'
import type { Role } from '@/lib/permissions'

export type Session = {
  id: string
  email: string
  full_name: string
  role: Role
}

export type AuditEntry = {
  at: string
  actor: string
  action: string
  detail: string
}

/* ------------------------------------------------------------- plumbing --- */

/**
 * `trailingSlash: true` in next.config.mjs applies to API routes as well as
 * pages, so `/api/results` answers with a 308 to `/api/results/`. That still
 * works — 308 preserves the method and body — but it doubles every request.
 * Adding the slash before the query string avoids the redirect entirely.
 */
function withTrailingSlash(path: string): string {
  const [base, query] = path.split('?')
  const normalised = base.endsWith('/') ? base : `${base}/`
  return query ? `${normalised}?${query}` : normalised
}

async function api<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(withTrailingSlash(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      // Session cookie must ride along on every request.
      credentials: 'same-origin',
    })

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      // Same fallback wording as the admin panel — a student reading "Request
      // failed (500)" while checking their result is no better served by a
      // status code than a registrar is.
      return { ok: false, error: body?.error ?? statusMessage(res.status) }
    }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' }
  }
}

/** Maps a database row to the shape the components already expect. */
type ApiResult = {
  id: string
  rollNo: string
  studentName: string
  programme: string
  semester: string
  examSession: string
  subjects: Subject[]
  marksObtained: number
  marksMax: number
  sgpa: number
  status: ResultRecord['status']
  published?: boolean
  publishedAt?: string | null
  serial?: string | null
}

function toResult(r: ApiResult): ResultRecord {
  return {
    id: r.id ?? `${r.rollNo}-${r.semester}`,
    roll_no: r.rollNo,
    student_name: r.studentName,
    programme: r.programme,
    semester: r.semester,
    exam_session: r.examSession,
    subjects: Array.isArray(r.subjects) ? r.subjects : [],
    marks_obtained: r.marksObtained,
    marks_max: r.marksMax,
    sgpa: r.sgpa,
    status: r.status,
    published: r.published ?? true,
    published_at: r.publishedAt ?? null,
    serial: r.serial ?? null,
  }
}

type ApiCertificate = {
  id: string
  certificateNo: string
  studentName: string
  programme: string
  awardYear: number
  enrollmentNo: string
  division: string
  status: CertificateRecord['status']
  registrarRemarks?: string | null
  issuedOn?: string
  rollNo?: string | null
  serial?: string | null
}

function toCertificate(c: ApiCertificate): CertificateRecord {
  return {
    id: c.id,
    certificate_no: c.certificateNo,
    student_name: c.studentName,
    programme: c.programme,
    award_year: c.awardYear,
    enrollment_no: c.enrollmentNo,
    division: c.division,
    status: c.status,
    registrar_remarks: c.registrarRemarks ?? null,
    issued_on: (c.issuedOn ?? new Date().toISOString()).slice(0, 10),
    roll_no: c.rollNo ?? null,
    serial: c.serial ?? null,
  }
}

/* -------------------------------------------------------------- results --- */

export async function listResults(): Promise<ResultRecord[]> {
  const res = await api<{ results: ApiResult[] }>('/api/results')
  if (!res.ok) return []
  return res.data.results.map(toResult)
}

export async function addResult(
  input: Omit<ResultRecord, 'id' | 'published'>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api<{ created: number; skipped: number }>('/api/results', {
    method: 'POST',
    body: JSON.stringify({
      rollNo: input.roll_no,
      studentName: input.student_name,
      programme: input.programme,
      semester: input.semester,
      examSession: input.exam_session,
      subjects: input.subjects,
      marksObtained: input.marks_obtained,
      marksMax: input.marks_max,
      sgpa: input.sgpa,
      status: input.status,
    }),
  })

  if (!res.ok) return res
  if (res.data.created === 0) {
    return {
      ok: false,
      error: 'A result already exists for that roll number, semester and session.',
    }
  }
  return { ok: true }
}

export async function importResults(
  records: Omit<ResultRecord, 'id' | 'published'>[]
): Promise<number> {
  const res = await api<{ created: number }>('/api/results', {
    method: 'POST',
    body: JSON.stringify({
      rows: records.map((r) => ({
        rollNo: r.roll_no,
        studentName: r.student_name,
        programme: r.programme,
        semester: r.semester,
        examSession: r.exam_session,
        subjects: r.subjects,
        marksObtained: r.marks_obtained,
        marksMax: r.marks_max,
        sgpa: r.sgpa,
        status: r.status,
      })),
    }),
  })
  return res.ok ? res.data.created : 0
}

/**
 * Edit a result. The server refuses this while the result is published,
 * because a printed marksheet carries a serial that must keep matching the
 * record — unpublish first, which withdraws that serial, then edit.
 */
export async function updateResult(
  id: string,
  input: Omit<ResultRecord, 'id' | 'published' | 'roll_no'>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api<{ result: ApiResult }>(`/api/results/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      studentName: input.student_name,
      programme: input.programme,
      semester: input.semester,
      examSession: input.exam_session,
      subjects: input.subjects,
      marksObtained: input.marks_obtained,
      marksMax: input.marks_max,
      sgpa: input.sgpa,
      status: input.status,
    }),
  })
  return res.ok ? { ok: true } : res
}

export async function setResultPublished(id: string, published: boolean): Promise<void> {
  await api(`/api/results/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ published }),
  })
}

export async function deleteResult(id: string): Promise<void> {
  await api(`/api/results/${id}`, { method: 'DELETE' })
}

/* --------------------------------------------------------- certificates --- */

export async function findCertificate(no: string): Promise<CertificateRecord | null> {
  const res = await api<{ certificate: ApiCertificate | null }>(
    `/api/certificates/verify?no=${encodeURIComponent(no.trim().toUpperCase())}`
  )
  if (!res.ok || !res.data.certificate) return null
  return toCertificate(res.data.certificate)
}

export async function listCertificates(): Promise<CertificateRecord[]> {
  const res = await api<{ certificates: ApiCertificate[] }>('/api/certificates')
  if (!res.ok) return []
  return res.data.certificates.map(toCertificate)
}

/**
 * Issues a degree to a student on the register. Registrar only. The server
 * takes the name, programme and enrollment number from the student record;
 * nothing identifying is typed in here.
 */
export async function issueCertificate(input: {
  rollNo: string
  certificateNo: string
  awardYear: number
  division: string
  registrarRemarks?: string
}): Promise<{ ok: true; record: CertificateRecord } | { ok: false; error: string }> {
  const res = await api<{ certificate: ApiCertificate }>('/api/certificates', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) return res
  return { ok: true, record: toCertificate(res.data.certificate) }
}

/**
 * Records a stationery print (or alignment test) in the audit log. The admin
 * screen prints only if this succeeds, so the log is a count of every blank
 * used. Registrar only; refused for a revoked or withheld degree.
 */
export async function logCertificatePrint(
  id: string,
  mode: 'stationery' | 'alignment'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api(`/api/certificates/${id}/print`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
  return res.ok ? { ok: true } : res
}

export type CertificateBySerial = {
  serial: string
  certificateNo: string
  studentName: string
  programme: string
  awardYear: number
  enrollmentNo: string
  division: string
  status: CertificateRecord['status']
  registrarRemarks: string | null
  issuedOn: string
}

/** What the QR code on a printed degree resolves to. */
export async function findCertificateBySerial(
  serial: string
): Promise<
  | { kind: 'found'; cert: CertificateBySerial }
  | { kind: 'not-found' }
  | { kind: 'error'; error: string }
> {
  const res = await api<{ certificate: CertificateBySerial | null }>(
    `/api/certificates/by-serial?sn=${encodeURIComponent(serial.trim())}`
  )
  if (!res.ok) return { kind: 'error', error: res.error }
  return res.data.certificate ? { kind: 'found', cert: res.data.certificate } : { kind: 'not-found' }
}

export async function setCertificateStatus(
  id: string,
  status: CertificateRecord['status'],
  remarks?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api(`/api/certificates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, registrarRemarks: remarks }),
  })
  return res.ok ? { ok: true } : res
}

/**
 * Next number in the register for a year, in the JNU/DEG/<year>/<seq> shape.
 * Derived from the rows already loaded in the admin table, so it never
 * proposes a duplicate of something visible — and the unique constraint on
 * the database is the backstop if two staff generate at the same moment.
 */
export function nextCertificateNo(year: number, existing: CertificateRecord[]): string {
  const prefix = `JNU/DEG/${year}/`
  const highest = existing
    .filter((c) => c.certificate_no.startsWith(prefix))
    .map((c) => Number.parseInt(c.certificate_no.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0)

  return `${prefix}${String((highest > 0 ? highest : 5000) + 1).padStart(6, '0')}`
}

/* ----------------------------------------------------------------- auth --- */

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api<{ user: Session }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return res.ok ? { ok: true } : res
}

export async function signOut(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' })
}

/**
 * Asks the server who is signed in. The session lives in an httpOnly cookie,
 * so this cannot be answered locally — which is the point.
 */
export async function getSession(): Promise<Session | null> {
  const res = await api<{ user: { id: string; email: string; fullName: string; role: Role } | null }>(
    '/api/auth/me'
  )
  if (!res.ok || !res.data.user) return null
  const u = res.data.user
  return { id: u.id, email: u.email, full_name: u.fullName, role: u.role }
}

/* ---------------------------------------------------------------- audit --- */

export async function listAudit(): Promise<AuditEntry[]> {
  const res = await api<{
    entries: { at: string; actorEmail: string; action: string; detail: string }[]
  }>('/api/audit')
  if (!res.ok) return []
  return res.data.entries.map((e) => ({
    at: e.at,
    actor: e.actorEmail,
    action: e.action,
    detail: e.detail,
  }))
}

/* -------------------------------------------------------------- enquiry --- */

export async function submitEnquiry(input: {
  name: string
  email: string
  phone?: string
  programme?: string
  message: string
  company?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api('/api/enquiries', { method: 'POST', body: JSON.stringify(input) })
  return res.ok ? { ok: true } : res
}

/* -------------------------------------------------------------- student --- */

export type StudentProfile = {
  rollNo: string
  enrollmentNo: string
  fullName: string
  fatherName: string
  motherName: string
  dob: string
  programme: string
  photoUrl: string | null
  /** A replacement photo the student uploaded that staff have not approved. */
  pendingPhotoUrl: string | null
  pendingPhotoAt: string | null
  status: string
  mobile: string | null
  email: string | null
  addressLine: string | null
  district: string | null
  state: string | null
  pincode: string | null
}

export type CorrectionStatus = 'PENDING' | 'RESOLVED' | 'REJECTED'

export type CorrectionRequest = {
  id: string
  field: string
  currentValue: string
  requestedValue: string
  status: CorrectionStatus
  staffRemarks: string | null
  createdAt: string
}

export type StudentPortal = {
  student: StudentProfile | null
  results: ResultRecord[]
  corrections: CorrectionRequest[]
}

export async function studentSignIn(
  rollNo: string,
  dob: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api<{ student: unknown }>('/api/student/login', {
    method: 'POST',
    body: JSON.stringify({ rollNo, dob }),
  })
  return res.ok ? { ok: true } : res
}

export async function studentSignOut(): Promise<void> {
  await api('/api/student/logout', { method: 'POST' })
}

/**
 * The signed-in student's own record. There is no roll-number parameter by
 * design — the server reads it from the session cookie, so changing a value
 * in the browser cannot fetch somebody else's marksheet.
 */
export async function getStudentPortal(): Promise<StudentPortal> {
  const res = await api<{
    student: StudentProfile | null
    results?: ApiResult[]
    corrections?: CorrectionRequest[]
  }>('/api/student/me')
  if (!res.ok || !res.data.student) return { student: null, results: [], corrections: [] }
  return {
    student: res.data.student,
    results: (res.data.results ?? []).map(toResult),
    corrections: res.data.corrections ?? [],
  }
}

/**
 * Just the signed-in student's name and roll number, or null.
 *
 * The header calls this on every page load, so it hits the lightweight
 * /api/student/session rather than /api/student/me, which would also load the
 * full profile and run the results query for every visitor on every page.
 */
export async function getStudentSessionSummary(): Promise<{
  rollNo: string
  fullName: string
} | null> {
  const res = await api<{ student: { rollNo: string; fullName: string } | null }>(
    '/api/student/session'
  )
  return res.ok ? res.data.student : null
}

export type ContactDetails = {
  mobile: string
  email: string
  addressLine: string
  district: string
  state: string
  pincode: string
}

/**
 * Updates the student's own contact details — the only fields they may change
 * themselves. The server allow-lists these six and ignores anything else.
 */
export async function updateContactDetails(
  input: ContactDetails
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api('/api/student/me', { method: 'PATCH', body: JSON.stringify(input) })
  return res.ok ? { ok: true } : res
}

/** Uploads a replacement photograph. It stays pending until staff approve it. */
export async function uploadStudentPhoto(
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  const form = new FormData()
  form.append('photo', file)
  try {
    const res = await fetch('/api/student/photo/', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      // No Content-Type: the browser must set it with the multipart boundary.
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: body?.error ?? `Upload failed (${res.status}).` }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' }
  }
}

/** Withdraws a pending photograph before staff have reviewed it. */
export async function withdrawStudentPhoto(): Promise<void> {
  await api('/api/student/photo', { method: 'DELETE' })
}

/** Asks the registrar to correct a field the student cannot edit themselves. */
export async function requestCorrection(input: {
  field: string
  requestedValue: string
  reason?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api('/api/student/corrections', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return res.ok ? { ok: true } : res
}

/* --------------------------------------------------------- staff review --- */

export type PendingPhoto = {
  studentId: string
  rollNo: string
  fullName: string
  programme: string
  currentPhotoUrl: string | null
  pendingPhotoUrl: string
  submittedAt: string | null
}

export type PendingCorrection = {
  id: string
  field: string
  currentValue: string
  requestedValue: string
  reason: string | null
  createdAt: string
  rollNo: string
  fullName: string
}

export async function getReviewQueue(): Promise<{
  photos: PendingPhoto[]
  corrections: PendingCorrection[]
}> {
  const res = await api<{ photos: PendingPhoto[]; corrections: PendingCorrection[] }>(
    '/api/admin/review'
  )
  return res.ok ? res.data : { photos: [], corrections: [] }
}

export async function reviewPhoto(
  studentId: string,
  action: 'approve' | 'reject'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api(`/api/admin/photos/${studentId}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
  return res.ok ? { ok: true } : res
}

export async function resolveCorrection(
  id: string,
  action: 'apply' | 'reject',
  remarks?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await api(`/api/admin/corrections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ action, remarks }),
  })
  return res.ok ? { ok: true } : res
}

/* --------------------------------------------------- certificate verify --- */

export type VerifyOutcome =
  | { kind: 'found'; row: CertificateRecord }
  | { kind: 'no-certificate' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: string }

/**
 * Verification by roll number + date of birth.
 *
 * A POST, not a GET: the pair is a guessable credential, and a query string
 * would put it in server logs, browser history and Referer headers.
 */
export async function verifyCertificate(rollNo: string, dob: string): Promise<VerifyOutcome> {
  const res = await api<{ certificate: ApiCertificate | null; studentOnRecord?: boolean }>(
    '/api/certificates/verify',
    { method: 'POST', body: JSON.stringify({ rollNo, dob }) }
  )

  if (!res.ok) return { kind: 'error', error: res.error }
  if (res.data.certificate) return { kind: 'found', row: toCertificate(res.data.certificate) }
  if (res.data.studentOnRecord) return { kind: 'no-certificate' }
  return { kind: 'not-found' }
}

/* ---------------------------------------------------------- application --- */

/**
 * Submits the admission form. Takes a FormData rather than a plain object
 * because three documents ride along with it, so this bypasses the JSON
 * `api()` helper above.
 */
export async function submitApplication(
  form: FormData
): Promise<{ ok: true; applicationNo: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/applications/', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      // No Content-Type header: the browser must set it with the multipart
      // boundary, and setting it by hand breaks the upload.
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: body?.error ?? `Submission failed (${res.status}).` }
    return { ok: true, applicationNo: body?.applicationNo ?? null }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection.' }
  }
}

/* ------------------------------------------------------ marksheet verify --- */

export type VerifiedMarksheet = {
  serial: string
  rollNo: string
  enrollmentNo: string | null
  studentName: string
  /** Printed on the sheet, so returned for comparison against the paper. */
  fatherName: string | null
  motherName: string | null
  dob: string | null
  programme: string
  semester: string
  examSession: string
  subjects: Subject[]
  marksObtained: number
  marksMax: number
  status: ResultRecord['status']
  publishedAt: string | null
}

export type MarksheetVerifyOutcome =
  | { kind: 'found'; sheet: VerifiedMarksheet }
  | { kind: 'withdrawn' }
  | { kind: 'not-found' }
  | { kind: 'error'; error: string }

/** Looks up a printed statement of marks by the serial on it. */
export async function verifyMarksheet(serial: string): Promise<MarksheetVerifyOutcome> {
  const res = await api<{ marksheet: VerifiedMarksheet | null; withdrawn?: boolean }>(
    `/api/results/verify?sn=${encodeURIComponent(serial.trim())}`
  )
  if (!res.ok) return { kind: 'error', error: res.error }
  if (res.data.marksheet) return { kind: 'found', sheet: res.data.marksheet }
  if (res.data.withdrawn) return { kind: 'withdrawn' }
  return { kind: 'not-found' }
}

/* ------------------------------------------------ public result lookup --- */

/**
 * Published results for a roll number, with no sign-in.
 *
 * Deliberately separate from getStudentPortal(): this one takes a roll number
 * and returns only what /api/results/lookup is willing to disclose — no
 * photograph, no contact details. The portal's own call stays session-scoped.
 */
export async function lookupResults(
  rollNo: string
): Promise<
  { ok: true; student: StudentProfile; results: ResultRecord[] } | { ok: false; error: string }
> {
  const res = await api<{ student: StudentProfile; results: ApiResult[] }>(
    '/api/results/lookup',
    { method: 'POST', body: JSON.stringify({ rollNo }) }
  )
  if (!res.ok) return { ok: false, error: res.error }
  return {
    ok: true,
    student: res.data.student,
    results: (res.data.results ?? []).map(toResult),
  }
}
