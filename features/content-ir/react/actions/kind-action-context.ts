/**
 * The kind-action contract: what a handler receives and returns. Handlers are
 * contributed to the app's ONE action registry by `kind-action-provider.ts`
 * and run by `useKindActionRunner`; this file stays free of any React / hook
 * import (unit-testable, capability-locked).
 */

import type { ManagedAgentOptions } from "@ai-matrx/chat/agents/types/instance.types";
import type { LaunchResult } from "@ai-matrx/chat/agents/redux/execution-system/thunks/launch-agent-execution.thunk";

/**
 * The exact `launchAgent` surface a handler is allowed to use — the same
 * signature `useAgentLauncher` exposes, so the host binds its real launcher
 * with no adapter. A handler cannot reach anything else on the launcher.
 */
export type LaunchAgentFn = (
  agentId: string,
  options?: ManagedAgentOptions,
) => Promise<LaunchResult>;

/** How a run's product is read: the extracted JSON, the answer text, or the generated image. */
export type KindShortcutExpect = "json" | "text" | "image";

/**
 * A generated image, by its durable identity. `file_id` IS the image; every URL
 * is derived from it at render time (the host resolves it into `src`).
 */
export interface KindImageRef {
  file_id: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  /** The organization the file lives in (the run's own) — named on every byte read. */
  organization_id: string | null;
}

/** What a shortcut run produced: the extracted JSON value, the answer text, or a `KindImageRef`. */
export interface KindShortcutRunResult {
  ok: boolean;
  /** JSON value (`expect: "json"`), answer text (`"text"`) or `KindImageRef` (`"image"`). */
  data: unknown;
  /** User-facing reason when `ok` is false. */
  error?: string;
}

/** A saved shortcut, run by the host as the viewing user. */
export interface KindShortcutRequest {
  shortcutId: string;
  /** Values the shortcut's scope mappings read (`selection`, `content`, custom keys). */
  scope?: Record<string, unknown>;
  /** Agent variables by name (merged over what the shortcut maps). */
  variables?: Record<string, unknown>;
  /** What the person typed, when the component collected words from them. */
  userInput?: string;
  /** Words for the live window while it runs ("Writing the visual brief"). */
  label?: string;
}

/**
 * The item's own durable state — what the person (and their actions) added to
 * this rendered item: a generated image, a chosen option, a written brief. It
 * is saved per item (the chat answer's block, or the canvas item) and handed
 * back to the component as its `itemState` prop on every render.
 */
export interface KindItemStateHandle {
  /** False when this render has no record to save into (a preview, a dialog). */
  hosted: boolean;
  /** The current saved state, with unflushed edits on top. */
  read: () => Record<string, unknown>;
  /** Merge-patch; `null` removes a key. Saved server-side, debounced. */
  patch: (patch: Record<string, unknown>) => void;
}

/** The envelope every kind action returns. A skip/failure is never a silent pass. */
export type KindActionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/**
 * Capability-scoped runtime the runner binds for handlers. Deliberately narrow:
 * a handler gets exactly what its capability needs and nothing that widens
 * data reach (never supabase, redux internals, or raw fetch). New capabilities
 * that need a new dependency extend THIS type (reviewed centrally), never the
 * component-facing surface.
 */
export interface KindActionContext {
  /** Launch an agent execution. Bound to the viewing user by the host. */
  launchAgent: LaunchAgentFn;
  /** The acting (viewing) user's id, or null when unauthenticated. */
  userId: string | null;
  /** Open a shortcut the way a menu click does (its own window and display). */
  openShortcut: (request: KindShortcutRequest) => Promise<{ conversationId: string }>;
  /**
   * Run a shortcut to completion and hand back its product. Streams into the
   * floating live-run window while it works (never a silent spinner).
   * `onResult` fires on every exit path, even after the component unmounted —
   * the persistence seam for `saveAs`.
   */
  runShortcut: (
    request: KindShortcutRequest & { expect: KindShortcutExpect },
    onResult?: (result: KindShortcutRunResult) => void,
  ) => Promise<KindShortcutRunResult>;
  /** This item's durable state, or null when the runner was bound without one. */
  itemState: KindItemStateHandle | null;
  /** Open a saved file in the canonical file preview window. */
  openFile: (fileId: string) => void;
  /** Open the canonical share window for a saved file. */
  shareFile: (fileId: string, name: string) => void;
}

/** A kind capability. Pure w.r.t. globals — all deps arrive via ctx. */
export type KindActionHandler = (
  input: unknown,
  ctx: KindActionContext,
) => Promise<KindActionResult>;

export interface KindActionDefinition {
  /** Stable key a component names to invoke it, e.g. "trigger_agent". */
  key: string;
  /** Short name (alchemy's run path names it when the handler throws). */
  label: string;
  /** One line for authoring surfaces + the doctor; never user-facing chrome. */
  description: string;
  handler: KindActionHandler;
}
