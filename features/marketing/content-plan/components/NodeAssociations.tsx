"use client";

/**
 * The node's non-keyword association edges: topics (role `topic`) and entity
 * attachments (`about`/`cites`/
 * `embeds`/`authored_by`/`reviewed_by`, reviews carrying the `plan_review`
 * payload). All writes funnel through the canonical association chokepoint
 * via data/associations.ts; every failure is toasted verbatim.
 */
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssociationEdge } from "@/features/scopes/types";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";

import {
  usePlanNodeEdges,
  usePlanNodeEdgeMutation,
  useSeoTopics,
} from "../data/hooks";
import Link from "next/link";
import type { PartyRow } from "@/features/crm/types";

import {
  PARTY_TOKEN,
  PLAN_ENTITY_TOKEN,
  PLAN_NODE_PARTY_ROLES,
  PLAN_NODE_SOURCE_ROLES,
  PLAN_NODE_TOPIC_ROLE,
  SEO_TOPIC_TOKEN,
  type PlanEntityRow,
  type PlanNodeEntityRole,
} from "../types";

const ROLE_LABELS: Record<PlanNodeEntityRole, string> = {
  about: "About",
  cites: "Cites",
  embeds: "Embeds",
  authored_by: "Authored by",
  reviewed_by: "Reviewed by",
};

export function NodeAssociations({
  nodeId,
  entities,
  parties,
}: {
  nodeId: string;
  entities: PlanEntityRow[];
  /** The site's linked crm.party roster (people/companies). */
  parties: PartyRow[];
}) {
  const edges = usePlanNodeEdges(nodeId);
  const mutate = usePlanNodeEdgeMutation(nodeId);

  const run = (action: Parameters<typeof mutate.mutate>[0]) => {
    mutate.mutate(action, {
      onError: (error) => toast.error(extractErrorMessage(error)),
    });
  };

  const outgoing = edges.data ?? [];
  const topicEdges = outgoing.filter(
    (edge) =>
      edge.direction === "outgoing" &&
      edge.otherType === SEO_TOPIC_TOKEN &&
      edge.role === PLAN_NODE_TOPIC_ROLE,
  );
  const entityEdges = outgoing.filter(
    (edge) =>
      edge.direction === "outgoing" &&
      (edge.otherType === PLAN_ENTITY_TOKEN ||
        edge.otherType === PARTY_TOKEN),
  );

  const entityById = useMemo(() => {
    const map = new Map<string, PlanEntityRow>();
    for (const entity of entities) map.set(entity.id, entity);
    return map;
  }, [entities]);

  const partyById = useMemo(() => {
    const map = new Map<string, PartyRow>();
    for (const party of parties) map.set(party.id, party);
    return map;
  }, [parties]);

  if (edges.isError) {
    return (
      <p className="text-xs text-destructive">
        {extractErrorMessage(edges.error)}
      </p>
    );
  }

  return (
    <div data-surface-value="selected_node_edges" className="space-y-4">
      <TopicSection
        topicEdges={topicEdges}
        onAdd={(topicId) => run({ kind: "add-topic", topicId })}
        onRemove={(topicId) => run({ kind: "remove-topic", topicId })}
      />
      <EntitySection
        entityEdges={entityEdges}
        entityById={entityById}
        partyById={partyById}
        entities={entities}
        parties={parties}
        onAttach={(target, role, reviewDate, notes) => {
          const review =
            role === "reviewed_by" && reviewDate
              ? { review_date: reviewDate, ...(notes ? { notes } : {}) }
              : undefined;
          run(
            target.kind === "party"
              ? { kind: "attach-party", partyId: target.id, role, review }
              : { kind: "attach-entity", entityId: target.id, role, review },
          );
        }}
        onDetach={(target, role) =>
          run(
            target.kind === "party"
              ? { kind: "detach-party", partyId: target.id, role }
              : { kind: "detach-entity", entityId: target.id, role },
          )
        }
      />
    </div>
  );
}

/** Which half of the roster an edge/attach targets. */
type AttachTarget = { kind: "party" | "entity"; id: string };

// Narrow the canonical edge shape (never re-declare it locally).
type Edge = Pick<AssociationEdge, "otherId" | "otherType" | "label" | "role">;

function Chip({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground">
      <span className="max-w-48 truncate" title={text}>
        {text}
      </span>
      <button
        type="button"
        aria-label={`Remove ${text}`}
        className="text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function TopicSection({
  topicEdges,
  onAdd,
  onRemove,
}: {
  topicEdges: Edge[];
  onAdd: (topicId: string) => void;
  onRemove: (topicId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const topics = useSeoTopics(search);
  const attached = new Set(topicEdges.map((edge) => edge.otherId));
  const topicNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const topic of topics.data ?? []) map.set(topic.id, topic.name);
    return map;
  }, [topics.data]);

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Topics
        </h4>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs">
              <Plus className="mr-1 h-3 w-3" /> Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="end">
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search topics…"
              className="mb-2 h-8"
            />
            <div className="max-h-56 overflow-y-auto">
              {topics.isLoading ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  Loading topics…
                </p>
              ) : topics.isError ? (
                <p className="px-2 py-2 text-xs text-destructive">
                  {topics.error instanceof Error
                    ? topics.error.message
                    : "Could not load topics."}
                </p>
              ) : (
                <>
                  {(topics.data ?? [])
                    .filter((topic) => !attached.has(topic.id))
                    .map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          onAdd(topic.id);
                          setOpen(false);
                        }}
                      >
                        {topic.name}
                      </button>
                    ))}
                  {topics.data && topics.data.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No topics found for your organization.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1">
        {topicEdges.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No topics tagged.
          </span>
        ) : (
          topicEdges.map((edge) => (
            <Chip
              key={edge.otherId}
              text={
                topicNameById.get(edge.otherId) ??
                edge.label ??
                edge.otherId.slice(0, 8)
              }
              onRemove={() => onRemove(edge.otherId)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function EntitySection({
  entityEdges,
  entityById,
  partyById,
  entities,
  parties,
  onAttach,
  onDetach,
}: {
  entityEdges: Edge[];
  entityById: Map<string, PlanEntityRow>;
  partyById: Map<string, PartyRow>;
  entities: PlanEntityRow[];
  parties: PartyRow[];
  onAttach: (
    target: AttachTarget,
    role: PlanNodeEntityRole,
    reviewDate?: string,
    notes?: string,
  ) => void;
  onDetach: (target: AttachTarget, role: PlanNodeEntityRole) => void;
}) {
  // The picker value encodes the roster half: `party:<id>` / `entity:<id>`.
  const [picked, setPicked] = useState<string>("");
  const [role, setRole] = useState<PlanNodeEntityRole>("about");
  const [reviewDate, setReviewDate] = useState("");
  const [notes, setNotes] = useState("");

  const target: AttachTarget | null = picked
    ? {
        kind: picked.startsWith("party:") ? "party" : "entity",
        id: picked.slice(picked.indexOf(":") + 1),
      }
    : null;
  // reviewed_by/authored_by are person edges; embeds is a source edge — the
  // role menu follows what the registered pair for the pick allows.
  const roleOptions: readonly PlanNodeEntityRole[] =
    target?.kind === "party" ? PLAN_NODE_PARTY_ROLES : PLAN_NODE_SOURCE_ROLES;
  const effectiveRole = roleOptions.includes(role) ? role : "about";

  return (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
        People &amp; sources
      </h4>
      <div className="space-y-1.5">
        {entityEdges.map((edge) => {
          const isParty = edge.otherType === "party";
          const party = isParty ? partyById.get(edge.otherId) : undefined;
          const entity = isParty ? undefined : entityById.get(edge.otherId);
          const name =
            party?.display_name ??
            entity?.label ??
            edge.label ??
            edge.otherId.slice(0, 8);
          const edgeRole = (edge.role ?? "about") as PlanNodeEntityRole;
          return (
            <div
              key={`${edge.otherType}:${edge.otherId}:${edge.role}`}
              className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"
            >
              <span className="rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                {ROLE_LABELS[edgeRole] ?? edge.role}
              </span>
              {isParty ? (
                // A person/company is a CRM record — its name is a door.
                <Link
                  href={`/crm/${edge.otherId}`}
                  className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {name}
                </span>
              )}
              <button
                type="button"
                aria-label={`Detach ${name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onDetach(
                    { kind: isParty ? "party" : "entity", id: edge.otherId },
                    edgeRole,
                  )
                }
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {entityEdges.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing attached. Authors, reviewers, and sources power E-E-A-T.
          </p>
        ) : null}
      </div>
      <div className="mt-2 space-y-1.5 rounded border border-dashed border-border p-2">
        <div className="flex gap-1.5">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="h-8 flex-1 text-sm">
              <SelectValue placeholder="Person, company or source…" />
            </SelectTrigger>
            <SelectContent>
              {parties.map((party) => (
                <SelectItem key={party.id} value={`party:${party.id}`}>
                  {party.display_name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({party.party_kind === "organization" ? "company" : "person"})
                  </span>
                </SelectItem>
              ))}
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={`entity:${entity.id}`}>
                  {entity.label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({entity.entity_type})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={effectiveRole}
            onValueChange={(next) => setRole(next as PlanNodeEntityRole)}
          >
            <SelectTrigger className="h-8 w-32 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {effectiveRole === "reviewed_by" ? (
          <div className="flex gap-1.5">
            <Input
              type="date"
              value={reviewDate}
              onChange={(event) => setReviewDate(event.target.value)}
              className="h-8 w-40 text-sm"
              aria-label="Review date"
            />
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Review notes (optional)"
              className="h-8 flex-1 text-sm"
            />
          </div>
        ) : null}
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={
            !target || (effectiveRole === "reviewed_by" && !reviewDate)
          }
          onClick={() => {
            if (!target) return;
            onAttach(
              target,
              effectiveRole,
              reviewDate || undefined,
              notes || undefined,
            );
            setPicked("");
            setReviewDate("");
            setNotes("");
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> Attach
        </Button>
        {effectiveRole === "reviewed_by" ? (
          <p className="text-[11px] text-muted-foreground">
            Reviews require a review date (stored as a validated plan_review
            payload on the edge).
          </p>
        ) : null}
      </div>
    </section>
  );
}
