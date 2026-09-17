/**
 * 🚨 A CONTRACT-AHEAD DECLARATION THAT DELETES ITSELF.
 *
 * `callApi`'s `path` is `keyof paths`, generated from the aidream checkout by
 * `pnpm sync-types`. The `/connected-sources` endpoints are built and pushed;
 * until the deploy train ships them and someone regenerates that file, the
 * canonical caller cannot name endpoints that already exist. This closes the
 * gap with exactly those operations and nothing else.
 *
 * 🚨 HOW IT DIES. Interface declaration merging refuses a duplicate property
 * whose type differs, so the moment `pnpm sync-types` writes the real
 * `/connected-sources/...` operations, every key here collides and
 * `pnpm type-check` fails by name. This file is DELETED in that session. It is
 * not a shim to live beside the generated types, and it must never gain a key
 * the server does not serve — a key here the server never ships is a 404
 * nobody sees. (Mirrors `features/source-library/contract-paths.ts`, which
 * earned this pattern.)
 *
 * Shapes live once, in `./types.ts`.
 */

import type {
  ConnectedAdapterRow,
  ConnectedBrowseRequest,
  ConnectedBrowseResponse,
  GoogleCommentsResponse,
  GooglePresentationResponse,
  GoogleRevisionsResponse,
} from "./types";

type Json<T> = { content: { "application/json": T } };
type Ok<T> = { responses: { 200: Json<T> } };
type Body<T> = { requestBody: Json<T> };
type GoogleFileBody = Body<{ connection_id: string; file_id: string }>;

declare module "@/types/python-generated/api-types" {
  interface paths {
    /** Which adapters this person can browse, and why not for the rest. */
    "/connected-sources/adapters": {
      get: Ok<{ adapters: ConnectedAdapterRow[] }>;
    };
    /** Every adapter that exists, connected or not — the capability map. */
    "/connected-sources/adapters/catalog": {
      get: Ok<{ adapters: ConnectedAdapterRow[] }>;
    };
    /** One page of Sources out of a connected account. */
    "/connected-sources/browse": {
      post: Body<ConnectedBrowseRequest> & Ok<ConnectedBrowseResponse>;
    };
    /** The corrections on a picked Google file. */
    "/connected-sources/google/comments": {
      post: GoogleFileBody & Ok<GoogleCommentsResponse>;
    };
    "/connected-sources/google/revisions": {
      post: GoogleFileBody & Ok<GoogleRevisionsResponse>;
    };
    "/connected-sources/google/presentation": {
      post: GoogleFileBody & Ok<GooglePresentationResponse>;
    };
  }
}
