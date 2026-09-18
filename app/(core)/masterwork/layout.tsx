import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRouteMetadata } from "@/utils/route-metadata";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/masterwork", {
  title: "Masterwork",
  description:
    "Your expertise as rules you approve — built into a system that works exactly your way, proven against plain AI.",
  letter: "M",
});

/**
 * `/masterwork` is the public module landing. Every other Masterwork route is
 * a private workspace, except Vision Interview which owns its intentional
 * server-rendered guest gate below. Keeping this boundary at the route root
 * means a new private sibling cannot accidentally bypass it by sitting beside
 * the Rulebook `[id]` tree (as Encore previously did).
 */
export default async function MasterworkLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname") || "/masterwork";
  const hasGuestLanding =
    pathname === "/masterwork" ||
    pathname.startsWith("/masterwork/vision-interview");

  if (hasGuestLanding) return <TouchFloor>{children}</TouchFloor>;

  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    redirect(await currentRequestLoginHref("/masterwork"));
  }

  return <TouchFloor>{children}</TouchFloor>;
}

/**
 * 🚨 THE TOUCH FLOOR FOR EVERY MASTERWORK ROUTE.
 *
 * Measured live at 390×844 on 2026-09-17: `/masterwork/<id>` rendered 90
 * controls of which 65 were under the 44px floor, and only seven of those were
 * design-system `Button`s (whose own floor landed in
 * `@ai-matrx/design-system` 0.21.0). The other fifty-eight were raw
 * `<button>`/`<a>` elements — "Answer this", "Talk it through", "Both are right
 * — keep both", the rule chips, the version link — inheriting no primitive at
 * all, at heights of 12 to 40px.
 *
 * Per-element padding does not hold: the next component added to a lane
 * re-breaks it. `.matrx-touch-targets` (app/globals.css) is the platform's ONE
 * coarse-pointer hit-area utility and is written for exactly this — a SUBTREE
 * floor that also covers files written later. Putting it at the route root
 * covers every Masterwork page and every lane rendered inside the tree, in one
 * place, and it applies only under `pointer: coarse` or below `lg`, so desktop
 * density at 1440 is untouched.
 *
 * `display: contents` because this must not become a box: every Masterwork page
 * sits in the `(core)` shell's `h-full overflow-hidden` scroll chain, and a real
 * wrapper div would be an extra non-flex ancestor in the middle of it. A
 * contents box takes part in no layout while descendant selectors still reach
 * through it.
 *
 * A lane rendered through a PORTAL (a Radix dialog, a window panel) leaves this
 * subtree in the DOM and carries the class on its own content root instead.
 */
function TouchFloor({ children }: { children: ReactNode }) {
  return <div className="matrx-touch-targets contents">{children}</div>;
}
