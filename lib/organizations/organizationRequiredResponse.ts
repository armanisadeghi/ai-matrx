// lib/organizations/organizationRequiredResponse.ts
//
// The HTTP half of the organization refusal: the `NextResponse` a route
// handler answers with. It lives apart from the error class and the
// memberships read (`organizationRequiredServerError.ts`) for one mechanical
// reason — `next/server` must never be dragged into a browser bundle, and
// `lib/organizations/personalOrg.ts`, which raises the refusal, is imported
// by client code (`usePreferenceSync`, every `ensureOrgId` callsite). Keeping
// the throw in a `next/server`-free leaf is what lets both sides share ONE
// error class instead of two that `instanceof` cannot match.
//
// Everything from the leaf is re-exported here, so a route handler has one
// import path and never has to know about the split.

import { NextResponse } from "next/server";
import {
  organizationRequiredEnvelope,
  type OrganizationRequiredServerError,
} from "@/lib/organizations/organizationRequiredServerError";

export * from "@/lib/organizations/organizationRequiredServerError";

/** The 400 every route answers a missing organization with. */
export function organizationRequiredResponse(
  error: OrganizationRequiredServerError,
): NextResponse {
  return NextResponse.json(organizationRequiredEnvelope(error), { status: 400 });
}
