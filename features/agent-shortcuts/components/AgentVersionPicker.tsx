"use client";

/**
 * AgentVersionPicker
 *
 * User-friendly picker for the "pinned agent version" side of a shortcut.
 *
 * Design principles (from the user's feedback):
 *
 *   1. UUIDs are never the *primary* UI. The user identifies versions by
 *      number + change note, not by `agx_version.id`. We surface UUIDs only
 *      as small, read-only, copy-to-clipboard chips for debugging.
 *
 *   2. The default for a shortcut is "pin to the current version". A silent
 *      upgrade of the agent would otherwise break the shortcut. The user can
 *      opt into "always use the latest version" but that is not the default.
 *
 *   3. The "always latest" switch toggles the version dropdown and the
 *      version UUID chip to a disabled/cleared state — but we never unmount
 *      them. That keeps the layout stable.
 *
 *   4. Fast path: if the caller already knows the current version id (for
 *      example, from a create flow invoked right after reading the live
 *      agent) they can pass `initialCurrentVersionId`. Otherwise we fetch
 *      the version history from Supabase via the existing
 *      `fetchAgentVersionHistory` thunk and auto-pin to the newest entry.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, ChevronDown, Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentVersionHistory,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { CopyableUuid } from "./CopyableUuid";

interface AgentVersionPickerProps {
  /**
   * Live-agent UUID this pin is about.
   *
   * 🚨 NON-NULLABLE, DELIBERATELY (Arman, 2026-08-31; VISION-RECONCILIATION B6):
   * *"that question may only be asked AFTER an intelligence is selected."* The
   * version question is meaningless without an agent, so the caller gates the
   * whole block instead of mounting this with `null` and letting it print
   * empty-case copy. The type is what stops that state coming back — every call
   * site (`ScopeHolderBar`, `ShortcutForm`, `ShortcutQuickCreateBody`) renders
   * this only once an agent is chosen.
   */
  agentId: string;
  /** The currently pinned version id, or null when `useLatest` is true. */
  agentVersionId: string | null;
  /** When true, the shortcut follows the agent's live version at runtime. */
  useLatest: boolean;
  /** Persist a new pinned version id. Called with `null` when we enter "always latest" mode. */
  onAgentVersionIdChange: (next: string | null) => void;
  /** Persist the "always latest" toggle. */
  onUseLatestChange: (next: boolean) => void;
  /** Disable all inputs (form is saving, etc.). */
  disabled?: boolean;
  /**
   * Short-circuit the Supabase fetch: if the caller already knows the
   * live agent's current version id, pass it here to skip the network hop.
   * The picker still fetches history in the background so the dropdown
   * can show *all* versions, but it will auto-pin to this value first.
   */
  initialCurrentVersionId?: string | null;
  /**
   * 🚨 WHAT THIS PICKER IS PINNING, in the reader's words.
   *
   * This component was written for shortcuts and says "shortcut" in its copy.
   * It is now also the version cell of the one binding UI, where a mandate
   * author was told "pin the shortcut … can't break this shortcut" about a
   * JOB — copy from another feature leaking onto a flagship screen (found by
   * Arman, 2026-08-31). The noun is a prop; the default keeps every shortcut
   * call site reading exactly as it always has.
   */
  subjectNoun?: string;
  /**
   * 🚨 FOLD THE VERSION BLOCK TO ONE LINE UNTIL IT IS ASKED FOR (V2 finding
   * G3, round 2, 2026-08-31).
   *
   * This block is four stacked pieces — agent header, "Pin to version" select,
   * the pinned-version line with its uuid chip, and the always-latest switch
   * with its two-sentence explanation. That is ~230px of REFERENCE DETAIL, and
   * on the one binding UI's scope bar it set the height of a three-cell grid
   * row whose other two cells then measured 64-71% empty. Two adversarial
   * rounds named that dead space, and the previous wave "fixed" it by changing
   * the column widths — which cannot touch a height.
   *
   * Version pinning is a decision a person makes once and then reads, so
   * folded it states its own answer in one line ("Follows the latest version" /
   * "Pinned to v7 · Mar 4, 2026") and expands to the identical controls. The
   * default is `false`, so the shortcut editor — where this block is the point
   * of the panel, not a footnote in someone else's row — is untouched.
   *
   * The agent header is omitted while collapsible, because the ONE call site
   * that folds already prints the holder's name and id directly above: two
   * copies of an identity in one cell is the noise, not the fold.
   */
  collapsible?: boolean;
}

function formatChangedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function AgentVersionPicker({
  agentId,
  agentVersionId,
  useLatest,
  onAgentVersionIdChange,
  onUseLatestChange,
  disabled,
  initialCurrentVersionId,
  subjectNoun = "shortcut",
  collapsible = false,
}: AgentVersionPickerProps) {
  const dispatch = useAppDispatch();

  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const liveVersionNumber = agent?.version ?? null;

  // Folded by default WHEN foldable; a non-collapsible call site is always
  // "expanded" and never renders a trigger, so its markup is byte-identical to
  // what it has always been.
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<AgentVersionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Remember which agents we've already fetched history for so that switching
  // between create/edit doesn't thrash the network.
  const fetchedForAgent = useRef<string | null>(null);
  // Track whether we've done the initial auto-pin so we don't overwrite the
  // user's choice on re-renders.
  const autoPinnedForAgent = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedForAgent.current === agentId) return;

    fetchedForAgent.current = agentId;
    setLoading(true);
    setFetchError(null);

    dispatch(fetchAgentVersionHistory({ agentId, limit: 50, offset: 0 }))
      .unwrap()
      .then((items) => {
        const sorted = [...items].sort(
          (a, b) => b.version_number - a.version_number,
        );
        setVersions(sorted);
      })
      .catch((err) => {
        setFetchError(
          err instanceof Error ? err.message : "Failed to load versions",
        );
      })
      .finally(() => setLoading(false));
  }, [agentId, dispatch]);

  // Auto-pin to the current version for new shortcuts.
  //
  // A "new" shortcut lands here with `useLatest: false` and
  // `agentVersionId: null`. As soon as we know either (a) a hint from the
  // caller or (b) the newest entry from the history fetch, we commit that id
  // upward so the form state matches the UI (dropdown shows the right entry
  // and the DB write is already correct).
  useEffect(() => {
    if (disabled) return;
    if (useLatest) return;
    if (agentVersionId) return;
    if (autoPinnedForAgent.current === agentId) return;

    const hint = initialCurrentVersionId ?? null;
    if (hint) {
      autoPinnedForAgent.current = agentId;
      onAgentVersionIdChange(hint);
      return;
    }

    if (versions.length > 0) {
      autoPinnedForAgent.current = agentId;
      onAgentVersionIdChange(versions[0].version_id);
    }
  }, [
    agentId,
    disabled,
    useLatest,
    agentVersionId,
    initialCurrentVersionId,
    versions,
    onAgentVersionIdChange,
  ]);

  // Figure out which version the user is currently looking at so we can
  // label it nicely ("v3 (current)") and show its UUID chip.
  const selectedVersion = useMemo(() => {
    if (!agentVersionId) return null;
    return versions.find((v) => v.version_id === agentVersionId) ?? null;
  }, [agentVersionId, versions]);

  // When `useLatest` is on we clear the dropdown's selected value but keep
  // the element mounted so the surrounding layout does not shift.
  const selectValue = useLatest ? "" : (agentVersionId ?? "");

  const handleSelectChange = (next: string) => {
    onAgentVersionIdChange(next);
  };

  const handleUseLatestToggle = (next: boolean) => {
    onUseLatestChange(next);
    if (next) {
      // Clear the pinned id — but intentionally don't remove any DOM nodes.
      onAgentVersionIdChange(null);
    } else if (versions.length > 0) {
      // Re-pin to the newest version so the UI isn't left empty.
      onAgentVersionIdChange(versions[0].version_id);
    }
  };

  /**
   * THE FOLD'S OWN SENTENCE. A collapsed control must answer the question it
   * hides, or it is just a thing to click: every state — latest, pinned, still
   * reading — has a word here, and none of them is silence. "Nothing chosen"
   * is no longer among them: this control is not mounted before an agent is.
   */
  const pinSummary = useLatest
    ? "Follows the latest version"
    : selectedVersion
      ? `Pinned to v${selectedVersion.version_number}${
          formatChangedAt(selectedVersion.changed_at)
            ? ` · ${formatChangedAt(selectedVersion.changed_at)}`
            : ""
        }`
      : loading
        ? "Reading this agent's versions…"
        : "No version pinned";

  if (collapsible && !expanded) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-accent/40"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
          Version
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">
          {pinSummary}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {collapsible ? (
        <button
          type="button"
          aria-expanded
          onClick={() => setExpanded(false)}
          className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:bg-accent/40"
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            Version
          </span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">
            {pinSummary}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 rotate-180 text-muted-foreground" />
        </button>
      ) : null}
      {/* ── Agent header: NAME is prominent, UUID is a small chip ─────── */}
      {/* Omitted when folded into another cell that already names the agent —
          see the `collapsible` prop note. */}
      <div
        className="flex items-start justify-between gap-3"
        hidden={collapsible}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">
            Agent
          </div>
          <div className="text-base font-semibold text-foreground truncate mt-0.5">
            {agent?.name ?? (
              <span className="italic text-muted-foreground">
                No agent selected
              </span>
            )}
          </div>
          {agent?.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
              {agent.description}
            </p>
          )}
        </div>
        <div className="shrink-0 pt-0.5">
          <CopyableUuid value={agentId} label="id" />
        </div>
      </div>

      {/* ── Version dropdown (always mounted; disabled when useLatest) ─ */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="agent-version-pick" className="text-xs">
            Pin to version
          </Label>
          {loading && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading versions…
            </span>
          )}
        </div>

        <Select
          value={selectValue || undefined}
          onValueChange={handleSelectChange}
          disabled={disabled || useLatest}
        >
          <SelectTrigger
            id="agent-version-pick"
            className={cn("h-9", useLatest && "opacity-60")}
          >
            <SelectValue
              placeholder={loading ? "Loading versions…" : "Choose a version"}
            />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => {
              const isCurrent = v.version_number === liveVersionNumber;
              const changedDate = formatChangedAt(v.changed_at);
              return (
                <SelectItem key={v.version_id} value={v.version_id}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">v{v.version_number}</span>
                    {isCurrent && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-emerald-500 font-semibold">
                        current
                      </span>
                    )}
                    {changedDate && (
                      <span className="text-[11px] text-muted-foreground">
                        · {changedDate}
                      </span>
                    )}
                    {v.change_note && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                        · {v.change_note}
                      </span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
            {versions.length === 0 && !loading && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No versions recorded yet.
              </div>
            )}
          </SelectContent>
        </Select>

        {/* Tiny UUID of the currently pinned version — kept mounted so
            switching "always latest" on/off doesn't shift the layout. */}
        <div className="flex items-center justify-between gap-2 min-h-[20px]">
          <span className="text-[10px] text-muted-foreground/80">
            {useLatest ? (
              <span className="italic">Version will resolve at runtime.</span>
            ) : selectedVersion ? (
              <>
                Pinned to{" "}
                <span className="font-semibold">
                  v{selectedVersion.version_number}
                </span>
                {formatChangedAt(selectedVersion.changed_at) && (
                  <> · {formatChangedAt(selectedVersion.changed_at)}</>
                )}
              </>
            ) : (
              <span className="italic text-muted-foreground/60">
                No version pinned.
              </span>
            )}
          </span>
          <CopyableUuid
            value={useLatest ? null : agentVersionId}
            label="version id"
          />
        </div>
      </div>

      {/* ── Always-latest switch ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-3 py-2 border border-border rounded-md bg-muted/30">
        <div className="min-w-0 flex-1">
          <Label
            htmlFor="use-latest"
            className="text-xs font-normal cursor-pointer inline-flex items-center gap-1.5"
          >
            <Zap className="h-3 w-3 text-muted-foreground" />
            Always use the latest agent version
          </Label>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Off (recommended): pin {subjectNoun === "shortcut" ? "the" : "this"}{" "}
            {subjectNoun} to the version shown above, so future edits to the
            agent can&apos;t break it. On: {subjectNoun === "shortcut" ? "the" : "this"}{" "}
            {subjectNoun} follows the live agent at runtime.
          </p>
        </div>
        <Switch
          id="use-latest"
          checked={useLatest}
          onCheckedChange={handleUseLatestToggle}
          disabled={disabled}
        />
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-destructive/40 bg-destructive/5">
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-[11px] text-destructive">{fetchError}</span>
        </div>
      )}
    </div>
  );
}
