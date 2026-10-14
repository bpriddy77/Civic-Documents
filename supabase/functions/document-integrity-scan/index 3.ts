/**
 * document-integrity-scan
 *
 * A scheduled Edge Function that walks recently uploaded documents and
 * confirms each stored object still matches the SHA-256 recorded when it was
 * uploaded. A mismatch or a missing object means a public record has drifted
 * from its own metadata, which is exactly the condition a records office
 * needs to hear about early.
 *
 * This runs as an Edge Function rather than in the application because it
 * needs the service role to read the private bucket, and no privileged key
 * belongs in code that reaches a browser. It is also the natural place to add
 * malware scanning or PDF accessibility analysis later: the hook is the same.
 *
 * Deploy:
 *   supabase functions deploy document-integrity-scan
 *   supabase secrets set INTEGRITY_SCAN_TOKEN=<random-string>
 *
 * Schedule it with pg_cron or an external scheduler, sending
 * Authorization: Bearer <INTEGRITY_SCAN_TOKEN>.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const BUCKET = 'meeting-documents'

Deno.serve(async (request: Request) => {
  const expected = Deno.env.get('INTEGRITY_SCAN_TOKEN')
  const provided = request.headers.get('authorization')?.replace('Bearer ', '')

  if (!expected || provided !== expected) {
    return new Response('Not authorised', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: documents, error } = await supabase
    .from('meeting_documents')
    .select('id, municipality_id, storage_path, sha256, file_size')
    .gte('created_at', since)
    .not('sha256', 'is', null)
    .limit(500)

  if (error) {
    return Response.json({ error: 'Could not list documents' }, { status: 500 })
  }

  const problems: { id: string; issue: string }[] = []

  for (const document of documents ?? []) {
    const { data: file, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(document.storage_path)

    if (downloadError || !file) {
      problems.push({ id: document.id, issue: 'missing_object' })
      continue
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')

    if (hex !== document.sha256) {
      problems.push({ id: document.id, issue: 'checksum_mismatch' })
    }
  }

  for (const problem of problems) {
    await supabase.rpc('record_audit_event', {
      p_municipality_id: null,
      p_action: 'document.integrity_alert',
      p_entity_type: 'document',
      p_entity_id: problem.id,
      p_metadata: { issue: problem.issue },
    })
  }

  return Response.json({ checked: documents?.length ?? 0, problems })
})
