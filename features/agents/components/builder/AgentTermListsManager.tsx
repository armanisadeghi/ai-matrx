"use client";

import { isSyntheticAgentId } from "@ai-matrx/chat/agents/redux/agent-definition/synthetic-id";
import { UnsavedAgentAttachmentRow } from "./UnsavedAgentAttachmentRow";
import { useEffect, useState } from "react";
import { BookA, Check, ExternalLink, Loader2, Plus, X } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { toast } from "@/lib/toast";
import {
  attachTermList,
  detachTermList,
  listAttachedTermLists,
  listTermLists,
  type AttachedTermList,
} from "@/features/agents/term-lists/service";
import type { TermList } from "@/features/agents/term-lists/types";
import { ReadFailure } from "@ai-matrx/design-system";

const EDITOR_HREF = "/resources/term-lists";

/**
 * The builder's "Term lists" row: the concrete lists attached to this agent
 * (an association edge, role `term_list`), add more later, remove any. The
 * server places each list where the model's vendor wants it on every run.
 */
export function AgentTermListsManager({ agentId }: { agentId: string }) {
  if (isSyntheticAgentId(agentId)) return <UnsavedAgentAttachmentRow label="Term lists" />;
  return <SavedAgentTermListsManager agentId={agentId} />;
}

function SavedAgentTermListsManager({ agentId }: { agentId: string }) {
  // `loading` is DERIVED, never a separate flag the effect sets synchronously:
  // it's "the fetch for this agentId hasn't landed yet", read straight off
  // whether `fetched.agentId` still matches the current prop. That is what
  // lets the effect below call setState only from inside its async callbacks
  // (a real external event — the response arriving), never from its own body.
  const [fetched, setFetched] = useState<{ agentId: string; attached: AttachedTermList[]; error: unknown }>({
    agentId: "",
    attached: [],
    error: null,
  });
  const loading = fetched.agentId !== agentId;
  const attached = loading ? [] : fetched.attached;
  // The read's failure, said in the row itself — never an empty row that
  // reads as "no term lists attached".
  const loadError = loading ? null : fetched.error;

  const reload = async () => {
    try {
      setFetched({ agentId, attached: await listAttachedTermLists(agentId), error: null });
    } catch (e) {
      setFetched((cur) => ({ ...cur, agentId, error: e }));
    }
  };

  // Fetches on mount and whenever the agent changes; `reload()` above is
  // reused from the "attach" handler below (an event, not an effect). The
  // effect body only subscribes to that external fetch and guards it against
  // a stale response landing after `agentId` moves on.
  useEffect(() => {
    let active = true;
    void listAttachedTermLists(agentId)
      .then((rows) => {
        if (active) setFetched({ agentId, attached: rows, error: null });
      })
      .catch((e: unknown) => {
        if (active) setFetched({ agentId, attached: [], error: e });
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  const detach = async (item: AttachedTermList) => {
    try {
      await detachTermList(agentId, item.termListId);
      setFetched((cur) => ({ ...cur, attached: cur.attached.filter((a) => a.termListId !== item.termListId) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the term list");
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="agent-term-lists-row">
      <Label className="shrink-0 text-xs text-muted-foreground">Term lists</Label>
      <ScrollFade
        orientation="horizontal"
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 py-0.5"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        {loadError != null ? (
          <ReadFailure
            error={loadError}
            what="the attached term lists"
            onRetry={() => void reload()}
            size="compact"
          />
        ) : null}
        {attached.map((item) => (
          <span
            key={item.edgeId}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pl-1.5 pr-0.5 text-xs"
          >
            <BookA className="h-3 w-3 text-muted-foreground" />
            <a
              href={`${EDITOR_HREF}?id=${item.termListId}`}
              target="_blank"
              rel="noreferrer"
              className="max-w-40 truncate hover:underline"
              title="Open in a new tab"
            >
              {item.label ?? "Term list"}
            </a>
            <button
              type="button"
              aria-label={`Remove ${item.label ?? "term list"}`}
              onClick={() => void detach(item)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </ScrollFade>
      <TermListPicker
        attachedIds={new Set(attached.map((a) => a.termListId))}
        onPick={async (list) => {
          try {
            await attachTermList(agentId, list);
            await reload();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't attach the term list");
          }
        }}
      />
    </div>
  );
}

function TermListPicker({
  attachedIds,
  onPick,
}: {
  attachedIds: ReadonlySet<string>;
  onPick: (list: TermList) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<TermList[] | null>(null);
  const [listsError, setListsError] = useState<unknown>(null);
  const [listsAttempt, setListsAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void listTermLists()
      .then((rows) => {
        if (active) {
          setLists(rows);
          setListsError(null);
        }
      })
      .catch((e: unknown) => {
        // Said once, inside the picker (the org refusal carries its own remedy).
        if (active) {
          setListsError(e);
          setLists([]);
        }
      });
    return () => {
      active = false;
    };
  }, [open, listsAttempt]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Attach a term list"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — search-as-you-type list; a content-sized box would reflow on every keystroke */ className="z-[200] w-72 p-0" align="end" side="bottom" sideOffset={6}>
        <Command>
          <CommandInput placeholder="Search term lists" />
          <CommandList>
            {lists === null ? (
              <div className="flex justify-center p-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : listsError != null ? (
              <ReadFailure
                error={listsError}
                what="this organization's term lists"
                onRetry={() => setListsAttempt((n) => n + 1)}
                size="compact"
              />
            ) : (
              <>
                <CommandEmpty>No term lists in this organization.</CommandEmpty>
                <CommandGroup>
                  {lists.map((list) => {
                    const isAttached = attachedIds.has(list.id);
                    return (
                      <CommandItem
                        key={list.id}
                        value={`${list.name} ${list.id}`}
                        disabled={isAttached}
                        onSelect={() => {
                          void onPick(list).then(() => setOpen(false));
                        }}
                      >
                        <BookA className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        {isAttached ? (
                          <Check className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {list.entries.length}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <a
            href={EDITOR_HREF}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Manage term lists
          </a>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
