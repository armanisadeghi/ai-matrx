// features/administration/canonicalization/utils/apiClient.ts
//
// The canonicalization toolkit's `/api/admin/canonicalization/**` routes
// return plain JSON (`{ error }` on failure, or a route-specific success
// shape). `Response.json()` types as `Promise<any>` in the DOM lib, so every
// call site was treating the payload as implicitly-`any` and reading
// `data.error` / casting `data.xxx as SomeType` without ever checking the
// response actually looks like that shape. This helper narrows the JSON body
// to `JsonObject` (types/json.ts) honestly, so a malformed/empty body throws
// a clear error instead of silently producing `undefined` fields.

import { isJsonObject, type JsonObject } from "@/types/json";

/** Parses a fetch Response body as a JSON object, throwing if it isn't one. */
export async function readJsonObject(res: Response): Promise<JsonObject> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(res.statusText || "Response was not valid JSON");
  }
  if (!isJsonObject(body)) {
    throw new Error(res.statusText || "Unexpected response shape");
  }
  return body;
}

/** Extracts the `error` string from a route's error payload, falling back to the HTTP status text. */
export function errorMessageFrom(body: JsonObject, res: Response): string {
  return typeof body.error === "string" && body.error ? body.error : res.statusText || "Request failed";
}
