# Edge Functions

Functions live here only when they earn their place: something needs the
service role, or needs to run on a schedule outside a user request. Everything
else belongs in the Next.js server, where it is easier to test and to read.

| Function | Why it is here |
| --- | --- |
| `document-integrity-scan` | Reads the private storage bucket with the service role and compares each object against its recorded checksum. Also the future home of malware scanning and PDF accessibility analysis. |

Deploy:

```bash
supabase functions deploy document-integrity-scan
supabase secrets set INTEGRITY_SCAN_TOKEN="$(openssl rand -hex 32)"
```
