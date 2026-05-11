// features/scheduling/constants/surfaces.ts
//
// Canonical surface values. Kept in lockstep with the
// sch_task_surfaces_chk CHECK constraint in migrations/sch_server_surface.sql.

import type { Surface } from "../types";

export const SURFACE_VALUES: readonly Surface[] = [
  "any",
  "chrome-extension-chat",
  "desktop",
  "web",
  "mobile",
  "sandbox",
  "server",
] as const;

export interface SurfaceMeta {
  value: Surface;
  label: string;
  description: string;
}

export const SURFACE_META: Record<Surface, SurfaceMeta> = {
  any: {
    value: "any",
    label: "Any",
    description: "First eligible online surface picks it up.",
  },
  server: {
    value: "server",
    label: "Server",
    description:
      "AI Matrx Python backend. Always-on. Best default for headless tasks.",
  },
  "chrome-extension-chat": {
    value: "chrome-extension-chat",
    label: "Chrome extension",
    description:
      "AI Matrx Chrome extension. Required for tasks that need page DOM access.",
  },
  desktop: {
    value: "desktop",
    label: "Desktop app",
    description:
      "AI Matrx desktop app. Runs while the app is open.",
  },
  web: {
    value: "web",
    label: "This web app",
    description:
      "aimatrx.com. Observe-only in v1 — web does not yet execute tasks.",
  },
  mobile: {
    value: "mobile",
    label: "Mobile",
    description: "Future mobile app surface.",
  },
  sandbox: {
    value: "sandbox",
    label: "Sandbox",
    description: "Future sandbox runner.",
  },
};
