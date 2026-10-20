# Production release gate for 100 MiB automatic publication

**NOT RELEASED.** Passing CI checks do not establish that uploaded HTML/JS is safe.

## Verified so far
- 95 MiB multipart upload and private ZIP metadata inspection observed in the Zynox UI.
- Integration branch TypeScript build and unit tests passed.
- Game registration and private staging exist as separate code paths.

## Blocking defects
1. Registered large upload session transitions to `registered_private`; `stageInspectedUpload` accepts only `inspected`. No verified registration-to-staging transition exists.
2. Staged files are under `private-validation/{sessionId}/files/`, but the game runtime and manual approval expect `staged/{gameId}/files/` and `staged/{gameId}/manifest.json`.
3. No completed automatic publication orchestrator with trusted server-side safety evidence.
4. The 95 MiB fixture is only metadata-tested. Full per-file CRC/extraction and runtime play were not tested on Cloudflare.
5. The emergency unpublish endpoint is only tested against mocked R2/D1; live runtime cache invalidation and denial of revoked games remain unverified.
6. Need integration tests for crash recovery, retries, malicious HTML/JS, origin isolation, and real Cloudflare runtime behavior.

## Mandatory release criteria
- Build a durable upload -> inspect -> register -> stage -> verify -> publish state machine, with idempotent transitions.
- Every extracted asset must be verified and available under the runtime's expected keys before any DB `approved` state.
- Require verified isolated runtime origin, restrictive CSP, and effective revocation.
- Enforce file count, per-entry and aggregate limits; reject unsupported ZIP variants and malicious content.
- Confirm 95 MiB upload, automated verification, public listing, playback, report, and emergency unpublish on a non-production deployment.
- Only then merge and deploy, with a rollback plan and audit logs.
