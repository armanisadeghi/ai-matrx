/**
 * THE PAGE-TOOL BINDING — which mounted surfaces may hand THIS run their page
 * tools (the surface's `clientTools` and the `apply_surface_write` targets).
 *
 * 🚨 THE CLASS THIS CLOSES (Arman, 2026-10-03: "it should be IMPOSSIBLE for a
 * run to receive a surface tool or any client-side UI tool when it is not
 * bound to that surface"). `buildToolInjection` used to read the page tools
 * off the GLOBAL mounted provider stack (`listLiveSurfaceClientTools()` /
 * `listAgentWritableTargets()`), never off the conversation. So every run
 * built while a page was mounted received that page's tools — a background
 * JSON extraction (`runHeadlessAgentJson`), a mandate launched with
 * `surfaceName: null`, a window agent bound to a different screen. A
 * structured job then called `apply_surface_write` instead of answering, the
 * server parked the turn waiting for the browser's result, nothing answered,
 * and the run hung.
 *
 * The rule, one place, read on every turn:
 *   - A run with NO interface (a headless display mode) or whose caller asked
 *     for a JSON answer (`jsonExtraction.enabled`) gets no page tools at all:
 *     nobody is there to approve a write, and its job is to RETURN a value.
 *   - A page's OWN conversation (the main chat, a builder's test run) gets
 *     only the companion panes beside it (the canvas) — never the page itself.
 *   - Any other run gets the tools of the surface it was LAUNCHED on (the
 *     conversation's `surfaceName` stamp) and that surface's ancestors —
 *     nothing from any other screen that happens to be mounted.
 *   - No stamp ⇒ no page tools.
 *
 * Guard: `__tests__/page-tools-only-reach-a-bound-run.test.tsx`.
 */

import type { ChatRootState } from "../../../../store/root-state";
import { isHeadlessDisplayMode } from "../../../utils/run-ui-utils";
import { isPageOwnConversation } from "../../../../surfaces/runtime/SurfaceRuntimeContext";
import { isCompanionSurface } from "../../../../surfaces/runtime/surface-chain";
import { getSurfaceAncestry } from "../../../../surfaces/runtime/registry";

export type PageToolBinding =
  | {
      bound: true;
      via: "own-page" | "launch-surface";
      /** Whether a mounted surface's page tools may reach this run. */
      accepts: (surfaceName: string) => boolean;
    }
  | {
      bound: false;
      reason: "headless" | "json-answer" | "not-bound";
    };

/**
 * True when nobody can see or answer this run in the browser — no page tool,
 * and no route-guessed surface (which would bring the route's client-executed
 * UI tools) may reach it.
 */
export function isRunWithoutInterface(
  state: ChatRootState,
  conversationId: string,
): boolean {
  const ui = state.instanceUIState?.byConversationId[conversationId];
  if (!ui) return false;
  if (ui.displayMode && isHeadlessDisplayMode(ui.displayMode)) return true;
  return ui.jsonExtraction?.enabled === true;
}

export function resolvePageToolBinding(
  state: ChatRootState,
  conversationId: string,
): PageToolBinding {
  const ui = state.instanceUIState?.byConversationId[conversationId];
  if (ui?.displayMode && isHeadlessDisplayMode(ui.displayMode)) {
    return { bound: false, reason: "headless" };
  }
  if (ui?.jsonExtraction?.enabled === true) {
    return { bound: false, reason: "json-answer" };
  }
  if (isPageOwnConversation(conversationId)) {
    return {
      bound: true,
      via: "own-page",
      accepts: (surfaceName) => isCompanionSurface(surfaceName),
    };
  }
  const stamp =
    state.conversations?.byConversationId[conversationId]?.surfaceName ?? null;
  if (!stamp) return { bound: false, reason: "not-bound" };
  const allowed = new Set<string>([stamp, ...getSurfaceAncestry(stamp)]);
  return {
    bound: true,
    via: "launch-surface",
    accepts: (surfaceName) => allowed.has(surfaceName),
  };
}

const announced = new Set<string>();

/**
 * Nothing fails silently: once per conversation, say which mounted page tools
 * this run did NOT receive and why.
 */
export function announceUnboundPageTools(
  conversationId: string,
  reason: string,
  withheld: readonly string[],
): void {
  if (withheld.length === 0) return;
  const key = `${conversationId}:${reason}`;
  if (announced.has(key)) return;
  announced.add(key);
  console.info(
    `[page-tools] conversation ${conversationId} is not bound to the page that offers ${withheld.join(", ")} (${reason}) — those tools are not sent. A run receives page tools only from the surface it was launched on.`,
  );
}
