// features/rich-document/annotations/LinkRecordOverlay.tsx
//
// "Link a record…" on ANY record the right-click menu targets (menu-model's `link-record` verb,
// opened through the `linkRecordSheet` overlay). The same ONE picker the annotation sidecar uses
// (`LinkRecordPickerSheet`), the same write (`linkRecord` → one `anchored_to` edge, picked record →
// this record, through associationsService) — never a second link table. Already-linked records
// show as attached; a refusal is said in a toast and the sheet stays open.

"use client";

import { useEffect, useState } from "react";
import { attachedKey } from "@ai-matrx/associations/react";
import { toast } from "@/components/ui/use-toast";
import { LinkRecordPickerSheet } from "./LinkRecordSheet";
import { linkRecord, listEdgeItems } from "./service";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import type { AnnotationSource } from "./types";

export interface LinkRecordTarget {
  token: string;
  id: string;
  title: string;
}

function asSource(target: LinkRecordTarget): AnnotationSource {
  // Links never read the body or its version — only token + id address the edge.
  return { token: target.token, id: target.id, title: target.title, body: "", contentVersion: 0 };
}

export function LinkRecordOverlay({ target, onClose }: { target: LinkRecordTarget; onClose: () => void }) {
  const [attached, setAttached] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    listEdgeItems(asSource(target), async () => new Map())
      .then(({ links }) => {
        if (!live) return;
        setAttached(new Set(links.flatMap((l) => (l.link ? [attachedKey(l.link.token, l.link.id)] : []))));
      })
      .catch(() => {
        // The picker still works without the attached marks; a failed write says why.
      });
    return () => {
      live = false;
    };
  }, [target.token, target.id, target.title]);

  return (
    <LinkRecordPickerSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      targetToken={target.token}
      title={target.title ? `Link to ${target.title}` : "Link a record"}
      attachedKeys={attached}
      onLink={async (token, id, title) => {
        try {
          await linkRecord({ source: asSource(target), token, id, anchor: null });
          setAttached((prev) => new Set(prev).add(attachedKey(token, id)));
          // Both ends' Linked sections read the store cache — refresh them (linkRecord writes
          // through the service, which does not touch the cache).
          const store = getAssociationsStore();
          void store.load(target.token, target.id, { force: true });
          void store.load(token, id, { force: true });
          toast({ title: "Linked", description: title || undefined });
          return true;
        } catch (e) {
          toast({ title: "Not linked", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
          return false;
        }
      }}
    />
  );
}
