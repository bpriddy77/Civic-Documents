City of Forsan — meeting records backup
Created Fri, 14 Aug 2026 19:39:09 GMT

WHAT IS IN HERE

  *.json           One file per database table, complete.
  documents/       Every PDF, current and superseded, in its storage path.
  MANIFEST.json    Every file with its size and SHA-256 checksum.

HOW TO CHECK THIS BACKUP IS GOOD

  Open MANIFEST.json and look at "problems". An empty list means every
  document was downloaded and every checksum matched what the database
  recorded at upload time.

HOW TO RESTORE

  See docs/BACKUP-RESTORE.md in the application repository.
  In short: restore the database first, then upload documents/ back into
  the meeting-documents bucket, preserving the folder structure exactly.
  The paths in documents/ are the storage paths — they must not change.

KEEP A COPY SOMEWHERE ELSE

  A backup stored only in the same account as the original protects
  against deletion, not against losing the account. Copy this folder to
  external storage, or to the city's records retention system.

  These files contain public records plus staff names and email
  addresses. Store accordingly.
