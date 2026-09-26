"use client";

// features/exports/components/SendToRulebookDialog.tsx
//
// THE ACTION. Selected items → a Masterwork Rulebook, as Sources.
//
// This dialog IS the confirmation the destructive-and-expensive-click law asks
// for, which is why the bulk action declares no `confirm` of its own: a generic
// "Are you sure?" in front of this would be a second stop that names less. It
// states the three facts the person is agreeing to — how many, which Rulebook,
// and that an AI model will read the text — in ONE sentence, and posts that
// exact sentence as the consent record.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Loader2,
  Plus,
  Search,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@ai-matrx/data/net";
import { sendExportItemsToRulebook } from "../api";
import { buildConfirmedSentence } from "../consent";
import { listRulebookChoices, rulebookHref, type RulebookChoice } from "../rulebooks";
import type { ExportItemFilter } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** One pending "send these" request, captured when the bulk button was pressed. */
export interface PendingSend {
  /**
   * A new number per request. The page keys this dialog on it, so every send
   * starts from a clean mount — no effect resetting six pieces of state, and
   * therefore no cascading re-render on open (react-hooks/set-state-in-effect).
   */
  requestId: number;
  count: number;
  /** "matching" = the person meant every item the filter matches, not a page. */
  mode: "ids" | "matching";
  ids: string[];
  filter: ExportItemFilter;
  /** The server's own sentence for the filter, when it has given one. */
  filterDescription: string;
}

export interface SendToRulebookDialogProps {
  libraryId: string;
  libraryName: string;
  pending: PendingSend | null;
  /** Called when the person backs out — the bulk action resolves with nothing. */
  onCancel: () => void;
  /** Called when the SUCCESS panel is dismissed. The action already settled. */
  onDismiss: () => void;
  /** Called the moment the server accepted, with the sentence it stored. */
  onSent: (result: { sent: number; rulebookId: string; rulebookName: string }) => void;
}

export function SendToRulebookDialog({
  libraryId,
  libraryName,
  pending,
  onCancel,
  onDismiss,
  onSent,
}: SendToRulebookDialogProps) {
  const open = pending !== null;
  const [rulebooks, setRulebooks] = useState<RulebookChoice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ sent: number; rulebookId: string } | null>(null);

  // THE RESET IS A REMOUNT, NOT AN EFFECT. `SendToRulebookDialog` mounts this
  // body only while a send is pending and keys it to that request, so every
  // piece of state here starts clean without a single synchronous setState in
  // an effect (which is what makes the whole thing re-render in cascades).
  useEffect(() => {
    let cancelled = false;
    listRulebookChoices()
      .then((rows) => {
        if (cancelled) return;
        setRulebooks(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(extractErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!rulebooks) return [];
    if (!needle) return rulebooks;
    return rulebooks.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }, [rulebooks, search]);

  const selected = rulebooks?.find((r) => r.id === selectedId) ?? null;

  // The sentence is built from what is on screen right now, so what the person
  // reads and what the server stores cannot differ by a word.
  const sentence =
    pending && selected
      ? buildConfirmedSentence({
          count: pending.count,
          everythingMatching: pending.mode === "matching",
          filterDescription: pending.filterDescription,
          libraryName,
          rulebookName: selected.name,
        })
      : null;

  const submit = useCallback(async () => {
    if (!pending || !selected || !sentence) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await sendExportItemsToRulebook({
        libraryId,
        rulebookId: selected.id,
        confirmedSentence: sentence,
        // 🚨 THE WHOLE POINT: when the person chose "everything matching",
        // the FILTER travels, not 50,000 ids.
        ...(pending.mode === "matching"
          ? { filter: pending.filter }
          : { itemIds: pending.ids }),
      });
      setSent({ sent: result.sent, rulebookId: result.rulebook_id });
      onSent({
        sent: result.sent,
        rulebookId: result.rulebook_id,
        rulebookName: selected.name,
      });
    } catch (error: unknown) {
      setSendError(extractErrorMessage(error));
    } finally {
      setSending(false);
    }
  }, [pending, selected, sentence, libraryId, onSent]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (sending) return;
        // Closing after a successful send must not re-resolve the bulk action:
        // `onSent` already did, the moment the server accepted.
        if (sent) {
          setSent(null);
          onDismiss();
          return;
        }
        onCancel();
      }}
    >
      <DialogContent className="matrx-touch-targets flex max-h-[90dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-base">
            {sent ? "Sent" : "Send to a Masterwork Rulebook"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {sent
              ? "These items are now Sources on that Rulebook."
              : "Selected items become Sources on the Rulebook you choose."}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col gap-4 px-5 py-6">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
              </span>
              <span>
                <strong className="tabular-nums">{sent.sent.toLocaleString()}</strong>{" "}
                {sent.sent === 1 ? "item" : "items"} added to{" "}
                <strong>{selected?.name ?? "the Rulebook"}</strong>.
              </span>
            </div>
            <Button asChild className="w-full sm:w-auto sm:self-start">
              <Link href={rulebookHref(sent.rulebookId)}>
                Open the Rulebook
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Find a Rulebook"
                  className="h-11 pl-9 text-base lg:h-9 lg:text-sm"
                  aria-label="Find a Rulebook"
                />
              </div>

              {loadError && (
                <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Your Rulebooks could not be read: {loadError}</span>
                  <ErrorAlchemyMenu error={loadError} />
                </p>
              )}

              {!rulebooks && !loadError && (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}

              {rulebooks && visible.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
                  <p className="text-sm font-medium">
                    {rulebooks.length === 0
                      ? "You have no Rulebooks yet"
                      : "No Rulebook matches that"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A Rulebook is where this knowledge goes. Start one, then come
                    back to this selection.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/masterwork/new">
                      <Plus className="h-4 w-4" />
                      Start a Rulebook
                    </Link>
                  </Button>
                </div>
              )}

              {rulebooks && visible.length > 0 && (
                <div role="radiogroup" aria-label="Rulebook" className="space-y-1.5">
                  {visible.map((rulebook) => {
                    const active = rulebook.id === selectedId;
                    return (
                      <button
                        key={rulebook.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSelectedId(rulebook.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {active && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {rulebook.name}
                            </span>
                            {rulebook.status && (
                              <Badge
                                variant="outline"
                                className="shrink-0 py-0 text-[10px] capitalize"
                              >
                                {rulebook.status}
                              </Badge>
                            )}
                          </span>
                          {rulebook.description && (
                            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                              {rulebook.description}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                  >
                    <Link href="/masterwork/new">
                      <Plus className="h-4 w-4" />
                      Start a new Rulebook instead
                    </Link>
                  </Button>
                </div>
              )}

              {sentence && (
                <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    What you are confirming
                  </p>
                  {/* Rendered verbatim, and posted verbatim. */}
                  <p className="mt-1 text-sm leading-relaxed">{sentence}</p>
                </div>
              )}

              {sendError && (
                <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{sendError}</span>
                </p>
              )}
            </div>

            <DialogFooter className="shrink-0 gap-2 border-t border-border px-5 py-3 pb-safe">
              <Button variant="outline" onClick={onCancel} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!selected || sending}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Sending" : "Send as Sources"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
