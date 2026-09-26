"use client";

/**
 * The identity block — most important first (vision §2.3): name, status,
 * description, place in the tree, counts. Every field edits IN PLACE through
 * `usePatchMapTopics` with `MapTopicPatch`'s omit-or-value semantics: an edit
 * sends exactly the one key it changes, and `description: null` is the one
 * null that means something (clear it).
 *
 * A per-edit refusal (`result.errors`) and a thrown refusal both reach the
 * person in the function's own words, right under the field.
 */

import { useState } from "react";
import { Pencil } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { topicalMapErrorText } from "../../errors";
import { usePatchMapTopics } from "../../hooks";
import type { NormalizedMapTopic } from "../../redux/types";
import { selectMapTopicCounts } from "../../redux/selectors";
import type { MapTopicPatch, MapTopicStatus } from "../../types";
import { TopicCounts } from "../../ui/TopicCounts";
import { TopicLabelEditor } from "../../ui/TopicLabelEditor";
import { TopicPath } from "../../ui/TopicPath";
import { TopicStatusMark } from "../../ui/TopicStatusMark";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

/**
 * The statuses a person may SET from the panel. `rejected` is never one —
 * only `seo.reject_map_topics` produces it, through the Changes control,
 * because it carries an attachment policy a bare status write cannot.
 */
const SETTABLE_STATUSES: readonly MapTopicStatus[] = ["proposed", "active", "retired"];

export interface IdentitySectionProps {
  mapId: string;
  slug: string;
  topic: NormalizedMapTopic;
  readOnly: boolean;
  /** Where a crumb click goes: the panel re-targets to that topic. */
  onNavigate?: (slug: string) => void;
  /** The knob: the description's soft ceiling, when the coordinator's reader exposes one. */
  descriptionMaxChars?: number;
}

export function IdentitySection({
  mapId,
  slug,
  topic,
  readOnly,
  onNavigate,
  descriptionMaxChars,
}: IdentitySectionProps) {
  const counts = useAppSelector(selectMapTopicCounts(mapId, slug));
  const patch = usePatchMapTopics(mapId);
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function send(edit: Omit<MapTopicPatch, "slug">) {
    setRefusal(null);
    try {
      const result = await patch.mutateAsync([{ slug, ...edit }]);
      const mine = result.errors.find((error) => error.slug === slug || error.slug === null);
      if (mine) setRefusal(mine.message);
    } catch (error) {
      setRefusal(topicalMapErrorText(error));
    }
  }

  const status = (topic.status ?? "active") as MapTopicStatus | string;

  return (
    <div className="flex flex-col gap-2">
      {/* Name — click to edit (Linear: the title is the field). */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editingName && !readOnly ? (
            <TopicLabelEditor
              value={topic.name}
              onCommit={(name) => {
                setEditingName(false);
                void send({ name });
              }}
              onCancel={() => setEditingName(false)}
            />
          ) : (
            <h2
              className={cn(
                "text-base font-semibold leading-tight",
                !readOnly && "cursor-text rounded-sm hover:bg-muted/60",
              )}
              onClick={readOnly ? undefined : () => setEditingName(true)}
              title={readOnly ? undefined : "Click to rename"}
              data-testid="topic-name"
            >
              {topic.name}
            </h2>
          )}
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={slug}>
            {slug}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {readOnly ? (
            <TopicStatusMark status={status} />
          ) : (
            <Select
              value={SETTABLE_STATUSES.includes(status as MapTopicStatus) ? status : undefined}
              onValueChange={(next) => void send({ status: next as MapTopicStatus })}
              disabled={patch.isPending}
            >
              <SelectTrigger className="h-7 w-28 text-xs" aria-label="Status">
                <SelectValue placeholder={status} />
              </SelectTrigger>
              <SelectContent>
                {SETTABLE_STATUSES.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Place in the tree — every crumb is a door to that topic. */}
      <TopicPath mapId={mapId} slug={slug} onNavigate={onNavigate} />

      {/* Counts — nothing at all when the tree was loaded without them. */}
      <TopicCounts counts={counts} />

      {/* Description — edit in place; empty is a real state with its own line. */}
      {editingDescription && !readOnly ? (
        <DescriptionEditor
          value={topic.description ?? ""}
          maxLength={descriptionMaxChars}
          onCommit={(next) => {
            setEditingDescription(false);
            void send({ description: next.length === 0 ? null : next });
          }}
          onCancel={() => setEditingDescription(false)}
        />
      ) : topic.description ? (
        <p
          className={cn(
            "whitespace-pre-wrap text-sm leading-snug",
            !readOnly && "cursor-text rounded-sm hover:bg-muted/60",
          )}
          onClick={readOnly ? undefined : () => setEditingDescription(true)}
          title={readOnly ? undefined : "Click to edit the description"}
          data-testid="topic-description"
        >
          {topic.description}
        </p>
      ) : readOnly ? (
        <p className="text-xs text-muted-foreground">No description.</p>
      ) : (
        <button
          type="button"
          onClick={() => setEditingDescription(true)}
          className="inline-flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" aria-hidden />
          Add a description
        </button>
      )}

      {refusal ? (
        <ErrorNotice size="inline" className="whitespace-pre-wrap text-xs" message={refusal} />
      ) : null}
    </div>
  );
}

function DescriptionEditor({
  value,
  maxLength,
  onCommit,
  onCancel,
}: {
  value: string;
  maxLength?: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex flex-col gap-1">
      <textarea
        autoFocus
        value={draft}
        maxLength={maxLength}
        rows={4}
        aria-label="Description"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onCommit(draft.trim());
          }
        }}
        className="w-full rounded-sm border border-primary/60 bg-background px-2 py-1 text-sm text-foreground outline-none"
      />
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => onCommit(draft.trim())}
          className="rounded-sm bg-primary px-2 py-0.5 text-primary-foreground"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        {maxLength ? (
          <span className="ml-auto tabular-nums text-muted-foreground">
            {draft.length}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}
