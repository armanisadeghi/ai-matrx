"use client";

/**
 * The decision board. Layout rules it holds itself to (it is the page that
 * judges the design system, so it may not carry the disease it is judging):
 * - ONE surface level: sections are separated by hairlines, never boxed; an
 *   option is a radio row, never a card inside a card.
 * - Phone gutters are 12px, desktop 24px; nothing else pads the sides.
 * - Choosing is the RadioGroup primitive (pick-one-of-N is what it is for);
 *   header actions are tap-target buttons; no raw styled <button>.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { Input } from "@ai-matrx/design-system";
import { TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import {
  CopyTapButton,
  DownloadTapButton,
} from "@ai-matrx/design-system/tap-target/buttons";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { AGREED, DECISIONS, type Decision, type DecisionStatus } from "./decisions";
import { downloadFile } from "@ai-matrx/kit/download";

const STORAGE_KEY = "ui-unification-decisions-round2";

export interface DecisionState {
  winner?: string;
  note?: string;
}
export type Picks = Record<string, DecisionState>;

/** Picks an earlier version of this board kept in the browser; imported once, then cleared. */
function readLegacyPicks(): Picks {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Picks) : {};
  } catch {
    return {};
  }
}

function clearLegacyPicks() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked; nothing to clear.
  }
}

function toMarkdown(picks: Picks): string {
  const lines: string[] = [
    "# UI unification decisions — round 2",
    "",
    `Exported ${new Date().toISOString().slice(0, 10)}`,
    "",
    "## Agreed in round 1",
    ...AGREED.map((a) => `- ${a.id}: ${a.text}`),
    "",
  ];
  for (const d of DECISIONS) {
    const state = picks[d.id] ?? {};
    const winner = d.options.find((o) => o.id === state.winner);
    lines.push(`## ${d.id} · ${d.title} (${STATUS_LABEL[d.status]})`);
    if (d.round1) lines.push(`- Round 1 (you): ${d.round1}`);
    if (d.mine) lines.push(`- Recommendation: ${d.mine}`);
    lines.push(
      `- Winner: ${winner ? `${winner.id}) ${winner.label}${winner.stat ? ` (${winner.stat})` : ""}` : "undecided"}`,
    );
    if (state.note?.trim()) lines.push(`- Note: ${state.note.trim()}`);
    lines.push("- Options:");
    for (const o of d.options) {
      lines.push(`  - ${o.id}) ${o.label}${o.stat ? ` — ${o.stat}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
  open: "Open",
  combined: "Combine",
  rule: "Rule",
  new: "New",
};

const STATUS_CLASS: Record<DecisionStatus, string> = {
  open: "border-warning/60 bg-warning/15 text-foreground",
  combined: "border-primary/40 bg-primary/10 text-primary-ink",
  rule: "border-success/40 bg-success/10 text-success-ink",
  new: "border-border bg-muted text-muted-foreground",
};

function DecisionSection({
  decision,
  state,
  onPick,
  onNote,
}: {
  decision: Decision;
  state: DecisionState;
  onPick: (optionId: string | undefined) => void;
  onNote: (note: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || Boolean(state.note);

  return (
    <section
      id={decision.id}
      className="scroll-mt-24 border-b border-border px-3 py-5 sm:px-6"
    >
      <header className="mb-3 flex items-start gap-2">
        <span className="pt-0.5 font-mono text-xs text-muted-foreground">
          {decision.id}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {decision.title}
            <span
              className={cn(
                "inline-flex h-[1.125rem] items-center rounded-md border px-1.5 text-[0.6875rem] font-medium",
                STATUS_CLASS[decision.status],
              )}
            >
              {STATUS_LABEL[decision.status]}
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{decision.question}</p>
          {(decision.round1 || decision.mine) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {decision.round1 && (
                <>
                  You: <span className="text-foreground">{decision.round1}</span>
                </>
              )}
              {decision.round1 && decision.mine && " · "}
              {decision.mine && (
                <>
                  Me: <span className="text-foreground">{decision.mine}</span>
                </>
              )}
            </p>
          )}
        </div>
        {state.winner ? (
          <Button variant="quiet" onClick={() => onPick(undefined)}>
            Clear
          </Button>
        ) : (
          !showNote && (
            <Button variant="quiet" onClick={() => setNoteOpen(true)}>
              Note
            </Button>
          )
        )}
      </header>

      <RadioGroup
        value={state.winner ?? ""}
        onValueChange={(value) => onPick(value)}
        aria-label={decision.title}
        className={cn(
          "grid gap-x-6 gap-y-1",
          !decision.wide && "lg:grid-cols-2",
        )}
      >
        {decision.options.map((option) => {
          const picked = state.winner === option.id;
          const inputId = `${decision.id}-${option.id}`;
          const { Specimen } = option;
          return (
            <div
              key={option.id}
              className={cn(
                "-mx-2 min-w-0 rounded-md px-2 py-2 transition-colors",
                picked && "bg-primary/5",
              )}
            >
              <label
                htmlFor={inputId}
                className="flex min-h-9 cursor-pointer items-center gap-2.5"
              >
                <RadioGroupItem value={option.id} id={inputId} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    picked ? "font-semibold text-foreground" : "text-foreground",
                  )}
                >
                  {option.label}
                </span>
                {option.stat && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {option.stat}
                  </span>
                )}
              </label>
              <div className="min-w-0 overflow-x-auto pb-1 sm:pl-6">
                <Specimen />
              </div>
            </div>
          );
        })}
      </RadioGroup>

      {showNote && (
        <Input
          value={state.note ?? ""}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Note"
          aria-label={`${decision.id} note`}
          className="mt-3"
        />
      )}
    </section>
  );
}

export function DecisionBoard() {
  const userId = useAppSelector(selectUserId);
  // org-filter: server-call the picks table lives in the one organization the person works in
  const active = useOrganizationRequired();
  if (!userId || active.organizationState !== "ready" || !active.organizationId) {
    return (
      <OrganizationContextNotice
        state={userId ? active.organizationState : "resolving"}
        what="The decision board"
      />
    );
  }
  return <ConnectedBoard organizationId={active.organizationId} userId={userId} />;
}

/** One saved pick, as `ui.decision_pick` holds it (graduated from the typed table `ui_decision_picks`). */
interface PickRow {
  id: string;
  decision_id: string;
  winner: string | null;
  note: string | null;
}

function ConnectedBoard({ organizationId, userId }: { organizationId: string; userId: string }) {
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const imported = useRef(false);
  const table = () => supabase.schema("ui").from("decision_pick");

  const load = useCallback(async () => {
    const { data, error } = await table()
      .select("id, decision_id, winner, note")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (error) setLoadError(error.message);
    else {
      setLoadError(null);
      setRows((data ?? []) as PickRow[]);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const picks: Picks = {};
  for (const r of rows) {
    picks[r.decision_id] = { winner: r.winner ?? undefined, note: r.note ?? undefined };
  }

  const upsert = async (value: { decision_id: string; winner: string | null; note: string | null }) => {
    const existing = rows.find((r) => r.decision_id === value.decision_id);
    const { error } = existing
      ? await table().update({ winner: value.winner, note: value.note, updated_by: userId }).eq("id", existing.id)
      : await table().insert({ ...value, organization_id: organizationId, created_by: userId, updated_by: userId });
    if (error) return { ok: false as const, error };
    await load();
    return { ok: true as const };
  };

  const save = async (id: string, next: DecisionState) => {
    const written = await upsert({
      decision_id: id,
      winner: next.winner ?? null,
      note: next.note ?? null,
    });
    setWriteError(written.ok ? null : written.error.message);
  };

  // One-time import of picks an earlier version kept in localStorage; cleared only once saved.
  useEffect(() => {
    if (imported.current || loading || loadError) return;
    imported.current = true;
    const legacy = Object.entries(readLegacyPicks());
    if (legacy.length === 0) return;
    void (async () => {
      for (const [id, st] of legacy) {
        if (rows.some((r) => r.decision_id === id)) continue;
        const written = await upsert({
          decision_id: id,
          winner: st.winner ?? null,
          note: st.note ?? null,
        });
        if (!written.ok) {
          setWriteError(`Could not import your earlier picks: ${written.error.message}`);
          return;
        }
      }
      clearLegacyPicks();
    })();
  }, [loading, loadError, rows]);

  return (
    <DecisionBoardView
      picks={picks}
      loading={loading && rows.length === 0}
      error={loadError ?? writeError}
      onChange={(id, patch) => void save(id, patch(picks[id] ?? {}))}
    />
  );
}

export function DecisionBoardView({
  picks,
  loading,
  error,
  onChange,
}: {
  picks: Picks;
  loading: boolean;
  error: string | null;
  onChange: (id: string, patch: (prev: DecisionState) => DecisionState) => void;
}) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const update = onChange;

  const decidedCount = DECISIONS.filter((d) => picks[d.id]?.winner).length;

  const copy = async () => {
    await copyText(toMarkdown(picks), "Decisions copied", "Clipboard blocked — use Download");
  };

  const download = () => {
    try {
      const blob = new Blob([toMarkdown(picks)], { type: "text/markdown" });
      downloadFile("ui-unification-decisions.md", blob, blob.type);
      toast.success("Downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="h-full w-full overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 pt-1 sm:px-6">
          <h1 className="text-sm font-semibold text-foreground">
            UI unification
          </h1>
          <span className="font-mono text-xs text-muted-foreground">
            {decidedCount} of {DECISIONS.length} decided
          </span>
          <div className="ml-auto">
            <TapTargetButtonGroup>
              <CopyTapButton
                variant="group"
                ariaLabel="Copy decisions"
                onClick={copy}
              />
              <DownloadTapButton
                variant="group"
                ariaLabel="Download .md"
                onClick={download}
              />
            </TapTargetButtonGroup>
          </div>
        </div>
        <nav
          aria-label="Decisions"
          className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-1.5 sm:px-6"
        >
          {DECISIONS.map((d) => (
            <Button
              key={d.id}
              variant={picks[d.id]?.winner ? "outline" : "quiet"}
              onClick={() => jump(d.id)}
            >
              {d.id}
            </Button>
          ))}
        </nav>
      </div>

      <main className="mx-auto max-w-5xl">
        {loading && (
          <p className="px-3 py-2 text-xs text-muted-foreground sm:px-6" role="status">
            Loading your picks…
          </p>
        )}
        {error && (
          <p className="px-3 py-2 text-xs text-destructive sm:px-6" role="alert">
            {error}
          </p>
        )}
        <section
          id="agreed"
          className="border-b border-border px-3 py-4 sm:px-6"
        >
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Agreed in round 1
          </h2>
          <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {AGREED.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="w-8 shrink-0 font-mono text-muted-foreground">{a.id}</span>
                <span className="text-foreground">{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
        {DECISIONS.map((d) => (
          <DecisionSection
            key={d.id}
            decision={d}
            state={picks[d.id] ?? {}}
            onPick={(optionId) =>
              update(d.id, (prev) => ({ ...prev, winner: optionId }))
            }
            onNote={(note) => update(d.id, (prev) => ({ ...prev, note }))}
          />
        ))}
      </main>
    </div>
  );
}
