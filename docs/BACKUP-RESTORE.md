# Backups and recovery

Meeting agendas and minutes are public records. Losing them is not an outage,
it is a records-retention failure. This document assumes that framing.

Four things need to survive independently:

| Asset | Where it lives | Covered by |
| --- | --- | --- |
| Database rows | Supabase PostgreSQL | Supabase automatic backups + PITR |
| PDF files | Supabase Storage | **Not** covered by database backups — see below |
| Schema | `supabase/migrations/` | Git history |
| Application code | This repository | Git history |

The trap is the second row. A Supabase database backup does not include
storage objects. Restoring the database alone gives you a complete index of
documents that no longer exist.

---

## Database backups

Supabase Pro takes daily automatic backups with a 7-day retention window by
default. Confirm under **Database → Backups**.

Enable **Point-in-Time Recovery** if the municipality's retention policy calls
for restoring to an arbitrary moment rather than to yesterday. PITR is the
difference between "we lost a day" and "we lost four minutes".

A manual snapshot before any risky change:

```bash
supabase db dump --linked -f backups/pre-migration-$(date +%Y%m%d).sql
```

Store those outside the repository. They contain record data.

## Storage backups

Schedule this. Weekly at minimum; nightly for an active clerk's office.

```bash
#!/usr/bin/env bash
# backup-storage.sh - mirror the private bucket to durable storage
set -euo pipefail

STAMP=$(date +%Y%m%d)
DEST="backups/storage-$STAMP"
mkdir -p "$DEST"

supabase storage cp -r "ss:///meeting-documents" "$DEST" --experimental

tar -czf "$DEST.tar.gz" "$DEST"
rm -rf "$DEST"
# Then copy $DEST.tar.gz off this machine: S3 with object lock, Backblaze B2,
# or the municipality's existing records-retention system.
```

Keep at least one copy off the platform. A backup that lives only in the same
account as the original protects against deletion, not against losing the
account.

## Version retention

Replacing a document never deletes the previous file. Superseded rows keep
`active_version = false` and their storage object stays in place, so an
accidental replacement is recoverable from within the system — no restore
needed. `document.superseded` in the audit log tells you when and by whom.

---

## Recovery procedures

### A clerk deleted the wrong meeting

1. Check the audit log: `/admin/audit?entity_id=<meeting id>`. The `previous_data` on the `meeting.deleted` entry holds the full row as it was.
2. If it was archived rather than deleted, restore it from the meeting list — nothing was lost.
3. If it was permanently deleted, recreate the meeting from `previous_data` and re-upload the documents from the storage backup.

Permanent deletion requires `meeting.delete`, an explicit confirmation, and
typing DELETE. Most cities should not grant that permission at all.

### A document was replaced with the wrong file

1. Open the meeting, expand **View document history**.
2. Note the version you want.
3. Download it from Storage at the `storage_path` recorded on that row.
4. Upload it again through the interface. It becomes the next version and inherits the same public URL, so no external link breaks.

### A database restore is needed

1. **Database → Backups →** select the point in time → restore.
2. Confirm the schema matches the repository: `supabase db diff --linked` should output nothing.
3. Restore storage from the matching backup — the closest one **at or before** the database restore point. A storage backup newer than the database leaves objects with no rows pointing at them.
4. Spot-check: open three published meetings and their PDFs.

### A migration broke production

1. Do not roll back by hand in the dashboard.
2. Write a forward migration that reverses the change.
3. `supabase db reset` locally to prove it applies from scratch.
4. `npm test`.
5. Commit, push, `supabase db push`.

If the migration destroyed data, restore the database first, then apply the
corrected migration.

### A deployment broke production

Redeploy the previous build from the host's dashboard. The database is
unaffected as long as no migration ran. If one did, treat it as the case above.

---

## Verify the plan, twice a year

A backup nobody has restored is a hypothesis.

1. Create a scratch Supabase project.
2. `supabase link` to it and `supabase db push`.
3. Restore the most recent database backup into it.
4. Restore the matching storage backup.
5. Run the application against it and confirm three meetings and their PDFs open.
6. Delete the scratch project.

Write down the date you did this. An auditor will ask.
