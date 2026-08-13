/** URL and filename safety helpers. Shared by the server and the browser. */

export function slugify(input: string, fallback = 'item'): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return slug || fallback
}

/**
 * Reduces an uploaded filename to something safe to store and to show.
 * Strips directory separators, control characters, leading dots, and any
 * second extension, so `../../etc/passwd.pdf` and `report.pdf.exe` both
 * become harmless.
 */
export function sanitizeFilename(input: string): string {
  const base = input.split(/[\\/]/).pop() ?? 'document.pdf'
  const withoutExt = base.replace(/\.[^.]*$/, '')
  const cleaned = withoutExt
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return `${cleaned || 'document'}.pdf`
}

/** Rejects any storage path that tries to escape its tenant folder. */
export function assertSafeStoragePath(path: string, municipalityId: string) {
  const expectedPrefix = `municipalities/${municipalityId}/`
  if (
    !path.startsWith(expectedPrefix) ||
    path.includes('..') ||
    path.includes('//') ||
    path.startsWith('/')
  ) {
    throw new Error('Refusing to use an unsafe storage path.')
  }
}
