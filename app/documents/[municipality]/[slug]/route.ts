import { NextResponse } from 'next/server'
import { createAnonSupabase, createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { assertSafeStoragePath } from '@/lib/validation/slug'
import type { MeetingDocument } from '@/lib/supabase/database.types'

/**
 * Permanent public document URL: /documents/{municipality}/{public-slug}.pdf
 *
 * This route is the only way a PDF leaves the system. The storage bucket is
 * private and no signed URL is ever handed to a browser, so links published
 * in newsletters, notices, and QR codes keep working indefinitely and cannot
 * be replayed to reach an unpublished record.
 *
 * Authorisation happens before the object is touched:
 *   1. The anonymous client asks for the document. Row-Level Security returns
 *      it only when the meeting is published or archived and, for minutes,
 *      only when the municipality's rules make them public.
 *   2. Failing that, a signed-in staff member with document.read in the
 *      owning municipality may preview it.
 *   3. Otherwise: 404. Not 403 - the existence of a draft record is itself
 *      not public information.
 */

export const dynamic = 'force-dynamic'

type Params = Promise<{ municipality: string; slug: string }>

export async function GET(request: Request, { params }: { params: Params }) {
  return serve(request, params, 'GET')
}

export async function HEAD(request: Request, { params }: { params: Params }) {
  return serve(request, params, 'HEAD')
}

async function serve(request: Request, params: Params, method: 'GET' | 'HEAD') {
  const { municipality: municipalitySlug, slug: rawSlug } = await params
  const publicSlug = rawSlug.replace(/\.pdf$/i, '')

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(publicSlug) || !/^[a-z0-9-]+$/.test(municipalitySlug)) {
    return missing()
  }

  const anon = createAnonSupabase()
  const { data: municipality } = await anon
    .from('municipalities')
    .select('id, slug')
    .eq('slug', municipalitySlug)
    .eq('active', true)
    .maybeSingle()

  if (!municipality) return missing()

  const found = await findDocument(municipality.id, publicSlug)
  if (!found) return missing()

  const { document, isPublic } = found
  assertSafeStoragePath(document.storage_path, document.municipality_id)

  if (method === 'HEAD') {
    return new NextResponse(null, { status: 200, headers: pdfHeaders(document, isPublic) })
  }

  const admin = createAdminSupabase()
  const { data: file, error } = await admin.storage
    .from('meeting-documents')
    .download(document.storage_path)

  if (error || !file) {
    console.error('[documents] storage read failed', document.id, error?.message)
    return new NextResponse('This document is temporarily unavailable. Try again shortly.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  // Range requests let a browser open page 1 of a long agenda immediately.
  const range = request.headers.get('range')
  const buffer = await file.arrayBuffer()

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range)
    if (match) {
      const start = Number(match[1])
      const end = match[2] ? Number(match[2]) : buffer.byteLength - 1
      if (start < buffer.byteLength && end >= start) {
        return new NextResponse(buffer.slice(start, end + 1), {
          status: 206,
          headers: {
            ...pdfHeaders(document, isPublic),
            'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
            'Content-Length': String(end - start + 1),
          },
        })
      }
    }
  }

  return new NextResponse(buffer, { status: 200, headers: pdfHeaders(document, isPublic) })
}

async function findDocument(
  municipalityId: string,
  publicSlug: string,
): Promise<{ document: MeetingDocument; isPublic: boolean } | null> {
  const anon = createAnonSupabase()
  const { data: publicDoc } = await anon
    .from('meeting_documents')
    .select('*')
    .eq('municipality_id', municipalityId)
    .eq('public_slug', publicSlug)
    .eq('active_version', true)
    .maybeSingle()

  if (publicDoc) return { document: publicDoc, isPublic: true }

  // Staff preview of a document attached to a meeting that is still a draft.
  const staff = await createServerSupabase()
  const { data: { user } } = await staff.auth.getUser()
  if (!user) return null

  const { data: staffDoc } = await staff
    .from('meeting_documents')
    .select('*')
    .eq('municipality_id', municipalityId)
    .eq('public_slug', publicSlug)
    .eq('active_version', true)
    .maybeSingle()

  return staffDoc ? { document: staffDoc, isPublic: false } : null
}

function pdfHeaders(document: MeetingDocument, isPublic: boolean): Record<string, string> {
  return {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${document.stored_filename.replace(/"/g, '')}"`,
    'Content-Length': String(document.file_size),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    // A staff preview of an unpublished document must never be cached by a
    // shared cache. The URL is the same one the document will have once it is
    // published, so a cached copy would be served to anonymous visitors at
    // that URL - leaking a draft agenda through the CDN even though RLS
    // correctly refused it. Public records, by contrast, change only when a
    // clerk replaces them, and a replacement keeps this URL, so revalidation
    // is cheap and staleness is bounded.
    'Cache-Control': isPublic
      ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
      : 'private, no-store, max-age=0, must-revalidate',
    ...(isPublic ? {} : { Vary: 'Cookie' }),
    ETag: `"${document.sha256 ?? document.id}"`,
    'Last-Modified': new Date(document.created_at).toUTCString(),
  }
}

function missing() {
  return new NextResponse('That document could not be found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
