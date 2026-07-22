/**
 * Client instrumentation — runs before the application's own code hydrates.
 *
 * This is the earliest client hook Next.js provides, which is exactly what the
 * capture tap needs: a request made during boot must be recorded like any
 * other. Installing from a component would miss anything that fetches before
 * that component mounts.
 *
 * The tap starts in `minimal` mode (a 3-exchange rolling window that cannot
 * accumulate). Full retention is opt-in and admin-gated — see
 * `CaptureModeController`.
 */

import { installCaptureTap } from "@/lib/diagnostics/stream-capture/install-fetch-tap";

installCaptureTap();
