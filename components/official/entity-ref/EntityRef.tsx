"use client";

/**
 * EntityRef — THE way to render a reference to another record.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): if the UI names a thing
 * that has an identity in our system, the UI must let the user reach it. This
 * component is that law made importable — drop it anywhere a name, a title, or
 * (worse) a bare id is being printed, and the user gets every door we can open:
 *
 *   Open      → click the name; canonical route from the entity registry
 *   New tab   → explicit control, so a user deep inside a console/modal never
 *               has to trade their current state for an answer
 *   Peek      → non-blocking preview via the peek registry, when one exists
 *   (Window)  → surfaces pass their own opener through `extraActions`
 *
 * It composes primitives, it does not duplicate them:
 *   - route + icon + label  → `getEntityInfo(token)` (features/scopes/registry)
 *   - preview               → `ResourcePeekHost` + `hasPeek` (features/organizations/peek)
 *
 * Safe inside clickable table rows: every control stops propagation.
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 * give the token an `hrefFor` in `entityRegistry.ts`, and/or a peek in
 * `features/organizations/peek/registry.ts` + `kinds-list.ts`.
 */

import React, { useState } from "react";
import Link from "next/link";
import { ExternalLink, Lightbulb } from "lucide-react";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { allowNativeNewTab } from "@/utils/navigation/should-open-in-new-tab";
import { cn } from "@/lib/utils";

/**
 * Entity tokens whose peek is registered under a different catalogue key.
 *
 * The peek registry is keyed by the LEGACY resource-catalogue vocabulary
 * (`features/organizations/resource-catalogue.ts`), which predates canonical
 * entity tokens and does not match them. Without this bridge a caller passing
 * the correct token silently loses the peek door — the peek component exists,
 * is registered, and is never reachable. Every entry below was verified against
 * the table the peek actually queries:
 *
 *   agent_app  ← features/organizations/peek/kinds/AgentAppPeek.tsx  (app.definition)
 *   picklist   ← ListPeek
 *   canvas     ← CanvasPeek       (canvas.canvas_items    → canvas_item)
 *   flashcard  ← FlashcardPeek    (education.flashcard_data → flashcard_data)
 *   sandbox    ← SandboxPeek      (public.sandbox_instances → sandbox_instance)
 *   quiz       ← QuizPeek         (education.quiz_sessions  → quiz_session)
 *
 * The real fix is renaming the peek registry keys to the canonical tokens; that
 * also touches `resource-catalogue.ts` and the two organizations surfaces that
 * key off `entry.key`, so it is tracked separately in
 * docs/handoffs/inventory-law-sweep.md. Until then this map must stay complete —
 * an unmapped mismatch is an invisible lost door, not a cosmetic gap.
 */
const PEEK_KEY_BY_TOKEN: Record<string, string> = {
  app: "agent_app",
  structured_list: "picklist",
  canvas_item: "canvas",
  flashcard_data: "flashcard",
  sandbox_instance: "sandbox",
  quiz_session: "quiz",
};

export interface EntityRefProps {
  /** Canonical entity token (`agent`, `note`, `task`, …). */
  token: string;
  /** The record's id. */
  id: string;
  /**
   * Display name. When omitted the id is shown truncated — acceptable only
   * when the name genuinely isn't loaded; prefer passing it.
   */
  name?: string | null;
  /** Override the registry route (e.g. an admin-side route for the same record). */
  href?: string;
  /** Show the entity's registry icon before the name. Default true. */
  showIcon?: boolean;
  /** Hide the peek control even when one is registered. */
  disablePeek?: boolean;
  /** Hide the new-tab control (rare — only when the row is already a link). */
  disableNewTab?: boolean;
  /**
   * The name itself opens in a NEW TAB.
   *
   * Set this on any surface embedded in something the user would lose by
   * navigating — a side panel, a workspace rail, a sheet over an editor, a
   * dialog. In-place navigation there is the data-loss THE DOOR LAW's new-tab
   * door exists to prevent, and it is the single easiest regression to
   * introduce when replacing a hand-rolled `window.open` with this component
   * (it has already been caught twice in review).
   *
   * Implemented as a real `target="_blank"` on the anchor — no JS interception,
   * so modified clicks and middle-clicks keep behaving natively. The separate
   * new-tab control is suppressed automatically, since it would be a duplicate.
   */
  openInNewTab?: boolean;
  /** Controls stay visible instead of appearing on hover/focus. */
  alwaysShowActions?: boolean;
  /** Surface-specific extra doors (open in window, jump to versions, …). */
  extraActions?: React.ReactNode;
  /**
   * Intercept the plain left-click on the name — for surfaces that open the
   * record their OWN way (in a window, in a side panel, via a container's
   * `openEntity` handler) instead of navigating the tab.
   *
   * Cmd/Ctrl/Shift/Alt/middle clicks are NOT intercepted: they keep the
   * browser's native new-tab behaviour via the real `href`, so a surface that
   * takes over the click can never cost the user their current state. The
   * explicit new-tab control stays visible regardless.
   *
   * CONTRACT — pass `undefined` when the handler cannot actually open
   * anything. With no registry route AND an `onOpen`, the name renders as a
   * link-styled BUTTON; if that handler then no-ops (because it too was
   * gated on a route that doesn't exist), the user gets a control that looks
   * openable and does nothing — a dead end with extra steps, which is the
   * precise thing this component exists to kill. Gate at the call site:
   * `onOpen={canOpen ? handler : undefined}`.
   */
  onOpen?: () => void;
  className?: string;
}

const CONTROL_CLASS =
  "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground";

export function EntityRef({
  token,
  id,
  name,
  href,
  showIcon = true,
  disablePeek = false,
  disableNewTab = false,
  openInNewTab = false,
  alwaysShowActions = false,
  extraActions,
  onOpen,
  className,
}: EntityRefProps) {
  const [peekOpen, setPeekOpen] = useState(false);

  const info = tryGetEntityInfo(token);
  const resolvedHref = href ?? info?.hrefFor?.(id) ?? null;
  const peekKind = PEEK_KEY_BY_TOKEN[token] ?? token;
  const canPeek = !disablePeek && hasPeek(peekKind);
  const label = name?.trim() || `${id.slice(0, 8)}…`;
  const Icon = info?.Icon ?? null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <span
      className={cn(
        "group/entity-ref inline-flex min-w-0 max-w-full items-center gap-1",
        className,
      )}
    >
      {showIcon && Icon && (
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}

      {resolvedHref ? (
        <Link
          href={resolvedHref}
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noopener noreferrer" : undefined}
          onClick={(e) => {
            stop(e);
            // A modified click keeps the browser's native new-tab behaviour —
            // an interceptor must never cost the user their current state.
            if (!onOpen || allowNativeNewTab(e)) return;
            e.preventDefault();
            onOpen();
          }}
          title={openInNewTab ? `Open ${label} in a new tab` : `Open ${label}`}
          className="min-w-0 truncate text-inherit underline-offset-2 hover:text-primary hover:underline"
        >
          {label}
        </Link>
      ) : onOpen ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
          title={`Open ${label}`}
          className="min-w-0 truncate text-left text-inherit underline-offset-2 hover:text-primary hover:underline"
        >
          {label}
        </button>
      ) : (
        <span className="min-w-0 truncate" title={label}>
          {label}
        </span>
      )}

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5",
          // `opacity-0` alone still takes pointer events, which on a touch
          // device leaves an invisible new-tab link sitting beside every name:
          // a tap that lands there opens a tab with nothing to explain why.
          // `pointer-events-none` closes that; it does not affect the keyboard,
          // so the controls stay tab-reachable and `focus-within` restores them.
          !alwaysShowActions &&
            "pointer-events-none opacity-0 transition-opacity " +
              "group-hover/entity-ref:pointer-events-auto group-hover/entity-ref:opacity-100 " +
              "focus-within:pointer-events-auto focus-within:opacity-100",
        )}
      >
        {canPeek && (
          <button
            type="button"
            title={`Quick look at ${label}`}
            aria-label={`Quick look at ${label}`}
            onClick={(e) => {
              stop(e);
              setPeekOpen(true);
            }}
            className={CONTROL_CLASS}
          >
            <Lightbulb className="h-3 w-3" />
          </button>
        )}
        {resolvedHref && !disableNewTab && !openInNewTab && (
          <Link
            href={resolvedHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            title={`Open ${label} in a new tab`}
            aria-label={`Open ${label} in a new tab`}
            className={CONTROL_CLASS}
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        {extraActions}
      </span>

      {canPeek && peekOpen && (
        <ResourcePeekHost
          kind={peekKind}
          id={id}
          onClose={() => setPeekOpen(false)}
        />
      )}
    </span>
  );
}
