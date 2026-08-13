import { describe, expect, it } from 'vitest'
import { validatePdfUpload } from '@/lib/validation/pdf'
import { AppError } from '@/lib/errors'

function makeFile(bytes: string, name = 'agenda.pdf', type = 'application/pdf'): File {
  return new File([new TextEncoder().encode(bytes)], name, { type })
}

const VALID_PDF =
  '%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n/Font /FontFile2\ntrailer<</Root 1 0 R>>\n%%EOF'

describe('PDF upload validation', () => {
  it('accepts a real PDF', async () => {
    const result = await validatePdfUpload(makeFile(VALID_PDF), 25)
    expect(result.pdfVersion).toBe('1.7')
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects an executable renamed to .pdf', async () => {
    const file = makeFile('MZ\u0090\u0000\u0003executable payload', 'invoice.pdf')
    await expect(validatePdfUpload(file, 25)).rejects.toThrow(/not a valid PDF/)
  })

  it('rejects HTML dressed up as a PDF', async () => {
    const file = makeFile('<html><script>alert(1)</script></html>', 'agenda.pdf')
    await expect(validatePdfUpload(file, 25)).rejects.toThrow(/not a valid PDF/)
  })

  it('rejects a file whose name does not end in .pdf', async () => {
    await expect(validatePdfUpload(makeFile(VALID_PDF, 'agenda.exe', ''), 25)).rejects.toThrow(
      /Only PDF documents/,
    )
  })

  it('rejects a declared content type that is not PDF', async () => {
    const file = makeFile(VALID_PDF, 'agenda.pdf', 'application/x-msdownload')
    await expect(validatePdfUpload(file, 25)).rejects.toThrow(/Only PDF documents/)
  })

  it('rejects a truncated upload', async () => {
    const file = makeFile('%PDF-1.4\nsome content but no trailer')
    await expect(validatePdfUpload(file, 25)).rejects.toThrow(/incomplete or was truncated/)
  })

  it('rejects a PDF carrying an embedded launch action', async () => {
    const file = makeFile('%PDF-1.7\n/Launch (calc.exe)\n%%EOF')
    await expect(validatePdfUpload(file, 25)).rejects.toThrow(/embedded script or launch action/)
  })

  it('enforces the configured size limit', async () => {
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'agenda.pdf', {
      type: 'application/pdf',
    })
    await expect(validatePdfUpload(big, 1)).rejects.toThrow(/exceeds the maximum upload size of 1 MB/)
  })

  it('flags a PDF with no embedded fonts as probably scanned', async () => {
    const scan = makeFile('%PDF-1.4\n1 0 obj<</Type/XObject/Subtype/Image>>endobj\n%%EOF')
    const result = await validatePdfUpload(scan, 25)
    expect(result.likelyImageOnly).toBe(true)
  })

  it('produces messages that are safe to show a clerk', async () => {
    try {
      await validatePdfUpload(makeFile('not a pdf at all'), 25)
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).message).not.toMatch(/undefined|Error:|at \w+ \(/)
    }
  })
})
