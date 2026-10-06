// The server's OpenAPI contract as types, for the default server client (server-api.ts).
//
// The same generated `paths` the app's typed client is bound to (`@ai-matrx/agents/generated/api-types`),
// so package call sites type-check identically whether a host registers its own client or not:
// the path literal decides the body and the response, never an asserted `T`.

import type { components, paths } from "@ai-matrx/agents/generated/api-types";

export type ApiHttpMethod = "get" | "post" | "put" | "patch" | "delete";

export type PathWith<M extends ApiHttpMethod> = {
  [P in keyof paths]: paths[P] extends Record<M, infer Op> ? (Op extends undefined | never ? never : P) : never;
}[keyof paths];

type OpOf<P extends keyof paths, M extends ApiHttpMethod> = paths[P] extends Record<M, infer O> ? O : never;

export type JsonBodyOf<O> = O extends { requestBody: { content: { "application/json": infer B } } }
  ? B
  : O extends { requestBody?: { content: { "application/json": infer B } } }
    ? B | undefined
    : never;

export type OkJsonOf<O> = O extends { responses: { 200: { content: { "application/json": infer T } } } }
  ? T
  : O extends { responses: { 201: { content: { "application/json": infer T } } } }
    ? T
    : O extends { responses: { 204: unknown } }
      ? null
      : unknown;

export type PostBody<P extends keyof paths> = JsonBodyOf<OpOf<P, "post">>;
export type PatchBody<P extends keyof paths> = JsonBodyOf<OpOf<P, "patch">>;
export type GetResult<P extends keyof paths> = OkJsonOf<OpOf<P, "get">>;
export type PostResult<P extends keyof paths> = OkJsonOf<OpOf<P, "post">>;
export type PatchResult<P extends keyof paths> = OkJsonOf<OpOf<P, "patch">>;

export type ApiPaths = paths;
export type ApiSchemas = components["schemas"];

/** What the broker mints (`POST /broker/tokens`). */
export type DefaultBrokeredCredential = components["schemas"]["BrokeredCredential"];

/** Per-call options every default request accepts (the app's `RequestOptions` vocabulary). */
export interface DefaultRequestOptions {
  signal?: AbortSignal;
  requestId?: string;
  baseUrlOverride?: string;
  timeoutMs?: number;
  /** false: the caller classifies its own failure; nothing is reported globally. */
  captureErrors?: boolean;
  guestFingerprint?: string;
  idempotencyKey?: string;
  organizationId?: string;
}
