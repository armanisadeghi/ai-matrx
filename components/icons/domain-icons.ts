/**
 * The domain icons live in `@ai-matrx/icons/domain`. That entry is marked "use client", so
 * the icon NAME strings imported from it by a Server Component arrive as client references
 * (calling them throws — the shell nav then reports "Unregistered icon name"). The names are
 * plain strings the server must read, so they are declared here, in a module with no client
 * boundary; the icon components still come from the package.
 */
export { AGENT_ICON, INTELLIGENCE_ICON } from "@ai-matrx/icons/domain";

/** Must equal the package's `AGENT_ICON_NAME` (the lucide icon it draws). */
export const AGENT_ICON_NAME = "Webhook";
/** Must equal the package's `INTELLIGENCE_ICON_NAME` (the lucide icon it draws). */
export const INTELLIGENCE_ICON_NAME = "BrainCircuit";
