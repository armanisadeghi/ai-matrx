import type { ReactNode } from "react";

import { HrSettingsChrome } from "@/features/hr/settings/HrSettingsShell";

/**
 * `/hr/settings/*` — routes 67–81b (SPEC-UI-IA §3.11).
 *
 * The route-tab bar, the employer picker, the module-off door, the activation wizard
 * and the HR-admin gate all live in `HrSettingsChrome`, mounted HERE so they survive
 * navigation between tabs. A page-level copy of any of them would be a second gate
 * that can disagree with this one — and the tab bar would lose its pending state on
 * every hop.
 *
 * No wrapper element: `HrShell` (inside the chrome) injects the route header itself
 * and owns the scroll chain — `h-full min-h-0 flex flex-col` down to one
 * `overflow-y-auto`. A div here would break that chain, and a second header would
 * collide with the one it already injects.
 */
export default function HrSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <HrSettingsChrome>{children}</HrSettingsChrome>;
}
