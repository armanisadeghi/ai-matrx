import "server-only";

import { headers } from "next/headers";
import {
  captureAuthDestination,
  loginHref,
} from "@/utils/auth/auth-destination";

/** Build the login URL for the exact request path and query stamped by proxy. */
export async function currentRequestLoginHref(
  fallbackDestination?: string,
): Promise<string> {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") || fallbackDestination;
  const search = requestHeaders.get("x-search-params") || "";
  return loginHref(captureAuthDestination(pathname, search));
}
