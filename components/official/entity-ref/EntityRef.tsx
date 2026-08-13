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
 * Safe inside clickable table rows: every control stops propagation, AND so
 * does the portaled peek dialog (React events travel the React tree, not the
 * DOM tree — see the seam at the bottom of the render).
 *
 * Adding a door for a new entity type is a registry edit, never a change here:
 * give the token an `hrefFor` in `entityRegistry.ts`, and/or a peek in
 * `features/organizations/peek/registry.ts` + `kinds-list.ts`.
 */

import React, { useState } from "react";
import Link from "next/link";
import { ExternalLink, Lightbulb } from "lucide-react";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { hasPeek } from "@/features/organizations/peek/kinds-list";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { allowNativeNewTab } from "@/utils/navigation/should-open-in-new-tab";
import { cn } from "@/lib/utils";

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
  /**
   * Hide the new-tab CONTROL (rare — only when the row is already a link).
   *
   * It does NOT make the name inert: the label stays a real `Link` whenever a
   * route resolves, so a plain click still navigates and a modified click
   * still opens a tab. If what you actually want is "name this record but do
   * not offer a door" — the record is already open, so every door leads back
   * to where the user is standing — then don't use `EntityRef` for that row at
   * all. Render the text, and say in a comment why the door is absent.
   */
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
  /**
   * Let the label WRAP instead of truncating.
   *
   * `EntityRef` truncates by default because its home is a table cell. That is
   * wrong for a detail panel or an audit row that prints a full id — there the
   * id IS the information, and an ellipsis silently destroys the thing the user
   * came to copy. Set this wherever the old markup wrapped (`break-all`,
   * `whitespace-normal`) so the conversion doesn't quietly shorten the content.
   *
   * A call-site `className` cannot substitute: it lands on the outer wrapper,
   * while `truncate` is on the label element itself.
   */
  wrap?: boolean;
  /**
   * The NAME control stretches to fill the width, instead of hugging its text.
   *
   * Set this whenever you replace a full-width `<button>`/`<a>` with an
   * `EntityRef`. A `className` of `flex-1` on the component only stretches the
   * outer WRAPPER — the clickable label inside it still ends where the text
   * does, so every pixel of the old control's padding silently stops opening
   * the record. On a short name in a wide row that is most of the hit target.
   *
   * Combines with `truncate` (the default) exactly as the markup it replaces
   * did: fill the space, ellipsise if the name outgrows it. It also pushes the
   * hover controls to the far edge, which is why it is opt-in — inside a table
   * cell you usually want them beside the name.
   */
  fill?: boolean;
  /**
   * Classes for the clickable LABEL itself, not the wrapper.
   *
   * `className` lands on the outer wrapper, which is right for layout and
   * wrong for anything that must apply to the text: `line-through` on a
   * completed task, a font weight, a decoration. Whether such a style reaches
   * the label by inheritance depends on the box type and fights the label's
   * own `hover:underline` — so it is passed explicitly rather than hoped for.
   * This is the third call-site need of this shape; `wrap` and `fill` stay as
   * named props because they encode a DECISION, while this is plain styling.
   */
  labelClassName?: string;
  /** Backward-compatible name-label class used by existing Door Law callers. */
  nameClassName?: string;
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
  /**
   * Render arbitrary content as the label instead of the name text.
   *
   * The doors are the point of this component; the label is incidental. A
   * table cell renders `<span>{title}</span><Badge>Draft</Badge>`, a card
   * renders a title over a subtitle — neither is a string, and before this
   * existed those surfaces could not adopt `EntityRef` at all without
   * flattening what they show. That is how a shell ends up with its OWN
   * Open-only door beside this one (`MatrxDataTable.href`) and every column
   * that names a record loses new-tab and peek.
   *
   * `name` is still required-ish when you pass children: it supplies the
   * `title`/`aria-label` text, so a screen reader and a tooltip still say
   * which record this is.
   */
  children?: React.ReactNode;
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
  wrap = false,
  fill = false,
  labelClassName,
  nameClassName,
  alwaysShowActions = false,
  extraActions,
  onOpen,
  className,
  children,
}: EntityRefProps) {
  const [peekOpen, setPeekOpen] = useState(false);

  // Canonicalise ONCE, up front. A surface often passes a `kind` column owned
  // by another system (`source_kind='cld_file'` from the ingest pipeline), and
  // resolving the route from the canonical token while looking the peek up by
  // the raw string is how a record ends up with one door and not the other.
  const canonicalToken = resolveEntityToken(token);
  const info = tryGetEntityInfo(canonicalToken);
  const resolvedHref = href ?? info?.hrefFor?.(id) ?? null;
  // The peek registry is keyed by canonical token, so there is nothing to
  // translate — `peekKeyForToken` existed only to bridge the legacy
  // catalogue vocabulary and is deleted.
  const canPeek = !disablePeek && hasPeek(canonicalToken);
  const label = name?.trim() || `${id.slice(0, 8)}…`;
  // `label` stays the ACCESSIBLE name (title/aria) even when children
  // replace what is drawn — a tooltip reading "Open" tells nobody anything.
  const labelBody = children ?? label;
  const Icon = info?.Icon ?? null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const stopAny = (e: React.SyntheticEvent) => e.stopPropagation();
  // One string carries BOTH label decisions so the three label branches
  // (link / button / inert span) cannot drift apart — they already did once.
  const labelFit = cn(
    wrap ? "break-all" : "truncate",
    fill && "grow",
    labelClassName,
    nameClassName,
  );

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
          // A `_blank` navigation is a fresh document load — it cannot read the
          // client router cache, so prefetching it is a request that can never
          // be used. `EntityRef` lives in lists; at 50 rows that is 50 wasted
          // round trips.
          prefetch={openInNewTab ? false : undefined}
          onClick={(e) => {
            stop(e);
            // A modified click keeps the browser's native new-tab behaviour —
            // an interceptor must never cost the user their current state.
            if (!onOpen || allowNativeNewTab(e)) return;
            e.preventDefault();
            onOpen();
          }}
          title={openInNewTab ? `Open ${label} in a new tab` : `Open ${label}`}
          className={cn(
            "min-w-0 text-inherit underline-offset-2 hover:text-primary hover:underline",
            labelFit,
          )}
        >
          {labelBody}
        </Link>
      ) : onOpen ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
          title={`Open ${label}`}
          className={cn(
            "min-w-0 text-left text-inherit underline-offset-2 hover:text-primary hover:underline",
            labelFit,
          )}
        >
          {labelBody}
        </button>
      ) : (
        <span className={cn("min-w-0", labelFit)} title={label}>
          {labelBody}
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
            prefetch={false}
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

      {/*
        The peek dialog is PORTALED to the document body, but React events
        propagate through the REACT tree, not the DOM tree — so without this
        seam every click, mousedown and keystroke inside an open peek still
        reaches whatever clickable container the `EntityRef` was dropped into.
        That is not theoretical: the notes global-search row toggles its match
        list on click and `preventDefault`s mousedown to protect the find
        input's focus, so opening a peek there made the preview un-selectable
        and collapsed the row when you clicked the peek's own close button.

        The block belongs HERE, not at each call site: `EntityRef` is designed
        to be dropped inside clickable rows (see the header), so every consumer
        inherits the bug. `contents` keeps the wrapper out of the layout — it
        must not become a flex item and open a `gap` beside the name.
      */}
      {canPeek && peekOpen && (
        <span
          className="contents"
          // NARROW ON PURPOSE — mouse/click only.
          //
          // `pointerdown` and `pointerup` are deliberately NOT stopped: Radix's
          // dismissable layer listens for `pointerdown` on `ownerDocument` in
          // the BUBBLE phase, and React 19 delegates portal events at
          // `document.body` — one node below `document`. Stopping it here
          // therefore kills click-outside-to-close for every peek, every time,
          // since a modal dialog's full-screen overlay means every outside
          // click lands inside this seam. Keyboard is left alone for the same
          // reason in reverse: Escape-to-close registers with `{capture:true}`
          // and survives, but blocking bubble-phase keys here would silently
          // swallow global shortcuts while a peek is open.
          //
          // The mouse events below are the ones the seam actually exists for:
          // a row that toggles on `click` and `preventDefault`s `mousedown`.
          onClick={stopAny}
          onDoubleClick={stopAny}
          onMouseDown={stopAny}
          onMouseUp={stopAny}
          onContextMenu={stopAny}
        >
          <ResourcePeekHost
            kind={canonicalToken}
            id={id}
            onClose={() => setPeekOpen(false)}
          />
        </span>
      )}
    </span>
  );
}
