/**
 * Server seam (P9) — whether the admin door is open on this page. Same names the call sites imported from the
 * host's `lib/api/adminDoor`; each forwards at call time to the configured host's server
 * client (`../server.ts`).
 */

import { forwardServer } from "../server";

export const adminDoorOpen = forwardServer("adminDoorOpen");
