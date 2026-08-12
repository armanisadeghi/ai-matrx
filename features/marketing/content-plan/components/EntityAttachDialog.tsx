"use client";

/**
 * BULK ENTITY ATTACHMENT — the roster half of E-E-A-T, applied to the plan.
 *
 * `EntityManager` builds the roster; until now, deciding WHICH page each
 * author / reviewer / cited source belongs on was per-page hand work in
 * `NodeAssociations`. This runs the Content Plan Entity Attacher over every
 * page at once and stages its assignments — same "AI proposes, the user
 * commits" contract every other step of the plan follows.
 *
 * Two hard guarantees, both enforced HERE and not trusted to the prompt:
 *   - an `entity_label` that does not resolve to a real roster row is dropped
 *     (the agent may never invent an author or a citation), and
 *   - a `route` that does not resolve to a real plan node is dropped.
 * Anything dropped is COUNTED and shown, never silently swallowed.
 */
import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import { useQueryClient } from "@tanstack/react-query";

import { attachNodeEntity } from "../data/associations";
import { planKeys } from "../data/hooks";
import { listPlanNodes } from "../data/service";
import {
  ENTITY_ATTACHER_FIELD_NOTE,
  buildCurrentPlanLines,
  buildEntityRosterLines,
  type EntityAttachResult,
  type useSetupAgents,
} from "../setup/ai";
import type { PlanEntityRow, PlanNodeEntityRole } from "../types";

interface StagedAttachment {
  nodeId: string;
  entityId: string;
  role: PlanNodeEntityRole;
  route: string;
  pageLabel: string;
  entityLabel: string;
  reason: string;
}

export function EntityAttachDialog({
  siteId,
  entities,
  rosterLoading = false,
  rosterError = null,
  researchReport,
  statusSlugById,
  agents,
}: {
  siteId: string;
  entities: PlanEntityRow[];
  /** The roster read is still in flight — NOT the same as "there are none". */
  rosterLoading?: boolean;
  /** The roster read failed — NOT the same as "there are none". */
  rosterError?: string | null;
  /** The site's linked research report, already resolved by the caller. */
  researchReport: () => Promise<string>;
  statusSlugById: Map<string, string>;
  agents: ReturnType<typeof useSetupAgents>;
}) {
  const queryClient = useQueryClient();
  const [staged, setStaged] = useState<StagedAttachment[] | null>(null);
  const [result, setResult] = useState<EntityAttachResult | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  /**
   * Covers the THREE Supabase round-trips before the agent starts, during
   * which `agents.attachBusy` is still false and the button looked idle — a
   * second click there reaches the runner's in-flight guard and reports a
   * failure to a user whose first run is quietly still going.
   */
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || agents.attachBusy;

  const run = async () => {
    setPreparing(true);
    try {
      const report = await researchReport();
      if (!report) return;
      const nodes = await listPlanNodes(siteId);
      const planned = nodes.filter((node) => node.route);
      if (planned.length === 0) {
        toast.error("This site has no pages to attach entities to yet.");
        return;
      }
      const outcome = await agents.attachEntities({
        current_plan: buildCurrentPlanLines(planned, statusSlugById),
        entity_roster: buildEntityRosterLines(entities),
        research_report: report,
        guidance: ENTITY_ATTACHER_FIELD_NOTE,
      });

      const nodeByRoute = new Map(planned.map((node) => [node.route ?? "", node]));
      const entityByLabel = new Map(
        entities.map((entity) => [entity.label.trim().toLowerCase(), entity]),
      );
      const seen = new Set<string>();
      const rows: StagedAttachment[] = [];
      const misses: string[] = [];
      for (const item of outcome.attachments) {
        const node = nodeByRoute.get(item.route);
        const entity = entityByLabel.get(item.entityLabel.toLowerCase());
        if (!node) {
          misses.push(`${item.route} — no such page in the plan`);
          continue;
        }
        if (!entity) {
          misses.push(`${item.entityLabel} — not in the roster (never invented)`);
          continue;
        }
        const key = `${node.id}:${entity.id}:${item.role}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          nodeId: node.id,
          entityId: entity.id,
          role: item.role,
          route: item.route,
          pageLabel: node.label,
          entityLabel: entity.label,
          reason: item.reason,
        });
      }
      setResult(outcome);
      setDropped([...misses, ...outcome.unusable]);
      setStaged(rows);
    } catch (error) {
      toast.error(`Entity attachment failed: ${extractErrorMessage(error)}`);
    } finally {
      setPreparing(false);
    }
  };

  const apply = async () => {
    if (!staged) return;
    setApplying(true);
    let applied = 0;
    const failures: string[] = [];
    for (const row of staged) {
      try {
        await attachNodeEntity({
          nodeId: row.nodeId,
          entityId: row.entityId,
          role: row.role,
        });
        applied += 1;
      } catch (error) {
        failures.push(`${row.route} → ${row.entityLabel}: ${extractErrorMessage(error)}`);
      }
    }
    // The node panel reads edges from its own cache with a stale time — an
    // applied attachment that is not invalidated shows up as "no author" on
    // a page the write actually succeeded for.
    const touched = new Set(staged.map((row) => row.nodeId));
    await Promise.all(
      Array.from(touched, (nodeId) =>
        queryClient.invalidateQueries({ queryKey: planKeys.nodeEdges(nodeId) }),
      ),
    );
    setApplying(false);
    if (failures.length > 0) {
      toast.error(`Attached ${applied}; ${failures.length} failed — ${failures[0]}`);
      return;
    }
    toast.success(
      `Attached ${applied} entit${applied === 1 ? "y" : "ies"} across the plan.`,
    );
    setStaged(null);
    setResult(null);
    setDropped([]);
  };

  // "Still loading" and "the read failed" are not "you have no entities" —
  // telling a user to add entities they already have is a lie about their data.
  const disabledReason = (() => {
    if (rosterLoading) return "Loading this site's entity roster…";
    if (rosterError) return `Could not load the entity roster: ${rosterError}`;
    if (entities.length === 0) return "Add entities to the roster first.";
    return null;
  })();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        disabled={busy || disabledReason !== null}
        title={
          disabledReason ??
          "Assign these authors, reviewers, and sources to the pages they belong on."
        }
        onClick={() => void run()}
      >
        {busy ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Link2 className="mr-1 h-3 w-3" />
        )}
        Attach to pages
      </Button>

      <Dialog
        open={staged !== null}
        onOpenChange={(open) => {
          if (!open && !applying) {
            setStaged(null);
            setResult(null);
            setDropped([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {staged && staged.length > 0
                ? `Attach ${staged.length} entit${staged.length === 1 ? "y" : "ies"} to pages`
                : "No attachments to apply"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
            {staged && staged.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
                {staged.map((row) => (
                  <li
                    key={`${row.nodeId}:${row.entityId}:${row.role}`}
                    className="bg-card px-2.5 py-1.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {row.pageLabel}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {row.route}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-primary">
                      <span className="mr-1 rounded bg-muted px-1 py-0.5 font-medium text-muted-foreground">
                        {row.role}
                      </span>
                      {row.entityLabel}
                    </p>
                    {row.reason ? (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {row.reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {result?.notes ||
                  "The attacher proposed nothing that resolved to a real page and a real roster entity."}
              </p>
            )}

            {result && result.missing.length > 0 ? (
              <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2">
                <p className="text-[11px] font-medium text-foreground">
                  Roster gaps — add these before the plan can cite them
                </p>
                <ul className="mt-1 space-y-0.5">
                  {result.missing.map((item) => (
                    <li
                      key={`${item.suggestedLabel}:${item.entityType}`}
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {item.suggestedLabel}
                      </span>{" "}
                      ({item.entityType}) — {item.whyNeeded}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {dropped.length > 0 ? (
              <p className="text-[11px] leading-relaxed text-destructive">
                {dropped.length} proposal{dropped.length === 1 ? "" : "s"} dropped:{" "}
                {dropped.slice(0, 4).join("; ")}
                {dropped.length > 4 ? " …" : ""}
              </p>
            ) : null}

            {staged && staged.length > 0 && result?.notes ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {result.notes}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={applying}
              onClick={() => {
                setStaged(null);
                setResult(null);
                setDropped([]);
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={applying || !staged || staged.length === 0}
              onClick={() => void apply()}
            >
              {applying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
