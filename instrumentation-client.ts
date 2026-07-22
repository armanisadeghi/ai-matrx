/**
 * Client instrumentation — runs before the application's own code hydrates.
 *
 * This is the earliest client hook Next.js provides, which is exactly what the
 * stream tap needs: a stream kicked off during boot must be recorded like any
 * other. Installing from a component would miss anything that fetches before
 * that component mounts.
 */

import { installStreamTap } from "@/lib/diagnostics/stream-capture/install-fetch-tap";

installStreamTap();
