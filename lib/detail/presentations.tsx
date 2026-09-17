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
      title={core.title}
      titleNode={<DetailTitle core={core} />}
      actions={<DetailActions core={core} />}
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
      titleNode={<DetailTitle core={core} />}
      actions={<DetailActions core={core} />}
      onClose={core.close}
    >
      <KeyboardRoot core={core}>
        <DetailBody core={core} />
      </KeyboardRoot>
    </Shell>
  );
}

export function DetailPagePresentation({
  data,
  onBack,
}: {
  data: DetailInstanceData;
  /** Leaving the page — the page is the one presentation that changed the URL. */
  onBack: () => void;
}) {
  const host = useDetailHost();
  const core = useDetailCore(data, "page", { onClose: onBack });
  const Shell = requireShell(host.shells, "Page");
  return (
    <Shell
      target={core.ref}
      title={core.title}
      titleNode={<DetailTitle core={core} />}
      actions={<DetailActions core={core} />}
      onClose={core.close}
      onBack={onBack}
    >
      <KeyboardRoot core={core}>
        <DetailBody core={core} />
      </KeyboardRoot>
    </Shell>
  );
}
