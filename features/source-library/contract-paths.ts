/**
 * 🚨 A CONTRACT-AHEAD DECLARATION THAT DELETES ITSELF.
 *
 * WHY THIS FILE EXISTS. `callApi` is the ONE door to the Python server and its
 * `path` is `keyof paths` — a type generated from the aidream checkout by
 * `pnpm sync-types`. The Media Source Catalog was published as a wire contract
 * (`../../../common-docs/projects/media-source-catalog/API-CONTRACT.md`, 0.1.0)
 * BEFORE its implementation, precisely so this lane could build in parallel. So
 * for the length of that overlap the canonical caller cannot name the endpoints
 * that the canonical contract already specifies.
 *
 * This file closes that gap by augmenting the generated `paths` interface with
 * exactly the operations the contract declares, and NOTHING else.
 *
 * 🚨 HOW IT ANNOUNCES ITSELF AND HOW IT DIES. Interface declaration merging
 * REFUSES a duplicate property whose type differs. The moment the server lane
 * ships and `pnpm sync-types` writes the real `/media/...` operations into
 * `types/python-generated/api-types.ts`, every key below collides and
 * `pnpm type-check` fails by name. That is the forcing function: this file is
 * DELETED in that same session and the generated types take over. It is not a
 * shim to live beside them, and it must never gain a key the contract does not
 * publish — a key here that the server never ships is a 404 nobody sees.
 *
 * Shapes live once, in `./types.ts`, which is the TypeScript face of the same
 * contract. This file only binds them to paths and methods.
 */

import type {
    ActionDeclaration,
    CreateJobRequest,
    EstimateRequest,
    EstimateResult,
    JobDetailResponse,
    JobRow,
    LibraryListResponse,
    LibraryRow,
    LibraryMetrics,
    MediaSettingsResponse,
    ResolveResult,
    VideoListResponse,
} from "./types";

type Json<T> = { content: { "application/json": T } };
type Ok<T> = { responses: { 200: Json<T> } };
type Created<T> = { responses: { 201: Json<T>; 200: Json<T> } };
type NoContent = { responses: { 200: Json<null>; 204: { content: never } } };
type Body<T> = { requestBody: Json<T> };

declare module "@/types/python-generated/api-types" {
    interface paths {
        /** §2 — resolve any pasted channel / handle / playlist / video input. */
        "/media/resolve": {
            post: Body<{ input: string; adapter?: string | null }> & Ok<ResolveResult>;
        };
        /** §3 — the saved Library record. Creating does NOT enumerate. */
        "/media/libraries": {
            get: Ok<LibraryListResponse>;
            post: Body<{
                input: string;
                adapter?: string | null;
                name?: string | null;
                description?: string | null;
                visibility?: string;
                organization_id?: string | null;
                settings?: Record<string, unknown> | null;
                sync_now?: boolean;
            }> &
                Created<LibraryRow>;
        };
        "/media/libraries/{library_id}": {
            get: Ok<LibraryRow>;
            patch: Body<{
                name?: string;
                description?: string | null;
                visibility?: string;
                settings?: Record<string, unknown>;
            }> &
                Ok<LibraryRow>;
            delete: NoContent;
        };
        /** §4 — the one enumeration door, and the manual "bring up to date". */
        "/media/libraries/{library_id}/sync": {
            post: Body<{
                mode?: "full" | "incremental";
                classify?: boolean;
                stream?: boolean;
            }> &
                Ok<unknown>;
        };
        /** §6 — classify long / short / live. Streams. */
        "/media/libraries/{library_id}/classify": {
            post: Body<{
                video_ids?: string[] | null;
                force?: boolean;
                shorts_threshold_seconds?: number | null;
            }> &
                Ok<unknown>;
        };
        /** §4.2 — the MOUNT READ. A client never depends on catching a stream. */
        "/media/libraries/{library_id}/videos": {
            get: Ok<VideoListResponse>;
        };
        /** §5 — metrics, computed server-side over the whole Library. */
        "/media/libraries/{library_id}/metrics": {
            get: Ok<LibraryMetrics>;
        };
        /** §7.2 — the estimate. Nothing paid runs without it. */
        "/media/libraries/{library_id}/estimate": {
            post: Body<EstimateRequest> & Ok<EstimateResult>;
        };
        /** §7.3 — every Action runs through this one endpoint. */
        "/media/libraries/{library_id}/jobs": {
            post: Body<CreateJobRequest> & Created<JobRow>;
        };
        /** §7 — the job mount read. */
        "/media/jobs/{job_id}": {
            get: Ok<JobDetailResponse>;
        };
        "/media/jobs/{job_id}/stream": {
            get: Ok<unknown>;
        };
        "/media/jobs/{job_id}/resume": {
            post: Ok<{ job: JobRow; reclaimed: number }>;
        };
        "/media/jobs/{job_id}/retry-failed": {
            post: Ok<{ job: JobRow; requeued: number }>;
        };
        "/media/jobs/{job_id}/cancel": {
            post: Ok<JobRow>;
        };
        /** §8 — the Action registry. ONE server declaration is enough to appear. */
        "/media/actions": {
            get: Ok<{ actions: ActionDeclaration[] }>;
        };
        /** §9 — the knobs, each carrying where its value came from. */
        "/media/settings": {
            get: Ok<MediaSettingsResponse>;
            put: Body<{
                scope: "org" | "library";
                library_id?: string | null;
                values: Record<string, unknown>;
            }> &
                Ok<MediaSettingsResponse>;
        };
    }
}
