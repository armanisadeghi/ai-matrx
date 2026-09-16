"use client";

/**
 * ResourceAttachPicker — choose WHICH things out of a connection ride this chat.
 *
 * Arman, 2026-09-15: "for github, I should be able to select it and then it
 * should let me choose which repo or repos I want to attach to this particular
 * chat and it should then persist but let me add others later."
 *
 * The champions, named before building (law 9):
 *   - **Claude.ai's Google Drive picker** — you connect once, then pick the
 *     exact documents; search is live because Drive is far too large to list,
 *     and the surface SAYS it is searching rather than showing an empty box.
 *   - **Cursor's repository selection** — the repo is chosen deliberately, its
 *     visibility and your permission are on the row, and the choice sticks.
 *
 * ONE picker serves every provider. Which resources exist, what they are
 * called, and whether candidates come from our synced inventory or a live
 * provider search are all answered by the server's `attachable` payload — so a
 * new attachable provider is a server change and no frontend change at all.
 * There is no `if (provider === "github")` in the data path; the single
 * provider-specific branch in this file is the GitHub access door in the empty
 * state, and it exists because GitHub is the one provider whose empty result
 * has a fix the user can perform (install the App on the missing account).
 *
 * THE EMPTY STATE IS NEVER A SHRUG. "No repositories" is three different
 * facts — still loading, nothing matched your search, or we have no access to
 * that account — and each gets its own sentence with its own remedy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GitHubConnectionCard } from "@/features/github-integration/GitHubConnectionCard";
import {
  fetchAttachableResources,
  type AttachableCandidate,
} from "./attachments.service";
import {
  attachmentKey,
  normalizeAttachable,
  type AttachableResource,
  type PendingAttachment,
} from "./attachable-resources";

/** How long a keystroke waits before a live provider search leaves the browser. */
const LIVE_SEARCH_DEBOUNCE_MS = 300;

export interface ResourceAttachPickerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The connection being chosen out of — its catalog slug. */
  provider: string;
  /** Its display name, for every sentence on this surface. */
  providerName: string;
  /** What this connection offers, straight from the availability payload. */
  attachable: readonly AttachableResource[];
  /** Refs already attached, so the list shows them ticked and immovable. */
  alreadyAttachedRefs: readonly string[];
  /** Attach the picks. Resolves when every one has been settled. */
  onAttach: (picks: PendingAttachment[]) => Promise<void> | void;
}

interface LoadState {
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

export function ResourceAttachPicker({
  isOpen,
  onClose,
  provider,
  providerName,
  attachable,
  alreadyAttachedRefs,
  onAttach,
}: ResourceAttachPickerProps) {
  const kinds = normalizeAttachable(attachable);
  const live = kinds.some((kind) => kind.source === "live");
  const nouns = kinds.map((kind) => kind.label.trim()).filter(Boolean);
  const noun = nouns[0] ?? "items";

  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AttachableCandidate[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: "idle", error: null });
  const [selected, setSelected] = useState<Record<string, AttachableCandidate>>({});
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const attached = new Set(alreadyAttachedRefs);

  // Every open is a fresh choice — a stale selection from the last time this
  // dialog was open would attach things the person never looked at.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelected({});
    setCursor(0);
    setSaveError(null);
  }, [isOpen, provider]);

  const runFetch = useCallback(
    (searchText: string, signal: AbortSignal) => {
      setLoad({ status: "loading", error: null });
      fetchAttachableResources({
        provider,
        query: searchText || undefined,
        live,
        limit: 50,
        signal,
      })
        .then((rows) => {
          if (signal.aborted) return;
          setCandidates(rows);
          setLoad({ status: "succeeded", error: null });
          setCursor(0);
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          setCandidates([]);
          setLoad({
            status: "failed",
            // The server's own sentence, verbatim — it was written for a
            // person, and paraphrasing it loses the remedy it carries.
            error:
              error instanceof Error
                ? error.message
                : `We could not read your ${noun}.`,
          });
        });
    },
    [provider, live, noun],
  );

  // An inventory provider is fetched ONCE and filtered in the browser, so
  // typing costs nothing. A live provider re-queries on a debounce, because
  // only the provider can answer what matches.
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    if (!live) {
      runFetch("", controller.signal);
      return () => controller.abort();
    }
    const timer = setTimeout(
      () => runFetch(query, controller.signal),
      query ? LIVE_SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, live, query, runFetch]);

  const matches = live ? candidates : filterCandidates(candidates, query);
  const selectedList = Object.values(selected);

  const toggle = (candidate: AttachableCandidate) => {
    if (attached.has(candidate.resource_ref)) return;
    const key = attachmentKey(candidate);
    setSelected((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = candidate;
      return next;
    });
  };

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && matches[cursor]) {
      event.preventDefault();
      toggle(matches[cursor]);
    }
  };

  const commit = async () => {
    if (selectedList.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onAttach(
        selectedList.map((candidate) => ({
          provider: candidate.provider || provider,
          resource_type: candidate.resource_type,
          display_name: candidate.display_name,
          link: candidate.link,
          resource_ref: candidate.resource_ref,
          metadata: candidate.metadata,
        })),
      );
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : `Those ${noun} could not be attached.`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Choose {joinWithOr(nouns.length ? nouns : [noun])} from {providerName}
          </DialogTitle>
          <DialogDescription>
            What you pick stays attached to this chat — you can add more or
            remove any of them later.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            aria-label={`Search ${providerName} ${noun}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onListKeyDown}
            placeholder={
              live
                ? `Search your ${providerName} ${noun}…`
                : `Search ${noun}…`
            }
            className="h-9 pl-8 text-base sm:text-sm"
          />
        </div>

        {/* A live search MUST announce itself — an input that silently does
            nothing for 300ms then repaints reads as a broken box. */}
        {live && load.status === "loading" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching your {providerName} {noun}…
          </p>
        )}

        <ul
          ref={listRef}
          role="listbox"
          aria-multiselectable
          aria-label={`${providerName} ${noun}`}
          tabIndex={0}
          onKeyDown={onListKeyDown}
          className="max-h-64 overflow-y-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {load.status === "failed" ? (
            <li className="flex items-start gap-1.5 px-3 py-4 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{load.error}</span>
            </li>
          ) : load.status === "loading" && !live ? (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">
              Loading your {noun}…
            </li>
          ) : matches.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">
              {query
                ? `Nothing matched “${query}”.`
                : `No ${noun} yet on your ${providerName} connection.`}
            </li>
          ) : (
            matches.map((candidate, index) => {
              const key = attachmentKey(candidate);
              const isAttached = attached.has(candidate.resource_ref);
              const isSelected = Boolean(selected[key]) || isAttached;
              return (
                <li key={key} role="option" aria-selected={isSelected}>
                  <div
                    className={cn(
                      "flex items-center gap-2 border-b border-border/60 px-2 py-1.5 text-xs last:border-b-0",
                      index === cursor && "bg-accent/60",
                      isSelected && "bg-primary/5",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(candidate)}
                      disabled={isAttached}
                      title={
                        isAttached
                          ? `${candidate.display_name} is already attached to this chat`
                          : `Attach ${candidate.display_name}`
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                    >
                      <span
                        className={cn(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {candidate.display_name}
                      </span>
                      {/* The server writes these words because only it knows
                          what matters about that provider's resources:
                          `private · admin` for a repo, `Spreadsheet · owner`
                          for a Drive file. */}
                      {candidate.detail && (
                        <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                          {isAttached ? `${candidate.detail} · attached` : candidate.detail}
                        </span>
                      )}
                    </button>
                    {candidate.link && (
                      <a
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        href={candidate.link}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${candidate.display_name} at ${providerName}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>

        {/* THE ALWAYS-VISIBLE ACCESS DOOR. An empty or incomplete GitHub list
            almost always means AI Matrx is not installed on the account that
            owns the repository — a gap only the user can close, and the same
            door the GitHub card already owns. Reused, never re-implemented. */}
        {provider === "github" && <GitHubConnectionCard compact />}

        {saveError && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {saveError}
          </p>
        )}

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {selectedList.length > 0
              ? `${selectedList.length} selected`
              : `${matches.length} ${noun}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void commit()}
              disabled={selectedList.length === 0 || saving}
              title={
                selectedList.length === 0
                  ? `Pick at least one of your ${noun} to attach`
                  : undefined
              }
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Attach
              {selectedList.length > 0 ? ` ${selectedList.length}` : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Local search over what the row actually SHOWS — name plus the server's own
 * detail words — so typing "private" or "admin" filters, exactly as the
 * repository picker taught us. A search box that ignores words on screen is a
 * lie.
 */
export function filterCandidates(
  candidates: readonly AttachableCandidate[],
  query: string,
): AttachableCandidate[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...candidates];
  return candidates.filter((candidate) => {
    const haystack = `${candidate.display_name} ${candidate.resource_ref} ${candidate.detail ?? ""}`.toLowerCase();
    return needle.split(/\s+/).every((term) => haystack.includes(term));
  });
}

function joinWithOr(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "items";
  if (words.length === 2) return `${words[0]} or ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, or ${words[words.length - 1]}`;
}
