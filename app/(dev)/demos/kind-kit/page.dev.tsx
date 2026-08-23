"use client";

/**
 * /demos/kind-kit — exercises every kind-kit primitive with sample data.
 * The kit is what DB-authored kind components import; this page is the
 * living proof each primitive behaves as its README contract says.
 * Contracts: components/kind-kit/README.md.
 */

import { useState } from "react";
import {
  ArrowUpFromDot,
  Copy,
  GitFork,
  Link2,
  SearchCheck,
  Tags,
  Trash2,
  Waypoints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { SortableList } from "@/components/kind-kit/SortableList";
import { KindPanelGrid } from "@/components/kind-kit/KindPanelGrid";
import { KindPanel } from "@/components/kind-kit/KindPanel";
import { KindHeaderBar } from "@/components/kind-kit/KindHeaderBar";
import {
  StreamingSkeleton,
  streamList,
  streamText,
  useStreamingValue,
} from "@/components/kind-kit/StreamingSkeleton";
import { KeywordChip, TagList } from "@/components/kind-kit/TagList";

interface Bucket {
  id: string;
  label: string;
  rationale: string;
  icon: typeof Tags;
  keywords: string[];
  complete: boolean;
}

const INITIAL_BUCKETS: Bucket[] = [
  {
    id: "parent",
    label: "Parent topics",
    rationale:
      "Broader phrases this keyword sits under — useful for pillar pages and category hubs that should link down to the target page.",
    icon: ArrowUpFromDot,
    keywords: ["project management software", "team collaboration tools"],
    complete: true,
  },
  {
    id: "child",
    label: "Child keywords",
    rationale: "Narrower phrases the target page could fully answer in a section.",
    icon: GitFork,
    keywords: [
      "best project management software for small teams",
      "free project management software with gantt charts",
      "project management software comparison 2026",
      "agile project management tools for remote teams",
    ],
    complete: true,
  },
  {
    id: "lsi",
    label: "Semantic (LSI)",
    rationale:
      "Co-occurring vocabulary search engines expect on a page about this topic.",
    icon: Waypoints,
    keywords: ["kanban board", "sprint planning", "resource allocation", "milestones"],
    complete: false,
  },
  {
    id: "related",
    label: "Related searches",
    rationale: "Adjacent intents worth a mention or an internal link.",
    icon: Link2,
    keywords: ["task management app", "time tracking software", "OKR tools"],
    complete: true,
  },
];

interface Step {
  id: string;
  title: string;
  detail: string;
}

const INITIAL_STEPS: Step[] = [
  { id: "s1", title: "Audit existing pages", detail: "Find what already ranks for the parent topics." },
  { id: "s2", title: "Draft the pillar page", detail: "Cover every child keyword as a section." },
  { id: "s3", title: "Build supporting posts", detail: "One post per long-tail phrase with real search volume." },
  { id: "s4", title: "Interlink", detail: "Pillar ↔ posts ↔ related-search pages." },
  { id: "s5", title: "Measure", detail: "Rank tracking on the full keyword set after 30 days." },
];

export default function KindKitDemoPage() {
  const [buckets, setBuckets] = useState<Bucket[]>(INITIAL_BUCKETS);
  const [selected, setSelected] = useState<string[]>(["kanban board"]);
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [simulateStream, setSimulateStream] = useState(false);
  const [chipLabel, setChipLabel] = useState("editable keyword phrase");

  // Simulates the partial-instance case: while "streaming", the title field is absent.
  const streamedTitle = simulateStream ? undefined : "project management software";
  const { value: title, arrived } = useStreamingValue(streamedTitle, "Keyword research");
  const lists = simulateStream ? [] : buckets;
  const totalKeywords = buckets.reduce((n, b) => n + b.keywords.length, 0);

  const updateBucket = (id: string, fn: (b: Bucket) => Bucket) =>
    setBuckets((prev) => prev.map((b) => (b.id === id ? fn(b) : b)));

  const toMarkdown = () =>
    buckets
      .map((b) => `## ${b.label}\n${b.keywords.map((k) => `- ${k}`).join("\n")}`)
      .join("\n\n");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">kind-kit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The primitives DB-authored kind components import. Contract:
          <code className="ml-1 rounded bg-muted px-1 py-0.5 text-xs">
            components/kind-kit/README.md
          </code>
        </p>
      </div>

      {/* 1. KindHeaderBar + KindPanelGrid + KindPanel + TagList + StreamingSkeleton */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Header bar · panel grid · panels · tag lists
          </h2>
          <div className="flex items-center gap-2">
            <Switch
              id="stream"
              checked={simulateStream}
              onCheckedChange={setSimulateStream}
            />
            <Label htmlFor="stream" className="text-xs">
              Simulate &quot;before data lands&quot;
            </Label>
          </div>
        </div>

        <KindHeaderBar
          icon={SearchCheck}
          title={title}
          subtitle={arrived ? "primary keyword" : "waiting for the title field"}
          stats={[
            { label: "buckets", value: lists.length },
            { label: "keywords", value: simulateStream ? 0 : totalKeywords },
            { label: "selected", value: selected.length },
          ]}
          streaming={simulateStream || buckets.some((b) => !b.complete)}
          copy={{
            label: "Keyword research",
            human: toMarkdown,
            json: () => ({ __kind: "keyword_relationship_research", lists: buckets }),
          }}
        />

        {lists.length === 0 ? (
          <StreamingSkeleton layout="cards" rows={4} header={false} />
        ) : (
          <KindPanelGrid minColumnWidth={280}>
            {lists.map((bucket) => (
              <KindPanel
                key={bucket.id}
                icon={bucket.icon}
                title={streamText(bucket.label, "Keywords")}
                count={bucket.keywords.length}
                streaming={!bucket.complete}
                subline={bucket.rationale}
                menuItems={[
                  {
                    label: "Copy bucket",
                    icon: Copy,
                    onSelect: () => void writeClipboard(bucket.keywords.join("\n")),
                  },
                  {
                    label: bucket.complete ? "Mark streaming" : "Mark complete",
                    onSelect: () =>
                      updateBucket(bucket.id, (b) => ({ ...b, complete: !b.complete })),
                  },
                  {
                    label: "Clear keywords",
                    icon: Trash2,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => updateBucket(bucket.id, (b) => ({ ...b, keywords: [] })),
                  },
                ]}
                footer={
                  <TagList
                    items={[]}
                    onAdd={(label) =>
                      updateBucket(bucket.id, (b) => ({ ...b, keywords: [...b.keywords, label] }))
                    }
                    addPlaceholder="Add keyword…"
                  />
                }
              >
                <TagList
                  items={streamList<string>(bucket.keywords)}
                  selected={selected}
                  onToggle={(key, next) =>
                    setSelected((s) => (next ? [...s, key] : s.filter((x) => x !== key)))
                  }
                  onRemove={(key) =>
                    updateBucket(bucket.id, (b) => ({
                      ...b,
                      keywords: b.keywords.filter((k) => k !== key),
                    }))
                  }
                  onEdit={(key, _i, next) =>
                    updateBucket(bucket.id, (b) => ({
                      ...b,
                      keywords: b.keywords.map((k) => (k === key ? next : k)),
                    }))
                  }
                  emptyState="No keywords yet"
                />
              </KindPanel>
            ))}
          </KindPanelGrid>
        )}
        <p className="text-xs text-muted-foreground">
          Resize the window: the grid drops columns before any panel goes under
          280px; footers (the Add rows) stay aligned; rationales take the full
          width; long phrases wrap inside their chips.
        </p>
      </section>

      {/* 2. SortableList */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">SortableList</h2>
        <p className="text-xs text-muted-foreground">
          Drag by the grip: rows displace out of the way and the dashed,
          shadowed placeholder shows where the item lands. Arrows are the
          keyboard/touch fallback. The X removes.
        </p>
        <div className="max-w-xl">
          <SortableList
            items={steps}
            getKey={(s) => s.id}
            onReorder={setSteps}
            onRemove={(s) => setSteps((prev) => prev.filter((x) => x.id !== s.id))}
            renderItem={(s, { index }) => (
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {index + 1}. {s.title}
                </div>
                <div className="text-xs text-muted-foreground">{s.detail}</div>
              </div>
            )}
            emptyState="All steps removed."
            ariaLabel="Plan steps"
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSteps(INITIAL_STEPS)}
            >
              Reset
            </Button>
            <span className="text-xs text-muted-foreground">
              Order: {steps.map((s) => s.id).join(" → ") || "—"}
            </span>
          </div>
        </div>
      </section>

      {/* 3. KeywordChip variants */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">KeywordChip</h2>
        <div className="flex max-w-md flex-wrap gap-2">
          <KeywordChip label="plain" />
          <KeywordChip label="with meta" meta="1.2k" />
          <KeywordChip label="primary tone" tone="primary" />
          <KeywordChip label="muted tone" tone="muted" />
          <KeywordChip label="selected" selected onSelect={() => undefined} />
          <KeywordChip label="disabled" disabled onRemove={() => undefined} />
          <KeywordChip label={chipLabel} onEdit={setChipLabel} onRemove={() => setChipLabel("removed")} size="md" />
          <KeywordChip
            label="a deliberately very long keyword phrase that must wrap inside its chip instead of being cut off with an ellipsis"
            meta="wraps"
          />
        </div>
      </section>

      {/* 4. StreamingSkeleton layouts */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">StreamingSkeleton</h2>
        <KindPanelGrid minColumnWidth={260}>
          {(["list", "cards", "table", "text"] as const).map((layout) => (
            <KindPanel key={layout} title={layout} variant="card" dense>
              <StreamingSkeleton layout={layout} rows={3} />
            </KindPanel>
          ))}
        </KindPanelGrid>
      </section>
    </div>
  );
}
