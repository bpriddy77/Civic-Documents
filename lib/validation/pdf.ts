import { invalid } from '@/lib/errors'

/**
 * Upload validation.
 *
 * A filename ending in .pdf proves nothing, so three checks run in order:
 * declared type, real file signature, and trailer. The bytes are inspected
 * server side, and the file is never executed, parsed as HTML, or served
 * with a type the browser might sniff.
 */

const PDF_MAGIC = '%PDF-'
const MAX_HEADER_SCAN = 1024
const MAX_TRAILER_SCAN = 4096

export interface PdfCheckResult {
  size: number
  sha256: string
  pdfVersion: string
  /** True when the file has no extractable text: a scan, most likely. */
  likelyImageOnly: boolean
}

export async function validatePdfUpload(file: File, maxUploadMb: number): Promise<PdfCheckResult> {
  if (!file || file.size === 0) {
    throw invalid('Choose a PDF file to upload.')
  }

  const maxBytes = maxUploadMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw invalid(`This file exceeds the maximum upload size of ${maxUploadMb} MB.`)
  }

  if (!/\.pdf$/i.test(file.name)) {
    throw invalid('Only PDF documents are allowed.')
  }

  if (file.type && file.type !== 'application/pdf') {
    throw invalid('Only PDF documents are allowed.')
  }

  const buffer = new Uint8Array(await file.arrayBuffer())
  const head = decode(buffer.subarray(0, MAX_HEADER_SCAN))

  const magicIndex = head.indexOf(PDF_MAGIC)
  if (magicIndex !== 0) {
    throw invalid('That file is not a valid PDF. Re-export it and try again.')
  }

  const version = head.slice(5, 8).match(/^\d\.\d/)?.[0]
  if (!version) {
    throw invalid('That file is not a valid PDF. Re-export it and try again.')
  }

  const tail = decode(buffer.subarray(Math.max(0, buffer.length - MAX_TRAILER_SCAN)))
  if (!tail.includes('%%EOF')) {
    throw invalid('That PDF looks incomplete or was truncated during upload. Try uploading it again.')
  }

  // Refuse anything carrying an embedded launch or JavaScript action.
  const body = decode(buffer)
  if (/\/(JavaScript|JS|Launch|EmbeddedFile)\s*[<\/(]/.test(body.slice(0, 2_000_000))) {
    throw invalid(
      'This PDF contains an embedded script or launch action, which cannot be published. ' +
        'Re-export it as a plain PDF and upload it again.',
    )
  }

  return {
    size: file.size,
    sha256: await sha256(buffer),
    pdfVersion: version,
    likelyImageOnly: !/\/(Font|FontFile\d?)\b/.test(body),
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const PDF_ACCESSIBILITY_NOTICE =
  'Government documents should be created as accessible, searchable, tagged PDFs whenever possible.'
