// features/agents/redux/execution-system/instance-user-input/unsent-launch-store.ts
//
// ============================================================================
//  AN UNSENT AGENT WINDOW SURVIVES THE RELOAD. THE RECIPE HALF.
// ============================================================================
//
// `composer-draft-store.ts` keeps the TEXT a person typed. That was never
// enough for a window: an agent window whose conversation was never sent has
// no row on the server, so on reload its address (`?panels=agent:<id>:m-…`)
// asked the server for a conversation that does not exist — the window came
// back as "Couldn't load this conversation", and the agent, the variables the
// host or the person filled and the context attached to it were gone with it.
// The composer never mounted, so even the saved text had nowhere to land.
//
// So while a conversation is UNSENT (`cacheOnly !== false`) and shown in a
// window, its launch RECIPE is kept here: which agent (and job), which window,
// the variable values (host-filled and person-typed kept apart), the context
// entries, and the page surface it was bound to. On reload the address-bar
// hydrator finds the recipe and relaunches under the SAME conversation id; the
// composer then restores the text through its own store, and says so.
//
// SCOPE: `sessionStorage`, per tab, same as the composer draft — a crash net,
// never a synced store, never sent to the server.
//
// LIFETIME: the recipe dies the moment the conversation stops being a recipe —
// the server confirms it (first send) or the instance is destroyed (the window
// closed). A recipe therefore can never resurrect something already sent: a
// sent conversation has a server row and is loaded, never relaunched.
// ============================================================================

import { DRAFT_TTL_MS } from "@/lib/drafts/useTextDraft";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";

const PREFIX = "matrx.unsent-launch.";

export interface UnsentLaunchRecipe {
  v: 1;
  savedAt: number;
  agentId: string;
  mandateKey: string | null;
  sourceFeature: string | null;
  surfaceKey: string | null;
  /** The page surface the run was bound to; `null` = the explicit opt-out. */
  surfaceName: string | null;
  displayMode: ResultDisplayMode;
  allowChat: boolean | null;
  showVariablePanel: boolean | null;
  /** Values the HOST wired at launch (never shown as the person's words). */
  hostValues: Record<string, unknown>;
  /** Values the person typed or changed. */
  userValues: Record<string, unknown>;
  /** Context entries by key, values exactly as held (envelopes included). */
  context: Record<string, unknown>;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeUnsentLaunch(
  conversationId: string,
  recipe: UnsentLaunchRecipe,
): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(PREFIX + conversationId, JSON.stringify(recipe));
  } catch (err) {
    // Quota or a structure JSON cannot carry: the window simply will not come
    // back after a reload — say so in the console, never silently.
    console.warn(
      `[unsent-launch] could not keep the recipe for ${conversationId}; this unsent window will not survive a reload.`,
      err,
    );
  }
}

export function readUnsentLaunch(
  conversationId: string,
): UnsentLaunchRecipe | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(PREFIX + conversationId);
    if (!raw) return null;
    const recipe = JSON.parse(raw) as UnsentLaunchRecipe;
    if (recipe?.v !== 1 || !recipe.agentId) return null;
    if (Date.now() - recipe.savedAt > DRAFT_TTL_MS) {
      s.removeItem(PREFIX + conversationId);
      return null;
    }
    return recipe;
  } catch {
    return null;
  }
}

export function clearUnsentLaunch(conversationId: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(PREFIX + conversationId);
  } catch {
    /* storage refused — nothing was kept to clear */
  }
}
