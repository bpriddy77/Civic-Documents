/**
 * Uploads a backup archive to a Google Drive folder.
 *
 *   node scripts/upload-drive.mjs <file> --folder <driveFolderId>
 *
 * Authenticates as a Google service account. No SDK: this signs its own JWT
 * with node:crypto and talks to the REST API directly, which keeps the
 * dependency surface of a records system as small as it can reasonably be.
 *
 * Requires GOOGLE_SERVICE_ACCOUNT_JSON (the full key file, as a string) and
 * GOOGLE_DRIVE_FOLDER_ID. See docs/BACKUP-RESTORE.md for setup.
 *
 * Use a Shared Drive, not a folder in someone's My Drive. A service account
 * has no storage quota of its own, so uploads to My Drive fail once anything
 * accumulates; files in a Shared Drive count against the Workspace pool and
 * survive the departure of whoever set this up — which matters for records
 * that outlive staff.
 */
import { createSign } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

// Overridable so the upload path can be tested without reaching Google.
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = process.env.GOOGLE_UPLOAD_URL ?? 'https://www.googleapis.com/upload/drive/v3/files'
const API_URL = process.env.GOOGLE_API_URL ?? 'https://www.googleapis.com/drive/v3/files'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Signs a service-account JWT and exchanges it for an access token. */
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(credentials.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.access_token) {
    throw new Error(
      `Could not authenticate with Google (${response.status}). ` +
        `${body.error_description ?? body.error ?? 'no access token returned'}`,
    )
  }
  return body.access_token
}

async function main() {
  const file = process.argv[2]
  const folderId = arg('folder', process.env.GOOGLE_DRIVE_FOLDER_ID)
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  if (!file || file.startsWith('--')) {
    console.error('Usage: node scripts/upload-drive.mjs <file> --folder <driveFolderId>')
    process.exit(1)
  }
  if (!raw) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not set.')
    process.exit(1)
  }
  if (!folderId) {
    console.error('GOOGLE_DRIVE_FOLDER_ID is not set, and no --folder given.')
    process.exit(1)
  }

  let credentials
  try {
    credentials = JSON.parse(raw)
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file.')
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('The service account key is missing client_email or private_key.')
  }

  const info = await stat(file)
  const bytes = await readFile(file)
  const name = basename(file)

  const token = await getAccessToken(credentials)

  // Multipart upload: metadata part, then the bytes.
  const boundary = `bk${Date.now().toString(36)}`
  const metadata = JSON.stringify({ name, parents: [folderId] })
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const response = await fetch(
    `${UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = result?.error?.message ?? `HTTP ${response.status}`
    if (/storage quota/i.test(message)) {
      throw new Error(
        `${message}\n\n  This usually means the target is a folder in someone's My Drive.\n` +
          `  Service accounts have no quota of their own — use a Shared Drive instead.`,
      )
    }
    if (response.status === 404) {
      throw new Error(
        `Drive folder not found (${folderId}).\n\n` +
          `  Confirm the ID, and that the folder is shared with ${credentials.client_email}\n` +
          `  as Content manager.`,
      )
    }
    throw new Error(`Upload failed: ${message}`)
  }

  const mb = (info.size / 1024 / 1024).toFixed(1)
  console.log(`Uploaded ${result.name} (${mb} MB) to Google Drive`)
  if (result.webViewLink) console.log(result.webViewLink)

  // Optional retention. Off unless asked for, because deleting backups on a
  // schedule should be a deliberate choice.
  const keep = Number(arg('keep', 0))
  if (keep > 0) {
    const list = await fetch(
      `${API_URL}?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}` +
        `&orderBy=createdTime desc&fields=files(id,name,createdTime)&pageSize=100` +
        `&supportsAllDrives=true&includeItemsFromAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    ).then((r) => r.json())

    const old = (list.files ?? []).slice(keep)
    for (const f of old) {
      await fetch(`${API_URL}/${f.id}?supportsAllDrives=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      console.log(`Removed old backup: ${f.name}`)
    }
  }
}

main().catch((error) => {
  console.error(`\n${error.message}\n`)
  process.exit(1)
})
