// record-view: none — a picker that links a passage to a record; it shows no record
// features/rich-document/annotations/LinkRecordOverlay.tsx
//
// "Link a record…" on ANY record the right-click menu targets (menu-model's `link-record` verb,
// opened through the `linkRecordSheet` overlay). The same ONE picker the annotation sidecar uses
// (`LinkRecordPickerSheet`), the same write (`linkRecord` → one `anchored_to` edge, picked record →
// this record, through associationsService) — never a second link table. Already-linked records
// show as attached; a refusal is said in a toast and the sheet stays open.

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  alreadyLinked,
  linkReplaces,
  newColumnLabel,
  planStoreRecordLink,
  writeStoreRecordLink,
  type StoreLinkPlan,
} from "./storeRecordLink";
import { attachedKey } from "@ai-matrx/associations/react";
import { toast } from "@/components/ui/use-toast";
import { LinkRecordPickerSheet, STORE_RECORD_TOKEN } from "./LinkRecordSheet";
import { linkRecord, listEdgeItems } from "./service";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import type { AnnotationSource } from "./types";

export interface LinkRecordTarget {
  token: string;
  id: string;
  title: string;
  /** A store record's table and organization, when the host knows them (the grid, a card). */
  tableId?: string | undefined;
  organizationId?: string | undefined;
}

/** What the one confirm says before a store link changes a table or replaces a link. */
function confirmWords(plan: StoreLinkPlan): { title: string; description: string; confirm: string } {
  if (plan.kind === "new_column") {
    return {
      title: `Link through a new column on ${plan.holder.tableName}?`,
      description: `${plan.holder.tableName} gets a "${newColumnLabel(plan)}" column pointing at ${plan.pointsAt.tableName}, and this link is its first.`,
      confirm: "Add column and link",
    };
  }
  return {
    title: `Replace ${plan.field.label}?`,
    description: `${plan.field.label} holds one record, so this link replaces the one it holds now.`,
    confirm: "Replace",
  };
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
        setAttached((prev) => new Set([...prev, ...links.flatMap((l) => (l.link ? [attachedKey(l.link.token, l.link.id)] : []))]));
      })
      // read-gate-exempt: attached marks are enrichment on the picker; a failed attach write reports its own error
      .catch(() => {
        // The picker still works without the attached marks; a failed write says why.
      });
    return () => {
      live = false;
    };
  }, [target.token, target.id, target.title]);

  // Links written FROM this record (a store record linked here) are marked attached too: the
  // read above lists edges INTO the record only.
  const { edges } = useAssociations({ type: target.token, id: target.id });
  const linkedOutward = edges
    .filter((e) => e.role === "anchored_to" && e.direction === "outgoing")
    .map((e) => attachedKey(e.otherType, e.otherId));
  const attachedKeys = linkedOutward.length > 0 ? new Set([...attached, ...linkedOutward]) : attached;

  // RECORD ↔ RECORD (CHAIR-UI-STORE item 3): through a link column the two tables share, or a new
  // one after ONE confirm. The picker waits on `asking` until the person answers.
  const isStoreTarget = target.token === STORE_RECORD_TOKEN;
  const [asking, setAsking] = useState<StoreLinkPlan | null>(null);
  const answer = useRef<((yes: boolean) => void) | null>(null);
  const ask = (plan: StoreLinkPlan) =>
    new Promise<boolean>((resolve) => {
      answer.current = resolve;
      setAsking(plan);
    });
  const settle = (yes: boolean) => {
    answer.current?.(yes);
    answer.current = null;
    setAsking(null);
  };

  const words = asking ? confirmWords(asking) : null;
  return (
    <>
    <LinkRecordPickerSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      targetToken={target.token}
      title={target.title ? `Link to ${target.title}` : "Link a record"}
      attachedKeys={attachedKeys}
      question={
        words ? (
          <div className="flex flex-col gap-2 rounded-md border p-3 type-body" role="alertdialog" aria-label={words.title}>
            <p className="font-medium">{words.title}</p>
            <p className="text-muted-foreground">{words.description}</p>
            <div className="flex justify-end gap-2">
              <Button variant="quiet" onClick={() => settle(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => settle(true)}>
                {words.confirm}
              </Button>
            </div>
          </div>
        ) : null
      }
      // Record ↔ record goes through the store's own relation columns (it refuses a free edge
      // between two records) — `storeRecordLink.ts` — so a store record is offered everywhere.
      storeRecords={target.token !== STORE_RECORD_TOKEN || Boolean(target.organizationId)}
      onLink={async (token, id, title) => {
        try {
          if (isStoreTarget && token === STORE_RECORD_TOKEN) {
            const plan = await planStoreRecordLink({
              organizationId: target.organizationId as string,
              target: { recordId: target.id, tableId: target.tableId ?? null },
              picked: { recordId: id },
            });
            if (alreadyLinked(plan)) {
              toast({ title: "Already linked", description: title || undefined });
              return true;
            }
            if ((plan.kind === "new_column" || linkReplaces(plan)) && !(await ask(plan))) return "cancelled";
            await writeStoreRecordLink(plan);
            setAttached((prev) => new Set(prev).add(attachedKey(token, id)));
            toast({
              title: "Linked",
              description:
                plan.kind === "new_column"
                  ? `${title} · new ${newColumnLabel(plan)} column on ${plan.holder.tableName}`
                  : `${title} · ${plan.field.label}`,
            });
            return true;
          }
          // A STORE RECORD IS NEVER THE SOURCE OF A FREE LINK: the store refuses any edge out of
          // a record that names no relation field (custom._store_relation_edge_names_its_field).
          // A whole-record link has no direction — the Linked section lists `anchored_to` both
          // ways — so it is written from this record to the store record, the same edge the
          // store record's own "Link a record…" writes when this record is picked there.
          // Either way an edge with a store record on one end carries that record's name (no
          // client door names a store record by id; the other end's Linked row reads the label).
          if (token === STORE_RECORD_TOKEN) {
            await linkRecord({
              source: asSource({ token, id, title }),
              token: target.token,
              id: target.id,
              anchor: null,
              ...(title ? { label: title } : {}),
            });
          } else {
            await linkRecord({
              source: asSource(target),
              token,
              id,
              anchor: null,
              ...(target.token === STORE_RECORD_TOKEN && target.title ? { label: target.title } : {}),
            });
          }
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
    </>
  );
}
