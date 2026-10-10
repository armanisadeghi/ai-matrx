"use client";

// features/scopes/components/linked-records/LinkedRecordsSection.tsx
//
// "LINKED" — everything linked to one record, in BOTH directions, through the platform's one
// association path (lane 3 W1.4; Notion's backlinks + Salesforce's related lists). One section,
// mounted on every record page (CRM party, HR employee, task, note, meeting, message, store
// record), so a link made from either end shows on both.
//
// What counts as a link (`isLinkEdge`):
//   · an `anchored_to` edge — what "Link a record…" writes (LinkRecordOverlay / the annotation
//     sidecar), either direction;
//   · a store record's own reference — the edge the record store writes for an entity-reference
//     field (record → <token>, role = the field key), seen from either end. Record ↔ record edges
//     are the store's relation columns and stay in the grid.
// Each row: the thing's icon and name (EntityRef: open, new tab, peek), and Unlink, which ARCHIVES
// the edge through the store's `remove` (assoc_remove → platform.assoc_unset) and reloads both ends.
//
// A store record has no client door that names it by id yet (record words are field-scoped,
// `custom.record_words` is server-only) — until the chair's door lands a record row reads the
// edge's own label, else the plain kind word, never an id.

import { useEffect, useState } from "react";
import { Link2, Plus, Unlink } from "lucide-react";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import { entityTitleFallback, fetchEntityTitles } from "@/features/scopes/service/entityTitles";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenLinkRecordSheet } from "@/features/overlays/openers/linkRecordSheet";
import { toast } from "@/components/ui/use-toast";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export const ANCHORED_TO = "anchored_to";
const STORE_RECORD = "record";

export interface LinkEdgeLike {
  direction: "outgoing" | "incoming";
  otherType: string;
  otherId: string;
  role: string | null;
}

/** Is this edge a link the Linked section lists, seen from `selfType`? */
export function isLinkEdge(selfType: string, edge: LinkEdgeLike): boolean {
  if (edge.role === ANCHORED_TO) return true;
  // A store record's entity-reference field: record → <token>, never record ↔ record.
  if (selfType === STORE_RECORD) return edge.direction === "outgoing" && edge.otherType !== STORE_RECORD;
  return edge.direction === "incoming" && edge.otherType === STORE_RECORD;
}

export interface LinkedRecordsSectionProps {
  /** Registered entity token of the record this section sits on. */
  token: string;
  id: string;
  /** The record's own name — titles the picker ("Link to …"). */
  title: string;
  className?: string;
  /**
   * The page also mounts "Linked records" (`EntityBackLinks`), which already lists the custom rows
   * whose own link field points here, with their titles. Those store-reference edges are then left
   * out so a custom row is listed ONCE. Direct links ("Link a record…") still list here.
   */
  backLinksShownElsewhere?: boolean;
}

/** An edge a record's own link field wrote, seen from the record it points at. */
export function isStoreReferenceBackEdge(selfType: string, edge: LinkEdgeLike): boolean {
  return (
    selfType !== STORE_RECORD &&
    edge.direction === "incoming" &&
    edge.otherType === STORE_RECORD &&
    edge.role !== ANCHORED_TO
  );
}

export function LinkedRecordsSection({ token, id, title, className, backLinksShownElsewhere }: LinkedRecordsSectionProps) {
  const { edges, status, error } = useAssociations({ type: token, id });
  const openLinkSheet = useOpenLinkRecordSheet();
  const links = edges.filter(
    (e) => isLinkEdge(token, e) && !(backLinksShownElsewhere && isStoreReferenceBackEdge(token, e)),
  );
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const wanted = links.map((e) => `${e.otherType}:${e.otherId}`).sort().join(",");
  useEffect(() => {
    let live = true;
    const byToken = new Map<string, string[]>();
    for (const e of links) {
      if (e.otherType === STORE_RECORD) continue;
      byToken.set(e.otherType, [...(byToken.get(e.otherType) ?? []), e.otherId]);
    }
    void Promise.all(
      [...byToken].map(async ([t, ids]) => {
        const got = await fetchEntityTitles(t, ids);
        return [...got].map(([gid, name]) => [`${t}:${gid}`, name] as const);
      }),
    ).then((pairs) => {
      if (live) setTitles(new Map(pairs.flat()));
    });
    return () => {
      live = false;
    };
    // `wanted` is the stable identity of `links`.
  }, [wanted]);

  const unlink = async (edge: (typeof links)[number]) => {
    const key = `${edge.otherType}:${edge.otherId}:${edge.role ?? ""}`;
    setBusy(key);
    const [sourceType, sourceId, targetType, targetId] =
      edge.direction === "outgoing" ? [token, id, edge.otherType, edge.otherId] : [edge.otherType, edge.otherId, token, id];
    const res = await getAssociationsStore().remove({
      sourceType,
      sourceId,
      targetType,
      targetId,
      ...(edge.role ? { role: edge.role } : {}),
    });
    setBusy(null);
    if (!res.ok) toast({ title: "Not unlinked", description: res.error, variant: "destructive" });
  };

  return (
    <section data-section="linked-records" className={className ?? "flex flex-col gap-1.5"}>
      {backLinksShownElsewhere ? (
        // The page's "Linked records" section above is the ONE heading. This part adds only what it
        // cannot: the direct links (if any) and the action — no second heading, no second empty line.
        <button
          type="button"
          data-linked-records-action="link-a-record"
          className="inline-flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => openLinkSheet({ target: { token, id, title } })}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Link a record
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Linked
            {links.length > 0 && !error ? <span className="text-xs font-normal text-muted-foreground">{links.length}</span> : null}
          </h3>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Link a record"
            title="Link a record"
            onClick={() => openLinkSheet({ target: { token, id, title } })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}
      {!backLinksShownElsewhere && !error && status !== "ready" && links.length === 0 ? (
        <p className="text-xs text-muted-foreground" aria-busy="true">Loading links…</p>
      ) : null}
      {!backLinksShownElsewhere && !error && status === "ready" && links.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing linked yet</p>
      ) : null}
      {links.length > 0 ? (
        <ul className="flex flex-col">
          {links.map((edge) => {
            const key = `${edge.otherType}:${edge.otherId}:${edge.role ?? ""}`;
            const name =
              titles.get(`${edge.otherType}:${edge.otherId}`) ?? edge.label ?? entityTitleFallback(edge.otherType);
            return (
              <li key={key} data-linked-record={`${edge.otherType}:${edge.otherId}`} className="min-w-0 py-0.5">
                <EntityRef
                  token={edge.otherType}
                  id={edge.otherId}
                  name={name}
                  openInNewTab
                  {...(edge.otherType === STORE_RECORD ? { href: `/o/${edge.otherId}`, disablePeek: true } : {})}
                  extraActions={
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                      aria-label={`Unlink ${name}`}
                      title="Unlink"
                      disabled={busy === key}
                      onClick={() => void unlink(edge)}
                    >
                      <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
