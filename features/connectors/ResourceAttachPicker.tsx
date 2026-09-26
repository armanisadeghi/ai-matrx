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

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
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
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { GitHubConnectionCard } from "@/features/github-integration/GitHubConnectionCard";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
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
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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

/** One settled answer, tagged with the request it answers. */
interface FetchResult {
  key: string;
  rows: AttachableCandidate[];
  error: string | null;
}

export function ResourceAttachPicker(props: ResourceAttachPickerProps) {
  // Remounting on open (and on a change of provider) is what makes the
  // chooser's state a FRESH CHOICE every time, with no reset effect to forget:
  // a selection left over from the last time this dialog was open would attach
  // things the person never looked at.
  return (
    <ResourceAttachPickerBody
      key={`${props.provider}:${props.isOpen}`}
      {...props}
    />
  );
}

function ResourceAttachPickerBody({
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
  const openItem = useOpenItemPresentation();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [result, setResult] = useState<FetchResult | null>(null);
  const [selected, setSelected] = useState<Record<string, AttachableCandidate>>(
    {},
  );
  const [cursor, setCursor] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const attached = new Set(alreadyAttachedRefs);

  /**
   * The request this render WANTS. An inventory provider asks once and filters
   * in the browser, so typing costs nothing and the key never changes. A live
   * provider re-asks on the debounced text, because only the provider can
   * answer what matches.
   *
   * Loading is DERIVED from this (`result.key !== requestKey`) rather than
   * stored, so there is no second source of truth to fall out of step with the
   * request actually in flight — and nothing sets state synchronously inside an
   * effect to keep them aligned.
   */
  const requestKey = live ? `${provider}|${debouncedQuery}` : provider;

  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(
      () => setDebouncedQuery(query),
      query ? LIVE_SEARCH_DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [live, query]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchAttachableResources({
      provider,
      query: live && debouncedQuery ? debouncedQuery : undefined,
      live,
      limit: 50,
      signal: controller.signal,
    })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, rows, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          rows: [],
          // The server's own sentence, verbatim — it was written for a person,
          // and paraphrasing it loses the remedy it carries.
          error:
            error instanceof Error
              ? error.message
              : `We could not read your ${noun}.`,
        });
      });
    return () => controller.abort();
  }, [isOpen, provider, live, debouncedQuery, requestKey, noun]);

  const settled = result?.key === requestKey ? result : null;
  const loading = settled === null;
  const loadError = settled?.error ?? null;
  const matches = live
    ? (settled?.rows ?? [])
    : filterCandidates(settled?.rows ?? [], query);
  const selectedList = Object.values(selected);
  // Clamped at render rather than corrected by an effect: a shorter result set
  // must never leave the keyboard cursor pointing past the end of the list.
  const activeIndex = Math.min(cursor, Math.max(matches.length - 1, 0));

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
      setCursor(Math.min(activeIndex + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && matches[activeIndex]) {
      event.preventDefault();
      toggle(matches[activeIndex]);
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
    // 🚨 F-73: modal={false} is the platform contract for a dialog that can
    // launch a WindowPanel (the same contract `CmsPageAiActionDialog` and
    // others already carry) — the record-backed row's "Open" control opens
    // the calendar event's own window/detail primitive while THIS picker
    // stays mounted and unfocused-trapped, so the just-opened record is
    // reachable and focusable instead of sitting behind a modal focus trap.
    // Non-modal means nothing here closes the picker to open a record, so the
    // person's in-progress selection is never silently lost.
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      modal={false}
    >
      <DialogContent
        className="max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            Choose {joinWithOr(nouns.length ? nouns : [noun])} from{" "}
            {providerName}
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
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(event.target.value)
            }
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) =>
              onListKeyDown(event)
            }
            placeholder={
              live ? `Search your ${providerName} ${noun}…` : `Search ${noun}…`
            }
            className="h-9 pl-8 text-base sm:text-sm max-sm:min-h-11"
          />
        </div>

        {/* A live search MUST announce itself — an input that silently does
            nothing for 300ms then repaints reads as a broken box. */}
        {live && loading && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching your {providerName} {noun}…
          </p>
        )}

        <ul
          role="listbox"
          aria-multiselectable
          aria-label={`${providerName} ${noun}`}
          tabIndex={0}
          onKeyDown={onListKeyDown}
          className="max-h-64 overflow-y-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {loadError ? (
            <li className="flex items-start gap-1.5 px-3 py-4 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{loadError}</span>
            </li>
          ) : loading && !live ? (
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
                      index === activeIndex && "bg-accent/60",
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
                      className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default max-sm:min-h-11"
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
                          {isAttached
                            ? `${candidate.detail} · attached`
                            : candidate.detail}
                        </span>
                      )}
                    </button>
                    {/* 🚨 A RECORD-BACKED CANDIDATE OPENS AS ITS RECORD, IN
                        PLACE (F-71). `candidate.link` for one of these (a
                        calendar event's `meeting_url`) is where the meeting is
                        HELD, not the record's own screen — the two are
                        different doors and neither one substitutes for the
                        other, so both render when both exist. */}
                    {candidate.record_table && (
                      <button
                        type="button"
                        onClick={() =>
                          openItem(candidate.resource_type, candidate.resource_id, {
                            name: candidate.display_name,
                          })
                        }
                        className="inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded text-muted-foreground hover:text-foreground max-sm:min-h-11 max-sm:min-w-11 sm:flex-row sm:gap-1"
                        aria-label={`Open ${candidate.display_name}`}
                        title={`Open ${candidate.display_name}`}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        {/* Always visible — icon-only doors are told apart
                            only by hover/tint, which fails on a phone with no
                            hover (F-80's standard: distinct without hover at
                            every width). Stacks under the icon below `sm`. */}
                        <span className="text-[10px] leading-none sm:text-xs">
                          Open
                        </span>
                      </button>
                    )}
                    {candidate.link && (
                      <a
                        className={cn(
                          "inline-flex shrink-0 flex-col items-center justify-center gap-0.5 rounded max-sm:min-h-11 max-sm:min-w-11 sm:flex-row sm:gap-1",
                          candidate.record_table
                            ? "text-primary hover:underline"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        href={candidate.link}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={
                          candidate.record_table
                            ? `Join ${candidate.display_name}`
                            : `Open ${candidate.display_name} at ${providerName}`
                        }
                        title={candidate.record_table ? "Join the meeting" : undefined}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {/* Always visible, same reasoning as the "Open" door
                            above — the two doors must stay distinguishable
                            without hover at phone width. */}
                        <span className="text-[10px] leading-none sm:text-xs">
                          {candidate.record_table ? "Join" : "Open"}
                        </span>
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

        {/* 🚨 A RECORD CANNOT BE HAND-PICKED — NEVER A PICKER BUTTON FOR ONE
            (F-71). A synced calendar event is not something the Google Picker
            can put in this list; the kind's own `add_more` sentence (the same
            door `attachable_resource_kinds.json` declares for it — refresh
            your agenda) is the whole remedy, said as a sentence, never as a
            clickable "Choose…" affordance a meeting cannot answer to. */}
        {recordKindAddMoreSentences(kinds).map((sentence) => (
          <p
            key={sentence}
            className="text-[11px] leading-tight text-muted-foreground"
          >
            {sentence}
          </p>
        ))}

        {saveError && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {saveError}
            <ErrorAlchemyMenu error={saveError} />
          </p>
        )}

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {selectedList.length > 0
              ? `${selectedList.length} selected`
              : `${matches.length} ${noun}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
              className="max-sm:min-h-11"
            >
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
              className="max-sm:min-h-11"
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
    const haystack =
      `${candidate.display_name} ${candidate.resource_ref} ${candidate.detail ?? ""}`.toLowerCase();
    return needle.split(/\s+/).every((term) => haystack.includes(term));
  });
}

function joinWithOr(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "items";
  if (words.length === 2) return `${words[0]} or ${words[1]}`;
  return `${words.slice(0, -1).join(", ")}, or ${words[words.length - 1]}`;
}

/**
 * The `add_more` sentence for every Record-backed KIND the picker is offering,
 * de-duplicated. A kind is Record-backed when the KIND ROW ITSELF carries
 * `record_table` (F-62's server declaration, `AttachableKind.record_table`) —
 * never derived from a VISIBLE candidate carrying it (F-73): an empty list, or
 * a search filter that hides every calendar event, must never hide the
 * remedy sentence the person needs most right then. Never a hand list of
 * resource types here, so a future Record-backed kind is picked up for free
 * the day the server starts declaring it.
 */
function recordKindAddMoreSentences(
  kinds: readonly AttachableResource[],
): string[] {
  const sentences: string[] = [];
  for (const kind of kinds) {
    if (!kind.record_table) continue;
    const sentence = kind.add_more?.trim();
    if (sentence && !sentences.includes(sentence)) sentences.push(sentence);
  }
  return sentences;
}
