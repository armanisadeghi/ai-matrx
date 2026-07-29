"use client";

/**
 * KeywordResearchBlock — renderer for the `keyword_relationship_research`
 * kind. Streaming-first: the bridge feeds partial serverData on every
 * envelope flush, so each relationship bucket card appears the moment its
 * label parses and every keyword chip pops in individually as it arrives.
 * A still-streaming bucket shows a subtle inline pulse; nothing ever waits
 * for the full payload.
 *
 * ## Surface-aware selection — the 360 loop, worked example
 *
 * This block is INTERACTIVE without taking a single interaction prop, because
 * it renders through the canonical pipeline (`BlockRenderer`), which hands a
 * block its data and nothing else. That constraint is deliberate — it is what
 * keeps ONE renderer for streamed content — and it used to mean interactivity
 * required forking the renderer, which is the banned pattern.
 *
 * Instead the block talks to whatever page it landed on through the two
 * surface seams, naming a target and a key and nothing else:
 *
 *   READ   `useCurrentSurfaceUiState("keyword_selection")` — what the page has
 *          already selected / locked. Absent (chat, a share page) ⇒ the block
 *          renders read-only. Same block, every surface.
 *   WRITE  `runAction("apply_surface_write", { target: "keyword_selection" })`
 *          — the page's declared handler decides what selection MEANS there.
 *
 * The block never learns which surface it is on, never receives a callback,
 * and can never reach the page's state directly. An agent-authored component
 * gets exactly the same two seams, under exactly the same manifest gate.
 *
 * Consumes the bridge serverData from
 * features/content-ir/kinds/keyword-research.ts.
 */

import {
  ArrowUpFromDot,
  GitFork,
  Link2,
  Loader2,
  SearchCheck,
  Tags,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  KeywordListData,
  KeywordRelationshipResearchData,
} from "@/features/content-ir/kinds/keyword-research";
import { Checkbox } from "@/components/ui/checkbox";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import { useKindActionRunner } from "@/features/content-ir/react/actions/useKindActionRunner";
import { useCurrentSurfaceUiState } from "@/features/surfaces/runtime/surface-ui-state";

export interface KeywordResearchBlockProps {
  serverData?: unknown;
}

/**
 * The shape a page publishes under the `keyword_selection` UI-state key. Both
 * halves optional: a surface that only wants to LOCK phrases (no selection)
 * publishes `disabled` alone.
 */
export interface KeywordSelectionUiState {
  /** Normalized phrases currently selected. */
  selected?: readonly string[];
  /** Normalized phrases the user may not toggle (e.g. the primary keyword). */
  disabled?: readonly string[];
}

/** The value `apply_surface_write` carries for the `keyword_selection` target. */
export interface KeywordSelectionWrite {
  phrase: string;
  selected: boolean;
}

function isList(value: unknown): value is KeywordListData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as KeywordListData).keywords)
  );
}

export function readKeywordResearchData(
  serverData: unknown,
): KeywordRelationshipResearchData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<KeywordRelationshipResearchData>;
  if (!Array.isArray(candidate.lists)) return null;
  return {
    primaryKeyword:
      typeof candidate.primaryKeyword === "string"
        ? candidate.primaryKeyword
        : null,
    lists: candidate.lists.filter(isList),
    isComplete: candidate.isComplete === true,
  };
}

/** Bucket label → icon element; loose contains-matching so agent phrasing can vary. */
function listIcon(label: string | null): ReactNode {
  const className = "h-3.5 w-3.5 text-primary";
  const lower = (label ?? "").toLowerCase();
  if (lower.includes("parent")) return <ArrowUpFromDot className={className} />;
  if (lower.includes("child")) return <GitFork className={className} />;
  if (lower.includes("lsi") || lower.includes("semantic")) {
    return <Waypoints className={className} />;
  }
  if (lower.includes("related")) return <Link2 className={className} />;
  return <Tags className={className} />;
}

function KeywordListCard({
  list,
  selectedPhrases,
  disabledPhrases,
  interactive,
  onToggle,
}: {
  list: KeywordListData;
  selectedPhrases: ReadonlySet<string>;
  disabledPhrases: ReadonlySet<string>;
  interactive: boolean;
  onToggle: (phrase: string, selected: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        {listIcon(list.label)}
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {list.label ?? "Keywords"}
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {list.keywords.length}
        </span>
        {!list.complete && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.keywords.map((keyword, index) => {
          const key = normalizeKeywordPhrase(keyword);
          const selectable = interactive && !disabledPhrases.has(key);
          return (
            <label
              key={`${index}-${keyword}`}
              className="animate-in fade-in inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
            >
              {selectable ? (
                <Checkbox
                  checked={selectedPhrases.has(key)}
                  onCheckedChange={(checked) =>
                    onToggle(keyword, checked === true)
                  }
                  aria-label={`Select ${keyword} as a supporting keyword`}
                />
              ) : null}
              <span>{keyword}</span>
            </label>
          );
        })}
        {list.keywords.length === 0 && (
          <span className="text-xs text-muted-foreground">Collecting…</span>
        )}
      </div>
    </div>
  );
}

export default function KeywordResearchBlock({
  serverData,
}: KeywordResearchBlockProps) {
  const runAction = useKindActionRunner();
  // Whatever page this block landed on, if it publishes keyword selection.
  // Undefined everywhere else — chat renders the same block read-only.
  const selectionState =
    useCurrentSurfaceUiState<KeywordSelectionUiState>("keyword_selection");
  const data = readKeywordResearchData(serverData);
  if (!data) return null;

  const selectedPhrases = new Set(selectionState?.selected ?? []);
  const disabledPhrases = new Set(selectionState?.disabled ?? []);
  // A surface that publishes the key is offering selection. One that does not
  // gets a read-only render — never a dead checkbox.
  const interactive = selectionState !== undefined;

  const onToggle = (phrase: string, selected: boolean) => {
    // Fire-and-forget by contract: `runAction` NEVER throws and always reports
    // its own failure (toast + captured error). A rejected write leaves the
    // page state untouched, so the checkbox simply does not move.
    void runAction("apply_surface_write", {
      target: "keyword_selection",
      value: { phrase, selected } satisfies KeywordSelectionWrite,
      // A real checkbox click by the viewer — the click IS the consent, so the
      // target's applyPolicy is not consulted. Anything this component did on
      // its OWN (on mount, from streamed instructions) must omit this and be
      // gated. See handlers/apply-surface-write.ts § Origin.
      origin: "user",
    });
  };

  return (
    <div className="my-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Keyword research
        </span>
        {data.primaryKeyword && (
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-foreground">
            {data.primaryKeyword}
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Mapping relationships
          </span>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {data.lists.map((list, index) => (
          <KeywordListCard
            key={index}
            list={list}
            selectedPhrases={selectedPhrases}
            disabledPhrases={disabledPhrases}
            interactive={interactive}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
