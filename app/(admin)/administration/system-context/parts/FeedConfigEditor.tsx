"use client";

// The FEED is the authored thing for a System Context item — how its value
// gets populated. This module is the shared taxonomy + the editor used by both
// the Add and Edit dialogs. "manual" is the rare case (you type a value); every
// other feed describes a mechanism that produces/points-at the value.
//
// Live today: manual (typed value) + dataset (point at a real RAG data store).
// Definition-only (executor lands in a later wave — the config is captured and
// honestly marked "pending"): agent, api, web, computed. This matches the
// intended workflow: establish the resource, then build how we feed it.

import {
  Bot,
  Code2,
  Database,
  ExternalLink,
  Globe2,
  Loader2,
  Pencil,
  Plug,
  Plus,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLibraryCatalog } from "@/features/rag/hooks/useLibraryCatalog";
import type { Database as DB, Json } from "@/types/database.types";

export type FeedType = DB["public"]["Enums"]["context_feed_type"];
export type FeedConfig = Record<string, unknown>;

export interface FeedTypeOption {
  value: FeedType;
  label: string;
  description: string;
  /** Fully wired end-to-end (vs. definition-captured, executor pending). */
  live: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

export const FEED_TYPE_OPTIONS: FeedTypeOption[] = [
  {
    value: "dataset",
    label: "Linked dataset",
    description:
      "Point at a knowledge resource (RAG data store) — agents query it with the RAG tools. For large multifaceted resources (e.g. the AMA Guides).",
    live: true,
    icon: Database,
  },
  {
    value: "manual",
    label: "Manual value",
    description:
      "Type the value yourself. Rare — most platform resources are fed automatically.",
    live: true,
    icon: Pencil,
  },
  {
    value: "agent",
    label: "Agent",
    description:
      "Run an agent (optionally with a JSON output schema) to produce the value. Can be scheduled.",
    live: false,
    icon: Bot,
  },
  {
    value: "api",
    label: "API call",
    description:
      "Fetch from a defined API endpoint and store the result per an extraction. Can be scheduled.",
    live: false,
    icon: Plug,
  },
  {
    value: "web",
    label: "Web / scrape",
    description:
      "Extract from web page(s) — including saved browser extraction patterns run through our scraper. Can be scheduled.",
    live: false,
    icon: Globe2,
  },
  {
    value: "computed",
    label: "Computed",
    description:
      "Value computed by code/expression at resolution time. Built-in ambient values (current_date…) use this; user-defined code is coming.",
    live: false,
    icon: Code2,
  },
];

export function feedTypeMeta(t: FeedType): FeedTypeOption {
  return FEED_TYPE_OPTIONS.find((o) => o.value === t) ?? FEED_TYPE_OPTIONS[0];
}

export function feedTypeTone(t: FeedType): string {
  switch (t) {
    case "dataset":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200";
    case "manual":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
    case "agent":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
    case "api":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200";
    case "web":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "computed":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function cfgStr(config: FeedConfig, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

export interface FeedLink {
  href: string;
  label: string;
}

// Where the SOURCE of a feed lives (its admin/detail home) — so any linked
// resource is one click from being opened for a quick check. Null when the feed
// has no external source (manual value, ambient compute).
export function feedSourceLink(
  feedType: FeedType,
  feedConfig: FeedConfig | null | undefined,
): FeedLink | null {
  const cfg = feedConfig ?? {};
  switch (feedType) {
    case "dataset": {
      const id = cfgStr(cfg, "data_store_id");
      return id
        ? { href: `/rag/data-stores?store_id=${encodeURIComponent(id)}`, label: "Open dataset" }
        : null;
    }
    case "agent": {
      const id = cfgStr(cfg, "agent_id");
      return id ? { href: `/agents/${encodeURIComponent(id)}`, label: "Open agent" } : null;
    }
    default:
      return null;
  }
}

// Where to CREATE more resources of a feed's kind — so this surface never links
// to a thing without also showing how to make another one.
export function feedCreateLink(feedType: FeedType): FeedLink | null {
  switch (feedType) {
    case "dataset":
      return { href: "/rag/data-stores", label: "Manage / create datasets" };
    case "agent":
      return { href: "/agents", label: "Browse / create agents" };
    default:
      return null;
  }
}

// A new-tab link to an admin/source home. (The user asked for "another tab or a
// window panel"; a new tab is the robust default for a cross-feature jump.)
export function OpenSourceLink({
  link,
  create = false,
  className = "",
}: {
  link: FeedLink;
  create?: boolean;
  className?: string;
}) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline ${className}`}
    >
      {create ? <Plus className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
      {link.label}
    </a>
  );
}

// ── Dataset picker — lists published/discoverable knowledge libraries from
// the live RAG catalog (/rag/library-catalog) and writes the pointer.
function DatasetFeedConfig({
  config,
  onChange,
}: {
  config: FeedConfig;
  onChange: (next: FeedConfig) => void;
}) {
  const { items, loading, error } = useLibraryCatalog();
  const selectedId = cfgStr(config, "data_store_id");
  const sourceLink = feedSourceLink("dataset", config);
  const createLink = feedCreateLink("dataset");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">Knowledge resource</span>
        <div className="flex items-center gap-3">
          {sourceLink && <OpenSourceLink link={sourceLink} />}
          {createLink && <OpenSourceLink link={createLink} create />}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading library catalog…
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">Could not load datasets: {error}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No published knowledge libraries found. Publish one from{" "}
          <code className="text-[11px]">/rag/data-stores</code> first.
        </p>
      ) : (
        <Select
          value={selectedId}
          onValueChange={(id) => {
            const picked = items.find((i) => i.id === id);
            onChange({
              data_store_id: id,
              data_store_name: picked?.name ?? null,
              data_store_short_code: picked?.shortCode ?? null,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick a knowledge resource" />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
                {i.shortCode ? ` (${i.shortCode})` : ""} · {i.memberCount} source
                {i.memberCount === 1 ? "" : "s"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-[11px] text-muted-foreground">
        Agents query this resource with the RAG tools (
        <code className="text-[10px]">rag_search(data_store_id=…)</code>). Pointing
        at sub-resources (only the tables, only the KG…) comes next.
      </p>
    </div>
  );
}

function PendingBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-amber-400/50 text-amber-700 dark:text-amber-300">
      Definition only · executor coming
    </Badge>
  );
}

function FieldRow({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

// Agent / API / Web / Computed: capture the definition now; the executor that
// actually runs it lands in a later wave (status shows "pending").
function DefinitionFeedConfig({
  feedType,
  config,
  onChange,
}: {
  feedType: FeedType;
  config: FeedConfig;
  onChange: (next: FeedConfig) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-3">
      <PendingBadge />

      {feedType === "agent" && (
        <>
          <FieldRow label="Agent prompt" hint="What the agent should produce as this value.">
            <Textarea
              rows={3}
              value={cfgStr(config, "prompt")}
              onChange={(e) => set("prompt", e.target.value)}
              placeholder="Summarize today's top 10 AI policy headlines as a JSON array of {title, url}."
            />
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Merge policy">
              <Select
                value={cfgStr(config, "merge") || "replace"}
                onValueChange={(v) => set("merge", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace">Replace</SelectItem>
                  <SelectItem value="additive">Additive (append)</SelectItem>
                  <SelectItem value="merge">Merge</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Refresh (cron)" hint="Blank = on demand.">
              <Input
                value={cfgStr(config, "cron")}
                onChange={(e) => set("cron", e.target.value)}
                placeholder="0 * * * *"
                className="font-mono text-xs"
              />
            </FieldRow>
          </div>
        </>
      )}

      {feedType === "api" && (
        <>
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <FieldRow label="Method">
              <Select value={cfgStr(config, "method") || "GET"} onValueChange={(v) => set("method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Endpoint URL">
              <Input
                value={cfgStr(config, "endpoint")}
                onChange={(e) => set("endpoint", e.target.value)}
                placeholder="https://api.example.com/v1/resource"
                className="font-mono text-xs"
              />
            </FieldRow>
          </div>
          <FieldRow label="Extraction" hint="JSONPath / expression to pull the value from the response.">
            <Input
              value={cfgStr(config, "extraction")}
              onChange={(e) => set("extraction", e.target.value)}
              placeholder="$.data.items"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow label="Refresh (cron)" hint="Blank = on demand.">
            <Input
              value={cfgStr(config, "cron")}
              onChange={(e) => set("cron", e.target.value)}
              placeholder="0 6 * * *"
              className="font-mono text-xs"
            />
          </FieldRow>
        </>
      )}

      {feedType === "web" && (
        <>
          <FieldRow label="Page URL">
            <Input
              value={cfgStr(config, "url")}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://example.com/page-with-data"
              className="font-mono text-xs"
            />
          </FieldRow>
          <FieldRow
            label="Extraction pattern"
            hint="A saved browser extraction pattern (from the Matrx Chrome plugin) or a CSS/AI extraction. Runs through our scraper."
          >
            <Input
              value={cfgStr(config, "pattern")}
              onChange={(e) => set("pattern", e.target.value)}
              placeholder="pattern id / selector / AI extract prompt"
            />
          </FieldRow>
          <FieldRow label="Refresh (cron)" hint="Blank = on demand.">
            <Input
              value={cfgStr(config, "cron")}
              onChange={(e) => set("cron", e.target.value)}
              placeholder="*/30 * * * *"
              className="font-mono text-xs"
            />
          </FieldRow>
        </>
      )}

      {feedType === "computed" && (
        <FieldRow label="Expression / code" hint="User-defined computed code is coming; built-in ambient keys (current_date…) are reserved.">
          <Textarea
            rows={3}
            value={cfgStr(config, "expression")}
            onChange={(e) => set("expression", e.target.value)}
            placeholder="e.g. now() in the user's timezone"
            className="font-mono text-xs"
          />
        </FieldRow>
      )}
    </div>
  );
}

// The full feed editor: the "how is this populated?" selector + per-type config.
// For "manual", the caller renders the value-authoring UI (component + value);
// this returns null body so the dialog shows that instead.
export function FeedConfigEditor({
  feedType,
  onFeedTypeChange,
  feedConfig,
  onFeedConfigChange,
  lockFeedType = false,
}: {
  feedType: FeedType;
  onFeedTypeChange: (t: FeedType) => void;
  feedConfig: FeedConfig;
  onFeedConfigChange: (c: FeedConfig) => void;
  /** When editing an existing item, the feed type is shown but not switchable. */
  lockFeedType?: boolean;
}) {
  const meta = feedTypeMeta(feedType);
  const Icon = meta.icon;

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground">
          How is this populated?
        </span>
        <Select
          value={feedType}
          onValueChange={(v) => {
            onFeedTypeChange(v as FeedType);
            onFeedConfigChange({}); // reset config when the mechanism changes
          }}
          disabled={lockFeedType}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEED_TYPE_OPTIONS.map((o) => {
              const OIcon = o.icon;
              return (
                <SelectItem key={o.value} value={o.value}>
                  <span className="flex items-center gap-2">
                    <OIcon className="h-3.5 w-3.5" />
                    {o.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <span className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="mt-0.5 h-3 w-3 shrink-0" />
          {meta.description}
        </span>
      </label>

      {feedType === "dataset" && (
        <DatasetFeedConfig config={feedConfig} onChange={onFeedConfigChange} />
      )}
      {(feedType === "agent" ||
        feedType === "api" ||
        feedType === "web" ||
        feedType === "computed") && (
        <DefinitionFeedConfig
          feedType={feedType}
          config={feedConfig}
          onChange={onFeedConfigChange}
        />
      )}
      {/* manual → caller renders the value-authoring UI */}
    </div>
  );
}

export function asFeedConfig(value: Json | null | undefined): FeedConfig {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FeedConfig)
    : {};
}
