"use client";

/**
 * /review/page-cleanup — the owner walks every page nothing links to and says Delete / Keep /
 * Unsure, with a note. Each link opens the page in a new tab.
 *
 * LABELS vs STORED VALUES: the stored decision values stay `yes` / `no` / `maybe` (the typed table's
 * select options and the browser copy both already hold them), so nothing saved before the
 * 2026-10-05 relabel is lost or needs migrating: yes = Delete, no = Keep, maybe = Unsure. Every
 * word the owner sees — the control, the legend and the copied text — comes from DECISION_LABEL.
 *
 * PERSISTENCE: the record store's typed table `pageCleanupDecisions` first (read across every
 * organization the person belongs to; each write carries the organization the person has
 * selected, asked through the platform's organization gate — never picked here). When the store
 * cannot answer (its typed-table doors are not on that database yet: `door_absent`), the page says
 * so in the header and keeps decisions in this browser. Every edit is ALSO mirrored to this
 * browser so a failed store write never loses what was typed.
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Database, ExternalLink, HardDrive, Trash2 } from "lucide-react";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { Badge, ToggleGroup, ToggleGroupItem } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  createRecordsClient,
  type RecordsClient,
} from "@ai-matrx/records/core";
import { listAppRows, upsertAppRow } from "@ai-matrx/records/typed-table";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

import { InfoHint } from "@/components/official/InfoHint";
import { copyContent } from "@ai-matrx/rich-content/copy/copy-commands";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

import {
  PAGE_CLEANUP_ROWS,
  type CleanupRecommendation,
  type CleanupRow,
} from "./page-cleanup-rows";
import {
  pageCleanupDecisions,
  PAGE_CLEANUP_DECISIONS,
  type PageCleanupDecision,
} from "./page-cleanup.typed-table";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

interface Entry {
  decision: PageCleanupDecision | null;
  notes: string;
  /** ISO time of the last change, used to pick the newest when two organizations hold a row. */
  at: string;
}
type Entries = Record<string, Entry>;
type Store =
  { state: "loading" } | { state: "store" } | { state: "browser"; why: string };
type RowSave = "saving" | "saved" | "failed";

const BROWSER_KEY = "matrx:page-cleanup-decisions:v1";
const NOTES_DEBOUNCE_MS = 700;

const DECISION_LABEL: Record<PageCleanupDecision, string> = {
  yes: "Delete",
  no: "Keep",
  maybe: "Unsure",
};
const REC_LABEL: Record<CleanupRecommendation, string> = {
  KILL: "Kill",
  ASK: "Ask",
  ALIAS: "Alias",
  SHELL: "Shell",
};
const REC_VARIANT: Record<
  CleanupRecommendation,
  "destructive" | "warning" | "secondary" | "outline"
> = {
  KILL: "destructive",
  ASK: "warning",
  ALIAS: "secondary",
  SHELL: "outline",
};

function readBrowser(): Entries {
  try {
    const raw = window.localStorage.getItem(BROWSER_KEY);
    return raw ? (JSON.parse(raw) as Entries) : {};
  } catch {
    return {};
  }
}
function writeBrowser(entries: Entries): void {
  try {
    window.localStorage.setItem(BROWSER_KEY, JSON.stringify(entries));
  } catch {
    // Private window / blocked storage: the store (when it answers) still holds the row.
  }
}

/** One pending notes save per row; a newer keystroke replaces it (one page, one map). */
const pendingNotes = new Map<string, ReturnType<typeof setTimeout>>();

let client: RecordsClient | null = null;
function recordsClient(userId: string | null): RecordsClient {
  // organizationId null: reads span every organization the person belongs to; each write names
  // its organization explicitly (ensureOrganizationForWrite).
  client ??= createRecordsClient({
    dataSource: recordsDataSource(createClient()),
    actor: personActor(userId),
    organizationId: null,
  });
  return client;
}

function isEmpty(e: Entry | undefined): boolean {
  return !e || (!e.decision && !e.notes.trim());
}

export default function PageCleanupReview() {
  const userId = useAppSelector(selectUserId);
  const [entries, setEntries] = useState<Entries>({});
  const [store, setStore] = useState<Store>({ state: "loading" });
  const [saves, setSaves] = useState<Record<string, RowSave>>({});
  const [recFilter, setRecFilter] = useState<"all" | CleanupRecommendation>(
    "all",
  );
  const [doneFilter, setDoneFilter] = useState<"all" | "open" | "done">("all");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void (async () => {
      const read = await listAppRows(
        recordsClient(userId),
        pageCleanupDecisions,
      );
      if (!live) return;
      if (!read.ok) {
        const saved = readBrowser();
        setEntries(saved);
        setStore({ state: "browser", why: read.error.message });
        return;
      }
      const next: Entries = {};
      for (const row of read.data.rows) {
        const at = row.changed_at ?? "";
        const prev = next[row.path];
        if (prev && prev.at >= at) continue;
        next[row.path] = {
          decision: row.decision ?? null,
          notes: row.notes ?? "",
          at,
        };
      }
      setEntries(next);
      setStore({ state: "store" });
    })();
    return () => {
      live = false;
    };
  }, [userId]);

  async function persist(path: string, entry: Entry, all: Entries) {
    writeBrowser(all);
    if (store.state !== "store") return;
    setSaves((s) => ({ ...s, [path]: "saving" }));
    try {
      const organizationId = await ensureOrgId(null);
      const written = await upsertAppRow(
        recordsClient(userId),
        pageCleanupDecisions,
        { path, decision: entry.decision, notes: entry.notes },
        { organizationId },
      );
      if (!written.ok) throw new Error(written.error.message);
      setSaves((s) => ({ ...s, [path]: "saved" }));
    } catch (error) {
      setSaves((s) => ({ ...s, [path]: "failed" }));
      toast.error("Could not save this decision", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function change(
    path: string,
    patch: Partial<Pick<Entry, "decision" | "notes">>,
    debounce: boolean,
  ) {
    const prev = entries[path] ?? { decision: null, notes: "", at: "" };
    const entry: Entry = { ...prev, ...patch, at: new Date().toISOString() };
    const next = { ...entries, [path]: entry };
    setEntries(next);
    clearTimeout(pendingNotes.get(path));
    if (debounce)
      pendingNotes.set(
        path,
        setTimeout(() => void persist(path, entry, next), NOTES_DEBOUNCE_MS),
      );
    else void persist(path, entry, next);
  }

  const decidedCount = PAGE_CLEANUP_ROWS.filter(
    (r) => entries[r.path]?.decision,
  ).length;

  const visible = useMemo(
    () =>
      PAGE_CLEANUP_ROWS.filter((r) => {
        if (recFilter !== "all" && r.rec !== recFilter) return false;
        const decided = Boolean(entries[r.path]?.decision);
        if (doneFilter === "open" && decided) return false;
        if (doneFilter === "done" && !decided) return false;
        return true;
      }),
    [entries, recFilter, doneFilter],
  );

  const sections = useMemo(() => {
    const out: {
      key: string;
      title: string;
      areas: { area: string; rows: CleanupRow[] }[];
    }[] = [
      { key: "orphan", title: "Pages nothing links to", areas: [] },
      { key: "forward", title: "Old addresses that forward", areas: [] },
      { key: "lower", title: "Empty shells", areas: [] },
    ];
    const index: Record<CleanupRow["group"], number> = {
      orphan: 0,
      forward: 1,
      lower: 2,
    };
    for (const row of visible) {
      const section = out[index[row.group]];
      let bucket = section.areas.find((a) => a.area === row.area);
      if (!bucket) section.areas.push((bucket = { area: row.area, rows: [] }));
      bucket.rows.push(row);
    }
    return out.filter((s) => s.areas.length > 0);
  }, [visible]);

  async function copyDecisions() {
    const lines = PAGE_CLEANUP_ROWS.filter(
      (r) => !isEmpty(entries[r.path]),
    ).map((r) => {
      const e = entries[r.path];
      return [
        r.path,
        e.decision ? DECISION_LABEL[e.decision] : "Undecided",
        e.notes.trim(),
      ]
        .filter(Boolean)
        .join(" · ");
    });
    if (lines.length === 0) {
      toast.info("Nothing to copy yet");
      return;
    }
    const ok = await copyContent(lines.join("\n"), { formatJson: false });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SegmentedControl aria-label="Recommendation"
          value={recFilter}
          onValueChange={(v) => setRecFilter(v as typeof recFilter)}
          data={[
            { value: "all", label: "All" },
            { value: "KILL", label: "Kill" },
            { value: "ASK", label: "Ask" },
            { value: "ALIAS", label: "Alias" },
            { value: "SHELL", label: "Shell" },
          ]}
        />
        <SegmentedControl aria-label="Decision state"
          value={doneFilter}
          onValueChange={(v) => setDoneFilter(v as typeof doneFilter)}
          data={[
            { value: "all", label: "All" },
            { value: "open", label: "Undecided" },
            { value: "done", label: "Decided" },
          ]}
        />
        <span
          className="text-xs tabular-nums text-muted-foreground"
          data-testid="decided-count"
        >
          {/* read-gate-exempt: counts the decisions made on this screen (local state) */}
          {decidedCount} of {PAGE_CLEANUP_ROWS.length} decided
        </span>
        <div className="ml-auto flex items-center gap-2">
          {store.state === "store" ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" /> Saved to your organization
            </span>
          ) : store.state === "browser" ? (
            <span className="flex items-center gap-1 text-xs text-warning">
              <HardDrive className="h-3.5 w-3.5" /> Saved in this browser only
              <InfoHint
                text={`The record store did not answer: ${store.why}`.slice(
                  0,
                  140,
                )}
              />
            </span>
          ) : null}
          <Button
            icon={copied ? (
              <Check />
            ) : (
              <Copy />
            )}
            variant="outline"
            onClick={() => void copyDecisions()}
          >
            Copy decisions
          </Button>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1 text-xs text-muted-foreground"
        data-testid="decision-legend"
      >
        <span>
          <span className="font-medium text-destructive">Delete:</span> remove
          the page
        </span>
        <span>
          <span className="font-medium text-success">Keep:</span> leave it
        </span>
        <span>
          <span className="font-medium text-warning">Unsure:</span> decide later
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-safe">
        {store.state === "loading" ? (
          <div className="p-4 text-sm text-muted-foreground">
            Reading saved decisions…
          </div>
        ) : sections.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {/* read-gate-exempt: decisions fall back to the browser copy and the store notice says why; sections are filtered local items */}
            No pages match these filters.
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.key}>
              <h2 className="sticky top-0 z-10 border-b border-border bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
              {section.areas.map(({ area, rows }) => (
                <div key={area}>
                  <h3 className="bg-muted/40 px-3 py-1 text-xs font-medium text-foreground">
                    {area}
                  </h3>
                  <ul className="divide-y divide-border">
                    {rows.map((row) => (
                      <CleanupRowView
                        key={row.path}
                        row={row}
                        entry={entries[row.path]}
                        save={saves[row.path]}
                        onDecision={(d) =>
                          change(row.path, { decision: d }, false)
                        }
                        onNotes={(n) => change(row.path, { notes: n }, true)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function CleanupRowView({
  row,
  entry,
  save,
  onDecision,
  onNotes,
}: {
  row: CleanupRow;
  entry: Entry | undefined;
  save: RowSave | undefined;
  onDecision: (d: PageCleanupDecision | null) => void;
  onNotes: (n: string) => void;
}) {
  return (
    <li
      className="grid grid-cols-1 gap-x-3 gap-y-1.5 px-3 py-2 text-sm lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto_minmax(0,14rem)] lg:items-center"
      data-path={row.path}
    >
      <div className="min-w-0">
        {row.href === row.path ? (
          <a
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-primary hover:underline"
          >
            {row.path}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="break-all font-mono text-xs text-foreground">
            {row.path}
          </span>
        )}
        {row.note ? (
          <div className="flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
            <span>{row.note}</span>
            {row.href ? (
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-mono text-primary hover:underline"
              >
                · open {row.href}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 items-start gap-2">
        <Badge variant={REC_VARIANT[row.rec]} className="shrink-0">
          {REC_LABEL[row.rec]}
        </Badge>
        <div className="min-w-0">
          <div className="truncate text-foreground">{row.what}</div>
          {row.target ? (
            <div className="truncate font-mono text-xs text-muted-foreground">
              → {row.target}
            </div>
          ) : null}
          <div
            className="line-clamp-2 text-xs text-muted-foreground"
            title={row.reason}
          >
            {row.reason}
          </div>
          {row.removes ? (
            <div
              className="flex items-center gap-1 text-xs text-foreground/80"
              data-testid="removes"
            >
              <Trash2
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-label="Deleting removes"
              />
              <span className="truncate">{row.removes}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 lg:contents">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={entry?.decision ?? ""}
          onValueChange={(v) =>
            onDecision(v ? (v as PageCleanupDecision) : null)
          }
          aria-label={`Decision for ${row.path}`}
          className="justify-start"
        >
          {PAGE_CLEANUP_DECISIONS.map((d) => (
            <ToggleGroupItem
              key={d}
              value={d}
              className={cn(
                "px-2.5 text-xs",
                d === "yes" &&
                  "data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground",
                d === "no" &&
                  "data-[state=on]:bg-success data-[state=on]:text-success-foreground",
                d === "maybe" &&
                  "data-[state=on]:bg-warning data-[state=on]:text-warning-foreground",
              )}
            >
              {DECISION_LABEL[d]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={entry?.notes ?? ""}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Notes"
            aria-label={`Notes for ${row.path}`}
            className="h-8 w-full rounded-md border border-border bg-background px-2 pr-6 text-base md:text-xs"
          />
          {save === "failed" ? (
            <span
              className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-destructive"
              title="Not saved"
            />
          ) : save === "saving" ? (
            <span className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-pulse rounded-full bg-muted-foreground" />
          ) : null}
        </div>
      </div>
    </li>
  );
}
