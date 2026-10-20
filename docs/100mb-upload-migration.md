# Zynox: 100 MiB game upload migration

Status: **PRIVATE MULTIPART + METADATA INSPECTION IMPLEMENTED / PUBLICATION NOT ENABLED**. Current user-facing ZIP upload limit remains 10 MiB. The new API does not register a game in the catalog.

## Why changing MAX_FILE_SIZE is unsafe

- `server/games.ts` buffers multipart form data and ZIP contents in a Worker.
- `server/zipValidation.ts` invokes `unzipSync` and limits each uncompressed file to 8 MiB, aggregate to 20 MiB, and file count to 100.
- `server/prepareGame.ts` reads the full ZIP into memory, invokes `unzipSync` again, and rejects ZIPs over 10 MiB.
- `server/admin.ts` approves a manifest with at most 100 files.
- Request body limits depend on Cloudflare account plan. A 100 MiB ZIP plus multipart overhead can exceed a 100 MB request ceiling.

## Required implementation sequence

1. Introduce authenticated upload sessions in D1, with owner ID, intended file size (<=100 MiB), expiry, state, metadata and R2 object key. Never accept arbitrary client-selected keys. Require same-origin mutations.
2. Use R2 multipart upload with chunks (e.g. 5 MiB except last), session-bound part numbers, capped chunk sizes and per-user rate/size limits. Stream each request body to R2 rather than buffering it. Abort abandoned uploads and clean expired sessions.
3. Complete upload only after verifying part list, total object size and owner/session state. Mark it **unverified/private**. Never expose an unverified object through the game runtime.
4. Replace whole-buffer ZIP verification with bounded streaming/ranged inspection of central directory and entries. Reject ZIP64 unless explicitly supported, encryption, unsupported methods, duplicate/case-colliding names, traversal, symlinks, data descriptors inconsistent with directory, overlapping ranges, zip bombs and CRC mismatches. Enforce max 100 MiB compressed, bounded expanded total and per-file limits, plus file count.
5. Replace `unzipSync` staging with bounded per-entry streaming decompression, verifying checksums and writing R2 assets privately. Produce manifest only after every file succeeds. Keep moderation approval as a separate step.
6. Update admin checks and runtime file delivery for expanded limits. Require staged manifest to be complete and verified before approval.
7. Add browser chunk progress, cancel/retry, error recovery, and thumbnail handling. Do not lose existing <=10 MiB upload path until end-to-end tests pass.
8. Test malformed archives, large valid games, interrupted upload, concurrent sessions, failed validation, mobile networks, and memory/CPU budgets; then raise the UI limit.

## Operational safeguards

- Cap active sessions and total stored bytes per user.
- Apply per-user upload quotas and periodic cleanup.
- Monitor Worker CPU/memory, R2 costs, errors and failed uploads.
- Keep old games and their published manifests unchanged.
- Do not store R2 S3 API credentials in the frontend or Git repository.

## Phase 2 implemented

- Multipart `/api/large-uploads/:id/complete` accepts the ordered list of uploaded R2 part ETags and verifies the final object size.
- `server/largeZipInspection.ts` reads only the ZIP tail and bounded central-directory ranges from R2; rejects many malformed archives, unsupported extensions, unsafe names, ZIP64 and excessive expanded-size metadata.
- On metadata rejection the object is removed; on success it remains private under `unverified/` and the session becomes `inspected`.
- **Not a security clearance:** central-directory metadata can lie. Full local-header consistency checks, bounded streaming extraction, CRC validation, archive collision detection and cleanup still must be implemented before publication. There is currently no user-facing large-upload button.
- Do not enable the 100 MiB UI or register these objects as games until the full pipeline and tests are complete.

## Phase 3: ZIP local-header consistency checks

- Cross-check each local ZIP header against central-directory flags, method, CRC and size fields.
- Decode and compare local filenames; reject unsupported stored-file size mismatches.
- Require contiguous, non-overlapping entry byte ranges from offset zero to the central directory. Reject hidden prefixes/gaps and overlapping entries.
- Fixed the missing `/complete` route in the multipart upload API.
- These checks are **not** a substitute for decompression, CRC verification, or a security review. Large uploads remain private and are not published.
- Still needed: bounded streaming extraction, per-file CRC validation, lifecycle cleanup, end-to-end tests and UI rollout.
