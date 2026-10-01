'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ResultRecord, StudentProfile } from '@/lib/store'
import { MarksheetDocument } from './MarksheetDocument'

/**
 * Full-screen preview of the statement of marks, with Print / Save as PDF.
 *
 * Portalled to document.body, not rendered in place. The print rules isolate
 * the sheet by hiding every OTHER direct child of <body> while
 * `body.sheet-printing` is set — header, nav, footer, the portal page itself.
 * Rendered in place it would sit deep inside <main> and be hidden along with
 * everything else, which is how the degree certificate once printed blank
 * (see CertificateRecords). As a direct child of <body> it survives.
 *
 * The body class is set for as long as the overlay is open rather than only
 * around window.print(), because browsers also print from their own menu and
 * Ctrl+P, which never pass through our button.
 */
export function MarksheetOverlay({
  row,
  profile,
  all = [],
  onClose,
}: {
  row: ResultRecord
  profile: StudentProfile
  /** Every published result, so the printed sheet can carry running totals. */
  all?: ResultRecord[]
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    document.body.classList.add('sheet-printing')

    // The browser offers document.title as the PDF filename. Make it a useful
    // one rather than the site title, then put it back.
    const previousTitle = document.title
    document.title = `Statement-of-Marks_${row.roll_no}_${row.semester}_${row.exam_session}`
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')

    // Stop the page behind scrolling under the overlay.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.body.classList.remove('sheet-printing')
      document.title = previousTitle
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [row, onClose])

  // document.body does not exist during prerender.
  if (!mounted) return null

  return createPortal(
    <div
      id="sheet-overlay"
      className="fixed inset-0 z-50 overflow-auto bg-jnu-900/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Statement of marks, ${row.semester}`}
    >
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[13px] text-white">
          Statement of Marks — {row.semester}, {row.exam_session}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="btn btn-sand">
            Download / Print
          </button>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>

      {/* Wide sheet on a narrow screen: scroll sideways inside this box rather
          than shrinking the type below legibility. */}
      <div className="sheet-scroll overflow-x-auto">
        <MarksheetDocument row={row} profile={profile} all={all} />
      </div>

      <p className="no-print mx-auto mt-3 max-w-[210mm] text-center text-[12px] text-jnu-100">
        To download, choose <strong>Save as PDF</strong> as the printer. Paper size{' '}
        <strong>A4</strong>, and tick <strong>Background graphics</strong> so the border,
        seal and table shading print.
      </p>
    </div>,
    document.body
  )
}
