# File Upload Component (Production Guide)

This module is a chunked, resumable file uploader for Next.js App Router with a reusable UI and pluggable backend storage/metadata layers.

## What This Module Provides

- Chunked upload protocol for large files
- Resume support after refresh using server session state
- Parallel chunk upload for faster transfer
- Public file output under `public/uploads`
- Internal upload state under `.upload-state`
- Security controls for production workloads

## Architecture

### Client

- UI component: `app/file_upload/components/file-upload.tsx`
- Upload orchestration hook: `hooks/use-upload.ts`
- Client helpers: `lib/uploads/client.ts`

### Server

- API route: `app/api/file-upload/route.ts`
- Route handler/orchestration: `lib/uploads/route-handler.ts`
- Storage provider: `lib/uploads/storage.ts`
- Metadata store: `lib/uploads/metadata-store.ts`
- Validation/security utilities: `lib/uploads/utils.ts`
- Runtime config parser: `lib/uploads/config.ts`

### API Protocol

1. `POST /api/file-upload` initialize upload session
2. `PATCH /api/file-upload` upload chunk (`x-upload-id`, `x-chunk-index`)
3. `PUT /api/file-upload` finalize upload
4. `DELETE /api/file-upload?uploadId=...` abort session
5. `GET /api/file-upload` list active sessions + completed files

## Security Controls Implemented

- Filename sanitization and path-safe stored naming
- Extension denylist for executable/script formats
- Optional MIME allowlist
- Optional max file size limit
- Request content-type validation (`json` for init/finalize, `octet-stream` for chunks)
- Chunk size enforcement at API level
- Session TTL with automatic expiry handling
- Rate limiting per action
- Optional same-origin enforcement
- Optional API token enforcement
- Static `/uploads/*` hardening headers in `next.config.ts`

## Production Access Control (Important)

Set these env values in production:

```bash
UPLOAD_REQUIRE_ACCESS_TOKEN=true
UPLOAD_ACCESS_TOKEN=<strong-random-secret>
UPLOAD_ENFORCE_ORIGIN_CHECK=true
```

The API accepts token in either:

- `Authorization: Bearer <token>`
- `x-upload-access-token: <token>`

If token mode is enabled and token is missing/invalid, API returns `401`.
If token mode is enabled but token is not configured, API returns `500` (misconfiguration).

## Full Runtime Configuration

```bash
UPLOAD_CHUNK_SIZE_BYTES=8388608
UPLOAD_MAX_FILE_SIZE_BYTES=0
UPLOAD_ALLOWED_MIME_TYPES=image/*,application/pdf,text/plain
UPLOAD_MAX_REQUESTS_PER_MINUTE=600
UPLOAD_SESSION_TTL_SECONDS=86400
UPLOAD_ENFORCE_ORIGIN_CHECK=true
UPLOAD_REQUIRE_ACCESS_TOKEN=true
UPLOAD_ACCESS_TOKEN=<strong-random-secret>
```

Notes:

- `UPLOAD_MAX_FILE_SIZE_BYTES=0` means unlimited by app policy
- if `UPLOAD_ALLOWED_MIME_TYPES` is unset, MIME allowlist is disabled
- keep `UPLOAD_ACCESS_TOKEN` in secrets manager, not in source control

## Reuse In Another Project

Copy these modules with the same relative structure:

- `app/api/file-upload/route.ts`
- `app/file_upload/components/*`
- `hooks/use-upload.ts`
- `lib/uploads/*`
- `types/upload.ts`

If your project does not use the `@/*` alias, update imports.

Render UI:

```tsx
import { FileUpload } from '@/app/file_upload/components/file-upload';

export default function UploadPage() {
  return <FileUpload endpoint="/api/file-upload" multiple />;
}
```

## Required Git Ignore Entries

```gitignore
/public/uploads/
/.upload-state/
```

## Database Integration (Recommended For Production)

Current metadata store is JSON (`.upload-state/meta.json`).
For production, replace metadata persistence with DB while keeping file storage provider pluggable.

Suggested table:

```sql
CREATE TABLE uploaded_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  public_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL,
  uploader_id TEXT NULL,
  checksum_sha256 TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Integration steps:

1. Implement `UploadMetadataStore` with DB-backed `append()` and `list()`
2. Inject custom metadata store via `createUploadRouteHandlers({ metadataStore })`
3. Keep current disk storage provider or replace with object storage provider implementing `UploadStorageProvider`

## Production Runbook

1. Configure env vars (including token + origin checks)
2. Ensure `/public/uploads` and `/.upload-state` are writable in runtime environment
3. Confirm security headers on `/uploads/*`
4. Validate behavior:
   - blocked extension returns `400`
   - missing/invalid token returns `401`
   - expired session returns `410`
   - rate-limit overflow returns `429`
5. Run `npm run build` before deploy
6. Add monitoring/alerts for `401/410/429/5xx` on upload endpoints

## Additional Hardening Recommended

- integrate malware scanning before final file availability
- enforce authz per file (owner/tenant)
- add periodic cleanup for abandoned `.upload-state` artifacts
- add file checksum verification and audit logs
- use signed/private download links if files must not be public

