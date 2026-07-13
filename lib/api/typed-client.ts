/**
 * lib/api/typed-client.ts
 *
 * Path-keyed, contract-bound wrapper around the raw Python client
 * (`lib/python-client.ts`). This is the ONLY sanctioned way to call the
 * Python backend from feature code.
 *
 * Why this exists
 * ---------------
 * The raw helpers (`postJson<T>`, `postMultipart<T>`, …) take a plain
 * `string` path and an *asserted* response type `T`. Nothing links the
 * path you call, the body you send, and the response you claim to the
 * server's actual OpenAPI contract. That gap shipped a production 400:
 * the FE hand-mirrored `PreviewVariantSpec` with a `key` field while the
 * backend had renamed it to `preset_id`. TypeScript was green because it
 * was checking a hand-written lie against itself.
 *
 * These wrappers close the gap. Every function is generic over a *path
 * literal* from the generated `paths` interface. The request body and the
 * success response are DERIVED from `operations[...]`, never asserted:
 *
 *   - Wrong path              → compile error (not a key of `paths`).
 *   - Wrong body shape / key  → compile error (must match `requestBody`).
 *   - Wrong response field     → compile error (response is the real type).
 *
 * When the backend changes and `pnpm sync-types` regenerates
 * `types/python-generated/api-types.ts`, every drifted callsite lights up
 * red in the same PR. That is the whole point.
 *
 * Regenerate the contract: `pnpm sync-types` (Supabase + Python OpenAPI).
 *
 * NOTE: path-parameter endpoints (`/assets/{file_id}`) are handled by
 * `buildPath()` — pass the template literal + params so the key still
 * type-checks against `paths`. Query-only and no-param endpoints pass the
 * path literal directly.
 */

import type { paths } from "@/types/python-generated/api-types";
import {
  del,
  getJson,
  patchJson,
  postJson,
  postMultipart,
  putJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";

// ---------------------------------------------------------------------------
// Contract-derivation helpers (type-level only — zero runtime cost)
// ---------------------------------------------------------------------------

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Every path literal in the contract that defines a real operation for M. */
export type PathWith<M extends HttpMethod> = {
  [P in keyof paths]: paths[P] extends Record<M, infer Op>
    ? Op extends undefined | never
      ? never
      : P
    : never;
}[keyof paths];

/** The operation object registered for (path P, method M). */
type OpOf<P extends keyof paths, M extends HttpMethod> = paths[P] extends Record<
  M,
  infer O
>
  ? O
  : never;

/** JSON request body of an operation. `undefined` when the body is optional. */
export type JsonBodyOf<O> = O extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : O extends { requestBody?: { content: { "application/json": infer B } } }
    ? B | undefined
    : never;

/** The 2xx `application/json` success payload of an operation. */
export type OkJsonOf<O> = O extends {
  responses: { 200: { content: { "application/json": infer T } } };
}
  ? T
  : O extends { responses: { 201: { content: { "application/json": infer T } } } }
    ? T
    : O extends { responses: { 204: unknown } }
      ? null
      : unknown;

// Convenience aliases keyed by (path, method).
type PostBody<P extends keyof paths> = JsonBodyOf<OpOf<P, "post">>;
type PatchBody<P extends keyof paths> = JsonBodyOf<OpOf<P, "patch">>;
type PutBody<P extends keyof paths> = JsonBodyOf<OpOf<P, "put">>;

type GetResult<P extends keyof paths> = OkJsonOf<OpOf<P, "get">>;
type PostResult<P extends keyof paths> = OkJsonOf<OpOf<P, "post">>;
type PatchResult<P extends keyof paths> = OkJsonOf<OpOf<P, "patch">>;
type PutResult<P extends keyof paths> = OkJsonOf<OpOf<P, "put">>;
type DeleteResult<P extends keyof paths> = OkJsonOf<OpOf<P, "delete">>;

type Envelope<T> = Promise<{ data: T; meta: ResponseMeta }>;

// ---------------------------------------------------------------------------
// Path-parameter interpolation
// ---------------------------------------------------------------------------

/**
 * Fill a path template's `{param}` slots while keeping the *template* literal
 * (not the interpolated runtime string) as the type the client checks against
 * `paths`. Usage:
 *
 *   apiGet(buildPath("/assets/{file_id}", { file_id }))
 *
 * The returned branded string carries the template's literal type so the call
 * still resolves to the correct operation.
 */
export function buildPath<P extends keyof paths>(
  template: P,
  params: Record<string, string | number>,
): P {
  return (template as string).replace(/\{([^}]+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) {
      throw new Error(
        `buildPath: missing path parameter "${k}" for template "${String(template)}"`,
      );
    }
    return encodeURIComponent(String(v));
  }) as P;
}

// ---------------------------------------------------------------------------
// Contract-bound verbs
// ---------------------------------------------------------------------------

/** A query-string value; `null`/`undefined` entries are dropped. */
export type QueryValue = string | number | boolean | null | undefined;

/** Append a query object to a path literal, dropping empty values. */
export function withQuery<P extends string>(
  path: P,
  query?: Record<string, QueryValue>,
): P {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined) continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return (s ? `${path}${path.includes("?") ? "&" : "?"}${s}` : path) as P;
}

/**
 * GET a JSON endpoint. Response is derived from the contract; the path literal
 * stays contract-checked even with query params (passed via `opts.query`, which
 * `withQuery` serializes onto the URL).
 */
export function apiGet<P extends PathWith<"get">>(
  path: P,
  opts?: RequestOptions & { query?: Record<string, QueryValue> },
): Envelope<GetResult<P>> {
  const { query, ...rest } = opts ?? {};
  return getJson<GetResult<P>>(withQuery(path, query), rest);
}

/** POST a JSON body. Body AND response are derived from the contract. */
export function apiPost<P extends PathWith<"post">>(
  path: P,
  body: PostBody<P>,
  opts?: RequestOptions,
): Envelope<PostResult<P>> {
  return postJson<PostResult<P>, PostBody<P>>(path, body, opts);
}

/** PATCH a JSON body. Body AND response are derived from the contract. */
export function apiPatch<P extends PathWith<"patch">>(
  path: P,
  body: PatchBody<P>,
  opts?: RequestOptions,
): Envelope<PatchResult<P>> {
  return patchJson<PatchResult<P>, PatchBody<P>>(path, body, opts);
}

/** PUT a JSON body. Body AND response are derived from the contract. */
export function apiPut<P extends PathWith<"put">>(
  path: P,
  body: PutBody<P>,
  opts?: RequestOptions,
): Envelope<PutResult<P>> {
  return putJson<PutResult<P>, PutBody<P>>(path, body, opts);
}

/** DELETE an endpoint. Response is derived from the contract. */
export function apiDelete<P extends PathWith<"delete">>(
  path: P,
  opts?: RequestOptions,
): Envelope<DeleteResult<P>> {
  return del<DeleteResult<P>>(path, opts) as Envelope<DeleteResult<P>>;
}

/**
 * POST a `multipart/form-data` body. The FormData is built by the caller
 * (multipart field values are stringly at the wire), but the RESPONSE is
 * still derived from the contract — killing the unchecked `<T>` assertion
 * that let the preview 400 through. Type the objects you `JSON.stringify`
 * into the form against their generated `components["schemas"][…]` type so
 * the encoded payload can't drift either.
 */
export function apiMultipart<P extends PathWith<"post">>(
  path: P,
  form: FormData,
  opts?: RequestOptions,
): Envelope<PostResult<P>> {
  return postMultipart<PostResult<P>>(path, form, opts);
}
