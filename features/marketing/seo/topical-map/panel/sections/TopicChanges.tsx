"use client";

/**
 * The structural changes to ONE topic: retire, reject, move, merge, split.
 *
 * EVERY ONE IS TWO CLICKS AND A REHEARSAL. The first click opens the change
 * with its inputs; the second runs `seo.map_dry_run` on the exact call that is
 * about to be made — the real function inside a rolled-back subtransaction —
 * and shows `would_return` in a `ConfirmDialog` whose description NAMES THE
 * CONSEQUENCE (what is retired, what moves, what leaves). Only the confirm
 * runs the write. A refusal at either step is the function's own sentence
 * (22023 argument rules, 23514 attachment policies, 42501 denied, P0002 slug),
 * shown verbatim and never reworded.
 *
 * The rehearsed arguments are the wrappers' own, in the functions' positional
 * order (`data.ts` is the reference): a rehearsal of a different call would
 * prove nothing.
 */

import { useState, type ReactNode } from "react";
import { CornerUpRight, Merge, Scissors, CircleSlash, ChevronDown } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import type { Json } from "@/types/database.types";

import { topicalMapErrorText } from "../../errors";
import {
  useMapDryRun,
  useMergeMapTopics,
  useMoveMapTopic,
  useRejectMapTopics,
  useRetireMapTopics,
  useSplitMapTopic,
} from "../../hooks";
import { selectMapTopicsBySlug } from "../../redux/selectors";
import type { NormalizedMapTopic } from "../../redux/types";
import type {
  MapDryRunFunction,
  MapMergeResult,
  MapTopicAttachments,
  MapTopicRejectionPolicy,
  MapTopicRemovalPolicy,
  MapTopicTreeNode,
  MapTopicsRejectResult,
  MapTopicsRetireResult,
} from "../../types";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export type TopicChangeKind = "retire" | "reject" | "move" | "merge" | "split";

export interface TopicChangesProps {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  /** Opened from the right-click menu, which names the verb. */
  requested: TopicChangeKind | null;
  onRequestHandled: () => void;
  /** After a retire/reject/merge the topic is gone from readers: the host closes. */
  onTopicGone: () => void;
}

const REMOVAL_POLICIES: { value: MapTopicRemovalPolicy; label: string }[] = [
  { value: "error", label: "Refuse if anything is attached" },
  { value: "retire", label: "Retire with its attachments" },
  { value: "parent", label: "Move attachments to the parent" },
];

const REJECTION_POLICIES: { value: MapTopicRejectionPolicy; label: string }[] = [
  { value: "error", label: "Refuse if anything is attached" },
  { value: "reject", label: "Reject and keep the attachments where they are" },
  { value: "parent", label: "Move attachments to the parent" },
];

function attachmentsLine(att: MapTopicAttachments | undefined): string {
  if (!att) return "nothing attached";
  const parts = Object.entries(att).map(([kind, n]) => `${n} ${kind}`);
  return parts.length === 0 ? "nothing attached" : parts.join(", ");
}

export function TopicChanges({
  mapId,
  slug,
  topic,
  requested,
  onRequestHandled,
  onTopicGone,
}: TopicChangesProps) {
  const [open, setOpen] = useState<TopicChangeKind | null>(null);
  const kind = requested ?? open;

  function close() {
    setOpen(null);
    if (requested) onRequestHandled();
  }

  const isProposed = topic.status === "proposed";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:border-primary/40 hover:bg-primary/5"
          >
            Change
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setOpen("move")}>
            <CornerUpRight className="mr-2 h-3.5 w-3.5" aria-hidden />
            Move to another parent
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("merge")}>
            <Merge className="mr-2 h-3.5 w-3.5" aria-hidden />
            Merge into another topic
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpen("split")}>
            <Scissors className="mr-2 h-3.5 w-3.5" aria-hidden />
            Split into children
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isProposed ? (
            <DropdownMenuItem onSelect={() => setOpen("reject")} className="text-destructive">
              <CircleSlash className="mr-2 h-3.5 w-3.5" aria-hidden />
              Reject this proposal
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setOpen("retire")} className="text-destructive">
              <CircleSlash className="mr-2 h-3.5 w-3.5" aria-hidden />
              Retire topic
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {kind === "retire" ? (
        <RetireChange mapId={mapId} slug={slug} topic={topic} onClose={close} onDone={onTopicGone} />
      ) : kind === "reject" ? (
        <RejectChange mapId={mapId} slug={slug} topic={topic} onClose={close} onDone={onTopicGone} />
      ) : kind === "move" ? (
        <MoveChange mapId={mapId} slug={slug} topic={topic} onClose={close} />
      ) : kind === "merge" ? (
        <MergeChange mapId={mapId} slug={slug} topic={topic} onClose={close} onDone={onTopicGone} />
      ) : kind === "split" ? (
        <SplitChange mapId={mapId} slug={slug} topic={topic} onClose={close} />
      ) : null}
    </>
  );
}

// ── The shared two-step shell ───────────────────────────────────────────────

interface ChangeShellProps {
  title: string;
  /** The inputs, above the consequence. */
  form: ReactNode;
  /** Can the rehearsal run with what is entered? */
  ready: boolean;
  /** The rehearsal — `seo.map_dry_run` on the exact call. */
  rehearse: () => Promise<Json>;
  /** The consequence sentence, from the rehearsal's own answer. */
  consequence: (wouldReturn: Json) => string;
  /** The write. */
  run: () => Promise<void>;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
}

function ChangeShell({
  title,
  form,
  ready,
  rehearse,
  consequence,
  run,
  confirmLabel,
  destructive,
  onClose,
}: ChangeShellProps) {
  const [preview, setPreview] = useState<Json | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRehearse() {
    setBusy(true);
    setRefusal(null);
    try {
      setPreview(await rehearse());
    } catch (error) {
      setRefusal(topicalMapErrorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    setBusy(true);
    setRefusal(null);
    try {
      await run();
      onClose();
    } catch (error) {
      setRefusal(topicalMapErrorText(error));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      variant={destructive ? "destructive" : "default"}
      description={
        preview !== null
          ? consequence(preview)
          : "Nothing has changed yet. Preview runs the real function and rolls it back, so you see exactly what would happen."
      }
      content={
        <div className="flex flex-col gap-2">
          {form}
          {refusal ? (
            <ErrorNotice size="inline" className="whitespace-pre-wrap text-xs" message={refusal} />
          ) : null}
          {preview !== null ? (
            <pre className="max-h-40 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-[11px]">
              {JSON.stringify(preview, null, 2)}
            </pre>
          ) : null}
        </div>
      }
      confirmLabel={preview === null ? "Preview" : confirmLabel}
      confirmDisabled={!ready}
      busy={busy}
      onConfirm={() => void (preview === null ? onRehearse() : onConfirm())}
    />
  );
}

// ── Retire ──────────────────────────────────────────────────────────────────

function RetireChange({
  mapId,
  slug,
  topic,
  onClose,
  onDone,
}: {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  onClose: () => void;
  onDone: () => void;
}) {
  const [policy, setPolicy] = useState<MapTopicRemovalPolicy>("error");
  const [liftChildren, setLiftChildren] = useState(true);
  const dryRun = useMapDryRun();
  const retire = useRetireMapTopics(mapId);
  const fn: MapDryRunFunction = "retire_map_topics";

  return (
    <ChangeShell
      title={`Retire "${topic.name}"`}
      destructive
      confirmLabel="Retire"
      onClose={onClose}
      ready
      form={
        <>
          <PolicyPicker
            label="If pages, planned pages, keywords or facets are attached"
            value={policy}
            options={REMOVAL_POLICIES}
            onChange={(value) => setPolicy(value as MapTopicRemovalPolicy)}
          />
          {topic.childSlugs.length > 0 || topic.childrenCount ? (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={liftChildren}
                onChange={(event) => setLiftChildren(event.target.checked)}
              />
              Lift its children to this topic&rsquo;s parent (otherwise they retire with it)
            </label>
          ) : null}
        </>
      }
      rehearse={async () =>
        (await dryRun.mutateAsync({ fn, args: [mapId, [slug], policy, liftChildren] })).would_return
      }
      consequence={(would) => {
        const result = would as unknown as MapTopicsRetireResult;
        const line = result.removed
          .map((r) => `${r.slug}: ${r.action.replace(/_/g, " ")} (${attachmentsLine(r.attachments)})`)
          .join("; ");
        return `This retires the topic. It stops being a destination for pages and agents, and its history row records who did it. ${line}. Retiring cannot be undone from here — a retired topic is restored on the History screen.`;
      }}
      run={async () => {
        await retire.mutateAsync({ slugs: [slug], onAttachments: policy, liftChildren });
        toast.success(`Retired "${topic.name}".`);
        onDone();
      }}
    />
  );
}

// ── Reject ──────────────────────────────────────────────────────────────────

function RejectChange({
  mapId,
  slug,
  topic,
  onClose,
  onDone,
}: {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  onClose: () => void;
  onDone: () => void;
}) {
  const [policy, setPolicy] = useState<MapTopicRejectionPolicy>("error");
  const dryRun = useMapDryRun();
  const reject = useRejectMapTopics(mapId);
  const fn: MapDryRunFunction = "reject_map_topics";

  return (
    <ChangeShell
      title={`Reject the proposal "${topic.name}"`}
      destructive
      confirmLabel="Reject"
      onClose={onClose}
      ready
      form={
        <PolicyPicker
          label="If anything is attached"
          value={policy}
          options={REJECTION_POLICIES}
          onChange={(value) => setPolicy(value as MapTopicRejectionPolicy)}
        />
      }
      rehearse={async () =>
        (await dryRun.mutateAsync({ fn, args: [mapId, [slug], policy] })).would_return
      }
      consequence={(would) => {
        const result = would as unknown as MapTopicsRejectResult;
        const line = result.rejected
          .map((r) => `${r.slug}: ${r.action.replace(/_/g, " ")} (${attachmentsLine(r.attachments)})`)
          .join("; ");
        return `This rejects the proposal. The row stays and every reader hides it; the History screen lists it and can restore it. ${line}.`;
      }}
      run={async () => {
        await reject.mutateAsync({ slugs: [slug], onAttachments: policy });
        toast.success(`Rejected "${topic.name}".`);
        onDone();
      }}
    />
  );
}

// ── Move ────────────────────────────────────────────────────────────────────

function MoveChange({
  mapId,
  slug,
  topic,
  onClose,
}: {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  onClose: () => void;
}) {
  const topics = useAppSelector(selectMapTopicsBySlug(mapId));
  const [parent, setParent] = useState<string | null>(topic.parentSlug);
  const dryRun = useMapDryRun();
  const move = useMoveMapTopic(mapId);
  const fn: MapDryRunFunction = "move_map_topic";
  // A topic cannot move under itself or its own descendants; the function
  // refuses it too, but the list should not offer it.
  const excluded = descendantsOf(topics, slug);
  excluded.add(slug);
  const candidates = Object.values(topics)
    .filter((row) => !excluded.has(row.slug) && row.status !== "retired" && row.status !== "rejected")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ChangeShell
      title={`Move "${topic.name}"`}
      confirmLabel="Move"
      onClose={onClose}
      ready={parent !== topic.parentSlug}
      form={
        <TopicPicker
          label="New parent"
          value={parent}
          allowRoot
          candidates={candidates}
          onChange={setParent}
        />
      }
      rehearse={async () =>
        (await dryRun.mutateAsync({ fn, args: [mapId, slug, parent] })).would_return
      }
      consequence={() =>
        parent === null
          ? `This moves "${topic.name}" and everything under it to the root of the map. Inherited facets from its old ancestors stop applying.`
          : `This moves "${topic.name}" and everything under it beneath "${topics[parent]?.name ?? parent}". Facets inherited from the new ancestors start applying; those from the old ones stop.`
      }
      run={async () => {
        await move.mutateAsync({ slug, newParentSlug: parent });
        toast.success(`Moved "${topic.name}".`);
      }}
    />
  );
}

// ── Merge ───────────────────────────────────────────────────────────────────

function MergeChange({
  mapId,
  slug,
  topic,
  onClose,
  onDone,
}: {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  onClose: () => void;
  onDone: () => void;
}) {
  const topics = useAppSelector(selectMapTopicsBySlug(mapId));
  const [into, setInto] = useState<string | null>(null);
  const dryRun = useMapDryRun();
  const merge = useMergeMapTopics(mapId);
  const fn: MapDryRunFunction = "merge_map_topics";
  const candidates = Object.values(topics)
    .filter((row) => row.slug !== slug && row.status !== "retired" && row.status !== "rejected")
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ChangeShell
      title={`Merge "${topic.name}" into another topic`}
      destructive
      confirmLabel="Merge"
      onClose={onClose}
      ready={into !== null}
      form={
        <TopicPicker label="Merge into" value={into} candidates={candidates} onChange={setInto} />
      }
      rehearse={async () =>
        (await dryRun.mutateAsync({ fn, args: [mapId, [slug], into] })).would_return
      }
      consequence={(would) => {
        const r = would as unknown as MapMergeResult;
        return `This retires "${topic.name}" and moves what it carries onto "${topics[r.into]?.name ?? r.into}": ${r.associations_moved} attachments moved, ${r.associations_dropped_as_duplicate} dropped as duplicates, ${r.planned_pages_moved} planned pages, ${r.keywords_moved} keywords, ${r.children_reparented} children re-parented.${r.foreign_org_attachments ? ` ${r.foreign_org_attachments} rows another organization filed here stay where they are.` : ""}`;
      }}
      run={async () => {
        if (!into) return;
        await merge.mutateAsync({ fromSlugs: [slug], intoSlug: into });
        toast.success(`Merged "${topic.name}" into "${topics[into]?.name ?? into}".`);
        onDone();
      }}
    />
  );
}

// ── Split ───────────────────────────────────────────────────────────────────

function SplitChange({
  mapId,
  slug,
  topic,
  onClose,
}: {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const dryRun = useMapDryRun();
  const split = useSplitMapTopic(mapId);
  const fn: MapDryRunFunction = "split_map_topic";
  const children: MapTopicTreeNode[] = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name, slug: slugify(name) }));

  return (
    <ChangeShell
      title={`Split "${topic.name}" into children`}
      confirmLabel="Split"
      onClose={onClose}
      ready={children.length > 0}
      form={
        <label className="flex flex-col gap-1 text-xs">
          One child topic per line
          <textarea
            value={text}
            rows={5}
            onChange={(event) => setText(event.target.value)}
            className="rounded-sm border border-border bg-background px-2 py-1 text-sm"
            placeholder={"Residential recycling\nCommercial recycling"}
          />
          {children.length > 0 ? (
            <span className="text-muted-foreground">
              {children.map((child) => child.slug).join(", ")}
            </span>
          ) : null}
        </label>
      }
      rehearse={async () =>
        (await dryRun.mutateAsync({ fn, args: [mapId, slug, children as unknown as Json] })).would_return
      }
      consequence={() =>
        `This adds ${children.length} ${children.length === 1 ? "child" : "children"} under "${topic.name}". Its pages, planned pages and keywords STAY on it — nothing moves down; you place them afterwards.`
      }
      run={async () => {
        await split.mutateAsync({ slug, children });
        toast.success(`Split "${topic.name}" into ${children.length} children.`);
      }}
    />
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function PolicyPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

const ROOT = "__root__";

function TopicPicker({
  label,
  value,
  allowRoot,
  candidates,
  onChange,
}: {
  label: string;
  value: string | null;
  allowRoot?: boolean;
  candidates: readonly NormalizedMapTopic[];
  onChange: (slug: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <Select
        value={value ?? (allowRoot ? ROOT : undefined)}
        onValueChange={(next) => onChange(next === ROOT ? null : next)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Pick a topic" />
        </SelectTrigger>
        <SelectContent>
          {allowRoot ? (
            <SelectItem value={ROOT} className="text-xs">
              (root of the map)
            </SelectItem>
          ) : null}
          {candidates.map((row) => (
            <SelectItem key={row.slug} value={row.slug} className="text-xs">
              {" ".repeat(row.depth * 2)}
              {row.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function descendantsOf(topics: Record<string, NormalizedMapTopic>, slug: string): Set<string> {
  const out = new Set<string>();
  const stack = [...(topics[slug]?.childSlugs ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...(topics[next]?.childSlugs ?? []));
  }
  return out;
}

/** The map's own slug rule (`^[a-z0-9]+(-[a-z0-9]+)*$`). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
