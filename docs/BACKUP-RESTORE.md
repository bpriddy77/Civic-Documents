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

## Backing up everything: `npm run backup`

One command captures both halves — every database row and every PDF:

```bash
npm run backup

# or write somewhere specific
npm run backup -- --out /Volumes/CityBackups
```

It needs Node and the service role key. **No Supabase CLI and no Docker.** Run
it from a folder containing `.env.local`, or set
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment.

Each run writes a dated, self-contained folder:

```
forsan-records-2026-08-14-09-30-00/
  README.txt              What this is and how to restore it
  MANIFEST.json           Every file with its size and SHA-256
  municipalities.json     One file per table, complete
  profiles.json
  meetings.json
  meeting_documents.json
  audit_log.json
  ...
  documents/              Every PDF in its exact storage path
    municipalities/<id>/meetings/<id>/agendas/v1-....pdf
```

Three things it does that a plain file copy does not:

- **Verifies as it goes.** Every PDF is checked against the SHA-256 recorded when it was uploaded. A corrupted or missing file is reported in `MANIFEST.json` under `problems`, and the command exits non-zero — so a scheduled run fails loudly rather than producing a quietly incomplete backup.
- **Keeps superseded versions.** Earlier versions of replaced documents are backed up too. An accidental replacement is only recoverable if the file it replaced was kept.
- **Preserves storage paths exactly.** The folder layout under `documents/` is what a restore uploads back, unchanged.

### Checking a backup is good

Open `MANIFEST.json` and look at `problems`. An empty list means every document
downloaded and every checksum matched.

### Scheduling it

Weekly at minimum; nightly for an active clerk's office. On macOS or Linux,
a cron entry that runs it and keeps the last 30:

```bash
0 2 * * * cd /path/to/local-government-records && \
  npm run backup -- --out /path/to/backups >> /path/to/backup.log 2>&1
```

**Then copy the folder somewhere else.** A backup living only in the same
account as the original protects against deletion, not against losing the
account. External drive, S3 with object lock, Backblaze B2, or the city's
existing records retention system — any of these, as long as it is not the
same Supabase project.

The folder contains public records plus staff names and email addresses. Store
it accordingly.

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
2. Restore storage from the matching backup — the closest one **at or before** the database restore point. A storage backup newer than the database leaves objects with no rows pointing at them.
3. Spot-check: open three published meetings and their PDFs.

### Restoring from an `npm run backup` folder

If the Supabase project itself is gone and you are rebuilding from scratch:

1. Create a new Supabase project and run `supabase/setup/01-complete-schema.sql` in the SQL Editor.
2. Load the table data. In the SQL Editor, for each table in this order — `municipalities`, `document_types`, `role_permissions`, `profiles`, `meeting_categories`, `meetings`, `meeting_documents`, `audit_log` — insert the rows from the matching `.json` file. The order matters: foreign keys require parents to exist first.
3. Upload `documents/` back into the `meeting-documents` bucket, **preserving the folder structure exactly**. The paths in `meeting_documents.storage_path` must match, or documents will 404.
4. Recreate the staff logins under **Authentication → Users**, then relink them with `supabase/setup/04-add-user.sql`. Auth users live outside the application schema and are not in this backup.
5. Verify with `supabase/setup/03-verify.sql`, then open three published meetings and their PDFs.

Step 4 is the one people forget. The records restore fine; nobody can sign in
to manage them until the logins are recreated.

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
