# Dedup intent flip — frontend plan

**Status:** Frontend plumbing landed (`phase 1.y`). Backend `/files/upload` has NOT yet flipped to require an `intent` field. This doc captures what the FE will do on flip day.

**Source of truth for the BE contract:** [docs/dedup_phase_2_0_frontend_handoff.md](./dedup_phase_2_0_frontend_handoff.md) §"File-upload dedup contract".

---

## What already shipped on the FE

The "you already have this file" UX is **live today** using the FE-side dedup scan:

1. Every upload runs `computeSHA256Batch(arg.files)` client-side.
2. `scanForDuplicates(...)` checks the user's loaded `filesById` snapshot for:
   - Identical content in the same folder (strongest match).
   - Identical content in another folder.
   - Same filename, different content.
3. `<DuplicateUploadDialog/>` mounts when conflicts exist. Each conflict offers four actions:
   - **Use existing** (default for identical-content matches) — don't re-upload, return the existing `cld_files.id` to the caller.
   - **Overwrite** — version-bump the existing file in place.
   - **Make a copy** — proceed with auto-numbered `" (1)"` suffix.
   - **Skip** — drop this file from the batch entirely.
4. `UploadGuardResult.aliased: Array<{ inputIndex, existingFileId }>` carries every "use existing" decision back to the caller, so consumers like `TaskAttachmentsPanel` can attach the existing fileId without round-tripping through the upload endpoint.

## What's NOT covered by the FE-side scan

The FE only sees files that are currently in `state.cloudFiles.filesById`. Power users with thousands of files may have only a fraction loaded. **The BE flip is what catches that case** — the server has the full hash index.

The Python `FileService.upload_with_intent` already ships at the service level. When `/files/upload` flips to require `intent`, the wire contract becomes:

```ts
// FUTURE — not live today:
formData.append("intent", "create" | "alias_existing" | "force_new_copy");
formData.append("reason", "...");  // required for force_new_copy

// Response when intent="create" and a duplicate exists:
{
  status: 409,
  detail: {
    error: "duplicate_file",
    existing_file_id: "<uuid>",
    existing_file_path: "<path>",
    existing_file_checksum: "<sha256>",
    allowed_intents: ["alias_existing", "force_new_copy"],
  }
}
```

## Flip-day handler

On the day the BE flips, here's exactly what changes on the FE:

### 1. Upload thunk sends `intent`

`features/files/redux/thunks.ts`: `uploadFiles` thunk needs to thread an
`intent` value through to the `Files.uploadFile` API call.

- When `arg.filenameOverrides[i]` is set (overwrite path), send `intent: "create"` — the backend interprets the matching path as version-bump.
- When `arg.skipIndices.includes(i)` (from `use_existing` path), skip the file entirely; no upload at all.
- Otherwise, send `intent: "create"` by default.

The "force_new_copy" path is reached via a 409 retry, not a pre-emptive intent setting (we don't know we need it until the server says so).

### 2. New 409 handler in `UploadGuardHostImpl`

When the dispatch returns a per-file 409 with `error: "duplicate_file"`, the host needs to:

1. Build a synthetic `DuplicateConflictRow` from the 409 body (the FE didn't catch this in pre-flight — it's a "server found a match the FE didn't know about").
2. Look up the `existing_file_id` in `filesById` if loaded, otherwise issue a one-off `getFile(existing_file_id)` to hydrate the row for the dialog.
3. Mount the dialog with this single conflict.
4. On `use_existing` → return `aliased: [{ inputIndex, existingFileId }]`. On `copy` → retry the upload with `intent: "force_new_copy"` and a generated reason. On `skip` → drop.

This is a **second-pass** dialog (after the pre-flight one already cleared, if any). To avoid the user seeing TWO dialogs in sequence, the host should collapse server-side 409s into the same dialog instance whenever possible.

### 3. Backend dedup is now the source of truth

After the flip, the FE-side `scanForDuplicates` becomes a **fast-path optimization**, not the contract:

- Pre-flight dialog: shown when the FE already knows about the duplicate. Saves a round-trip on the happy path.
- 409 dialog: shown when only the BE knew. Same UX, same actions, just a tick of latency.

The FE's pre-flight scan stays valuable: 95% of duplicates are uploads from a folder the user is currently viewing, so the FE catches them and skips the network entirely.

### 4. `duplicate_of_file_id` chain resolution

The dedup consolidation script soft-deletes duplicate `cld_files` rows and stamps `duplicate_of_file_id = keeper.id` on them. When a UI follows a stored file id and finds `deletedAt != null`, it should:

```ts
const file = useFile(fileId).file;
const liveId = file?.duplicateOfFileId ?? fileId;
const liveFile = useFile(liveId).file;
```

`UploadGuardHostImpl` already does this for `use_existing` decisions (`features/files/upload/UploadGuardHostImpl.tsx` — `liveId = c.match.existing.duplicateOfFileId ?? c.match.existing.id`). Any other code path that resolves a stored file id should follow the same chain.

## Open questions for flip day

1. **Reason prompt for `force_new_copy`** — the BE wants a human-readable reason (≥ 4 chars). Should we auto-generate (`"User explicitly chose separate copy from duplicate dialog"`) or prompt? My recommendation: auto-generate, since the user already made the choice in the dialog and prompting twice for the same action is annoying.
2. **Batch 409 collapse** — if the user drops a folder of 20 files and 8 trip the BE 409, do we show ONE dialog with 8 rows or 8 dialogs? Recommend ONE — the existing dialog already handles batch with "Apply to all".
3. **Realtime invalidation** — once aliased, the source bytes were never uploaded but the user thinks "the file is in my library." This is already true; the existing file IS in their library. No action needed.

## Component / API surface checklist for flip day

| Touch | What changes |
|---|---|
| `features/files/api/files.ts:uploadFile` | Accept `intent` + optional `reason` params; pass through to the multipart body. |
| `features/files/redux/thunks.ts:uploadFiles` | Default `intent: "create"`. Wire 409 → host callback. |
| `features/files/upload/UploadGuardHostImpl.tsx` | Add `handle409Conflict(file, body)` path that mounts the existing dialog with one synthetic conflict row. Reuse all existing decision plumbing. |
| `features/files/utils/upload-duplicate-detect.ts` | No changes — still the pre-flight optimization. |
| `features/files/components/core/DuplicateUploadDialog/DuplicateUploadDialog.tsx` | No changes — UX already supports the four actions including "Use existing". |

---

**TL;DR:** the FE-side UX is done. When the BE flips, we add one 409 handler in `UploadGuardHostImpl` and one `intent` field in the upload thunk. Everything else (the dialog, the `aliased` plumbing, the `duplicate_of_file_id` chain, the consumers that attach aliased ids) is already wired.
