// lib/detail/presentations.tsx
//
// The wrapper: ONE core, three presentations. Each component hands the same
// header halves and the same body to a different host shell. Nothing here
// draws chrome — the shells are the host's window manager, its docked side
// panel and its route header; this file only decides what goes in each slot.

"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { DetailBody } from "./core/DetailBody";
import { DetailActions, DetailTitle } from "./core/DetailHeader";
import { useDetailCore, type DetailCore } from "./core/useDetailCore";
import { requireShell, useDetailHost } from "./host";
import { detailInstanceKey } from "./presentation";
import type { DetailInstanceData } from "./types";

/**
 * 🚨 NEW-22 (VERIFY-U-P1-R4) — THE KEYBOARD MODEL IS BOUND ON EVERY SLOT THE
 * PRESENTATION FILLS, NOT ONLY THE BODY.
 *
 * `titleNode` and `actions` are handed to the SHELL and render outside the body's
 * root, and no shell in this app handles a keystroke: with focus on the copy-id
 * button, a presentation icon, a previous/next chevron or the overflow trigger,
 * Escape closed nothing in all three desktop presentations (reproduced in each).
 * On a phone the docked and window presentations are a `vaul` Drawer, which
 * handles Escape itself — which is why it hid. The header is part of the detail,
 * so the same handler answers from it.
 *
 * Capture phase on each slot, so two open details never answer one keystroke.
 */
function KeyboardSlot({ core, children }: { core: DetailCore; children: ReactNode }) {
  return (
    <div
      onKeyDownCapture={core.keyboard.rootProps.onKeyDownCapture}
      className="flex min-w-0 flex-1 items-center"
      data-detail-keyboard-slot
    >
      {children}
    </div>
  );
}

/** The same, for the actions cluster — which must not grow or stretch. */
function KeyboardActionsSlot({ core, children }: { core: DetailCore; children: ReactNode }) {
  return (
    <div
      onKeyDownCapture={core.keyboard.rootProps.onKeyDownCapture}
      className="flex shrink-0 items-center"
      data-detail-keyboard-slot="actions"
    >
      {children}
    </div>
  );
}

/**
 * The keyboard-owning root. Focus lands here on open (and on every record
 * change) so Escape / [ / ] answer immediately, the way a peek does in Linear.
 */
function KeyboardRoot({ core, children }: { core: DetailCore; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Do not steal focus from a field the person is already typing in.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && root.contains(active)) return;
    root.focus({ preventScroll: true });
  }, [core.ref.id, core.ref.type]);
  return (
    <div
      ref={rootRef}
      {...core.keyboard.rootProps}
      className="flex min-h-full flex-1 flex-col outline-none"
      data-detail-root
      data-detail-type={core.ref.type}
      data-detail-presentation={core.presentation}
    >
      {children}
    </div>
  );
}

export interface DetailPresentationProps {
  data: DetailInstanceData;
  onClose: () => void;
}

export function DetailWindowPresentation({ data, onClose }: DetailPresentationProps) {
  const host = useDetailHost();
  const core = useDetailCore(data, "window", { onClose });
  const Shell = requireShell(host.shells, "Window");
  return (
    <Shell
      instanceKey={detailInstanceKey(core.ref)}
      target={core.ref}
      list={core.list.context}
      title={core.title}
      titleNode={
        <KeyboardSlot core={core}>
          <DetailTitle core={core} />
        </KeyboardSlot>
      }
      actions={
        <KeyboardActionsSlot core={core}>
          <DetailActions core={core} />
        </KeyboardActionsSlot>
      }
      onClose={core.close}
    >
      <KeyboardRoot core={core}>
        <DetailBody core={core} />
      </KeyboardRoot>
    </Shell>
  );
}

export function DetailDockedPresentation({ data, onClose }: DetailPresentationProps) {
  const host = useDetailHost();
  const core = useDetailCore(data, "docked", { onClose });
  const Shell = requireShell(host.shells, "Docked");
  return (
    <Shell
      instanceKey={detailInstanceKey(core.ref)}
      target={core.ref}
      title={core.title}
      titleNode={
        <KeyboardSlot core={core}>
          <DetailTitle core={core} />
        </KeyboardSlot>
      }
      actions={
        <KeyboardActionsSlot core={core}>
          <DetailActions core={core} />
        </KeyboardActionsSlot>
      }
      onClose={core.close}
    >
      <KeyboardRoot core={core}>
        <DetailBody core={core} />
      </KeyboardRoot>
    </Shell>
  );
}

/**
 * 🚨 D1 — THE PAGE OWNS ITS OWN EXIT. It takes no `onBack`: the back chevron,
 * Escape and a presentation switch all leave through `core.leave`, the one
 * guarded exit (`canGoBack` → `back()`, otherwise the record's own home). A
 * route that passed its own `router.back()` in here is exactly how a pasted or
 * bookmarked detail link still landed the tab on `about:blank` after round 1's
 * fix (VERIFY-U-P1-R2, D1).
 */
export function DetailPagePresentation({ data }: { data: DetailInstanceData }) {
  const host = useDetailHost();
  const core = useDetailCore(data, "page", {});
  const Shell = requireShell(host.shells, "Page");
  return (
    <Shell
      target={core.ref}
      title={core.title}
      titleNode={
        <KeyboardSlot core={core}>
          <DetailTitle core={core} />
        </KeyboardSlot>
      }
      actions={
        <KeyboardActionsSlot core={core}>
          <DetailActions core={core} />
        </KeyboardActionsSlot>
      }
      onClose={core.close}
      onBack={core.leave}
    >
      <KeyboardRoot core={core}>
        <DetailBody core={core} />
      </KeyboardRoot>
    </Shell>
  );
}
