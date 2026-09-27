"use client";

/**
 * ⌘K — "Search your knowledge", everywhere (KNOWLEDGE-HUB.md §5.1, phase H2).
 *
 * The behaviours are copied from named champions, on purpose:
 *  - Raycast: one list for results AND commands, top hit pinned first, ↵ acts
 *    on the selected row, ⌘K on a row opens its ACTION PANEL (Open · File
 *    under… · Attach to this chat · Copy link · Share), Esc steps back out.
 *  - Linear: typed operators become removable chips (`@Ava`, `type:pdf`,
 *    `#tag`, `last week`); Backspace on an empty box removes the last chip.
 *  - Spotlight: results arrive in typed sections with a count and "Show all",
 *    each section filling as its lane answers; ⌘1–⌘8 narrow to one section.
 *
 * Every section is honest on its own: loading, answered, empty ("Nothing in
 * Chats for 'x'"), failed with a Retry, or withheld with the reason. Offline
 * says so. A stand-in engine (the title search, until the service ships)
 * announces itself in a banner.
 *
 * Rendered by the overlay controller (`knowledgeCommandBar`), opened by the
 * shell hotkey (`CommandBarHotkey`) or a resource picker's search step.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CornerDownLeft,
  FolderPlus,
  Globe,
  Info,
  Link2,
  Loader2,
  Paperclip,
  RotateCw,
  Search,
  Share2,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  Skeleton,
} from "@ai-matrx/design-system";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectIsCreator } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { getShareableResource, type ResourceType } from "@/utils/permissions/registry";
import { useOpenContextAssignment } from "@/features/overlays/openers/contextAssignment";
import { useOpenShareModal } from "@/features/overlays/openers/shareModal";
import {
  disposeKnowledgeCommandBarCallbackGroup,
  getKnowledgeCommandBarCallbackGroup,
} from "@/features/overlays/callbacks/knowledgeCommandBar";
import { buildSearchHref } from "@/features/search/search-url";
import { DEFAULT_HUB_STATE, hubHref } from "@/features/knowledge/hub/hubState";
import {
  KNOWLEDGE_SECTION_KEYS,
  KNOWLEDGE_SECTION_LABEL,
  resetKnowledgeSearchEngine,
  type KnowledgeHit,
  type KnowledgeQuery,
  type KnowledgeSearchRunner,
  type KnowledgeSectionKey,
} from "@/features/knowledge/api/knowledgeSearch";
import {
  applyChips,
  chipKey,
  parseQueryText,
  type QueryChip,
} from "@/features/knowledge/api/knowledgeQueryText";
import { getActiveAttachTarget, type KnowledgeAttachTarget } from "./attachTarget";
import { filterCommands, launcherCommands, type KnowledgeCommand } from "./commands";
import { hitAbsoluteUrl, hitHref } from "./hitHref";
import {
  SECTION_DIGIT,
  chipLabel,
  emptySectionSentence,
  entityLabel,
  sectionForDigit,
} from "./sections";
import { useKnowledgeSearchStream, type SectionState } from "./useKnowledgeSearchStream";

export interface KnowledgeCommandBarProps {
  isOpen: boolean;
  onClose: () => void;
  callbackGroupId: string | null;
  initialText?: string | null;
  /** ↵ on a result: open it (default) or attach it (picker hand-off). */
  primaryAction?: "open" | "attach";
  /** Test seam — production uses the one client's `searchKnowledge`. */
  runner?: KnowledgeSearchRunner;
}

type Filter = KnowledgeSectionKey | "commands" | null;
type View = { kind: "results" } | { kind: "actions"; hit: KnowledgeHit };

/** Rows per section before "Show all" (Spotlight shows a few of each). */
const ROWS_PER_SECTION = 4;
const COMMANDS_WHEN_EMPTY = 6;
/** ⌘9 narrows to Commands; ⌘1–⌘8 are the knowledge sections. */
const COMMANDS_DIGIT = 9;

function hitValue(section: KnowledgeSectionKey, hit: KnowledgeHit): string {
  return `hit:${section}:${hit.entity}:${hit.id}`;
}

/** Split typed text into the part whose operators are complete and the tail
 *  still being typed (`@Av…` must not become a chip mid-word). */
function liftCompletedChips(
  raw: string,
  final: boolean,
): { text: string; chips: QueryChip[]; tail: string } {
  if (final) return { ...parseQueryText(raw), tail: "" };
  const cut = Math.max(raw.lastIndexOf(" "), raw.lastIndexOf("\t"));
  if (cut < 0) return { text: "", chips: [], tail: raw };
  const head = raw.slice(0, cut + 1);
  const tail = raw.slice(cut + 1);
  const parsed = parseQueryText(head);
  return { text: parsed.text, chips: parsed.chips, tail };
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function EntityIcon({ entity }: { entity: string }) {
  const Icon: LucideIcon =
    tryGetEntityInfo(resolveEntityToken(entity === "segment" ? "processed_document" : entity))
      ?.Icon ?? Search;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

export default function KnowledgeCommandBar({
  isOpen,
  onClose,
  callbackGroupId,
  initialText,
  primaryAction = "open",
  runner,
}: KnowledgeCommandBarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const isCreator = useAppSelector(selectIsCreator);
  const openFileUnder = useOpenContextAssignment();
  const openShare = useOpenShareModal();
  const online = useOnline();
  const { sections, engine, search, retry, showMore } = useKnowledgeSearchStream(runner);

  // The host's attach target + commands, read once for this opening. With no
  // explicit target, "Attach to this chat" goes to the chat on screen, if any.
  const [group] = useState(() => getKnowledgeCommandBarCallbackGroup(callbackGroupId));
  const [attachTarget] = useState<KnowledgeAttachTarget | null>(
    () => group?.attach ?? getActiveAttachTarget(),
  );
  useEffect(
    () => () => disposeKnowledgeCommandBarCallbackGroup(callbackGroupId),
    [callbackGroupId],
  );

  const [input, setInput] = useState(initialText ?? "");
  const [chips, setChips] = useState<QueryChip[]>([]);
  const [filter, setFilter] = useState<Filter>(null);
  const [view, setView] = useState<View>({ kind: "results" });
  const [actionText, setActionText] = useState("");
  // The selected row is OURS (controlled cmdk), so ↵ / ⌘K always know it and
  // the first row is selected as soon as results stream in.
  const [selected, setSelected] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const typed = liftCompletedChips(input, false);
  const text = [typed.text, typed.tail].filter(Boolean).join(" ");
  const query: KnowledgeQuery = applyChips(
    {
      mode: "find",
      ...(text.trim() ? { text: text.trim() } : {}),
      sort: text.trim() || chips.length ? "relevance" : "recent",
    },
    chips,
  );
  const querySignature = JSON.stringify(query);

  // As-you-type search (debounced in the hook); offline never fires.
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (!online) return;
    if (lastSignature.current === querySignature) return;
    lastSignature.current = querySignature;
    search(JSON.parse(querySignature) as KnowledgeQuery, { asYouType: true });
  }, [querySignature, online, search]);

  const audience = { isAdmin, isCreator };
  const tileCtx = { dispatch, getState: store.getState, router };
  const allCommands: KnowledgeCommand[] = [
    ...(group?.commands ?? []),
    ...launcherCommands(audience, tileCtx),
  ];
  const searchingText = text.trim();
  const matchedCommands = filterCommands(allCommands, searchingText);

  const close = () => onClose();

  const openHit = (hit: KnowledgeHit) => {
    const href = hitHref(hit);
    if (!href) {
      setView({ kind: "actions", hit });
      return;
    }
    close();
    startTransition(() => router.push(href));
  };

  const attachHit = async (hit: KnowledgeHit) => {
    if (!attachTarget) return;
    const ok = await attachTarget.attach(hit);
    if (ok) close();
  };

  const primary = (hit: KnowledgeHit) => {
    if (primaryAction === "attach" && attachTarget?.accepts(hit)) {
      void attachHit(hit);
    } else {
      openHit(hit);
    }
  };

  const askInHub = () => {
    const finalQuery = applyChips(
      {
        mode: "ask",
        ...(parseQueryText(input).text ? { text: parseQueryText(input).text } : {}),
      },
      [...chips, ...parseQueryText(input).chips],
    );
    close();
    startTransition(() =>
      router.push(hubHref({ ...DEFAULT_HUB_STATE, query: finalQuery })),
    );
  };

  const selectedValue = (): string | null => selected || null;

  // Raycast: whenever the rows change (results stream in, a filter, the
  // action panel), the first row is selected; arrow keys move it from there.
  const lastRows = useRef("");
  useEffect(() => {
    const values = Array.from(
      listRef.current?.querySelectorAll("[cmdk-item]") ?? [],
    )
      .filter((el) => el.getAttribute("aria-disabled") !== "true")
      .map((el) => el.getAttribute("data-value") ?? "")
      .filter(Boolean);
    const rows = values.join("|");
    if (rows !== lastRows.current) {
      lastRows.current = rows;
      setSelected(values[0] ?? "");
    } else if (!values.includes(selected)) {
      setSelected(values[0] ?? "");
    }
  });

  const onInputChange = (raw: string) => {
    if (view.kind === "actions") {
      setActionText(raw);
      return;
    }
    const lifted = liftCompletedChips(raw, false);
    if (lifted.chips.length) {
      setChips((prev) => {
        const next = [...prev];
        for (const c of lifted.chips) {
          if (!next.some((p) => chipKey(p) === chipKey(c))) next.push(c);
        }
        return next;
      });
      setInput(`${lifted.text ? `${lifted.text} ` : ""}${lifted.tail}`);
    } else {
      setInput(raw);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      e.stopPropagation();
      if (view.kind === "actions") {
        setView({ kind: "results" });
        return;
      }
      const hit = hitsByValue.get(selectedValue() ?? "");
      if (hit) {
        setActionText("");
        setView({ kind: "actions", hit });
      }
      return;
    }
    if (mod && /^[0-9]$/.test(e.key) && view.kind === "results") {
      e.preventDefault();
      e.stopPropagation();
      const digit = Number(e.key);
      if (digit === 0) setFilter(null);
      else if (digit === COMMANDS_DIGIT) setFilter((f) => (f === "commands" ? null : "commands"));
      else {
        const key = sectionForDigit(digit);
        if (key) setFilter((f) => (f === key ? null : key));
      }
      return;
    }
    if (e.key === "Enter" && mod && view.kind === "results") {
      e.preventDefault();
      e.stopPropagation();
      askInHub();
      return;
    }
    if (e.key === "Enter" && view.kind === "results") {
      // Submit: lift every operator and run the full search (rerank on, no
      // as-you-type shortcuts). With a row selected, ↵ also acts on it (cmdk).
      const final = parseQueryText(input);
      if (final.chips.length) {
        setChips((prev) => [
          ...prev,
          ...final.chips.filter((c) => !prev.some((p) => chipKey(p) === chipKey(c))),
        ]);
        setInput(final.text);
      }
      if (online) {
        search(applyChips({ ...query, ...(final.text ? { text: final.text } : {}) }, final.chips), {
          asYouType: false,
        });
      }
      if (!selectedValue()) e.preventDefault();
      return;
    }
    if (e.key === "Backspace" && input === "" && view.kind === "results" && chips.length) {
      e.preventDefault();
      setChips((prev) => prev.slice(0, -1));
      return;
    }
    if (e.key === "Escape" && view.kind === "actions") {
      e.preventDefault();
      e.stopPropagation();
      setView({ kind: "results" });
    }
  };

  // ─── rendering ────────────────────────────────────────────────────────────

  // Derived purely from state (never filled while rendering rows): the React
  // Compiler may reuse a memoized row subtree, and a map populated as a side
  // effect of rendering those rows would then be empty — ⌘K found no hit.
  const hitsByValue = new Map<string, KnowledgeHit>();
  for (const k of KNOWLEDGE_SECTION_KEYS) {
    for (const hit of sections[k].section?.items ?? []) {
      hitsByValue.set(hitValue(k, hit), hit);
    }
  }

  const renderHitRow = (key: KnowledgeSectionKey, hit: KnowledgeHit) => {
    const value = hitValue(key, hit);
    const href = hitHref(hit);
    const canAttach = primaryAction === "attach" && attachTarget?.accepts(hit);
    const sub =
      hit.entity === "segment"
        ? [hit.segment?.source_title, hit.segment?.locator].filter(Boolean).join(" · ")
        : [entityLabel(hit.entity), hit.filed_under?.[0]?.name].filter(Boolean).join(" · ");
    return (
      <CommandItem
        key={value}
        value={value}
        onSelect={() => primary(hit)}
        className="flex items-start gap-2"
      >
        <EntityIcon entity={hit.entity} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-foreground">{hit.title}</div>
          {hit.entity === "segment" && hit.snippet ? (
            <div className="line-clamp-2 text-xs text-muted-foreground">{hit.snippet}</div>
          ) : null}
          <div className="truncate text-xs text-muted-foreground">
            {sub}
            {!href ? " · No page for this kind yet — ⌘K for actions" : null}
          </div>
        </div>
        <CommandShortcut className="hidden sm:inline">
          {canAttach ? "Attach ↵" : href ? "Open ↵" : "Actions ↵"}
        </CommandShortcut>
      </CommandItem>
    );
  };

  const renderSection = (key: KnowledgeSectionKey, state: SectionState) => {
    const label = KNOWLEDGE_SECTION_LABEL[key];
    const section = state.section;
    const items = section?.items ?? [];
    const orderedItems =
      !searchingText && items.length && items.every((i) => typeof i.frecency === "number")
        ? [...items].sort((a, b) => (b.frecency ?? 0) - (a.frecency ?? 0))
        : items;
    const expanded = filter === key;
    const shown = expanded ? orderedItems : orderedItems.slice(0, ROWS_PER_SECTION);
    const count = section?.count ?? null;
    const digit = SECTION_DIGIT[key];
    const querying = Boolean(searchingText || chips.length);

    if (key === "top_hit" && !items.length) return null;
    // With nothing typed, the bar shows recents — an empty recents section
    // is noise, so it stays out until there is a query to answer.
    if (!querying && state.status === "ready" && !items.length && !section?.withheld) return null;
    if (state.status === "idle") return null;

    const heading = (
      <span className="flex items-center gap-1.5">
        {label}
        {count !== null && key !== "top_hit" ? (
          <span className="tabular-nums text-muted-foreground/80">{count}</span>
        ) : null}
        {state.status === "loading" ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-label={`Searching ${label}`} />
        ) : null}
        {digit && !filter ? (
          <span className="ml-auto hidden text-[10px] text-muted-foreground/70 sm:inline">⌘{digit}</span>
        ) : null}
      </span>
    );

    return (
      <CommandGroup key={key} heading={heading}>
        {state.status === "loading" && !items.length ? (
          <div className="flex flex-col gap-1.5 px-2 py-1.5" aria-busy>
            <span className="text-xs text-muted-foreground">{state.message ?? `Still searching ${label}…`}</span>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}
        {state.status === "error" ? (
          <>
            <div role="alert" className="flex items-center gap-1 px-2 py-1 text-xs text-destructive">
              <span className="min-w-0 flex-1">{state.message}</span>
              <ErrorAlchemyMenu
                error={state.message}
                operation={`Search ${label}`}
                calls={["/knowledge/search"]}
                size="xs"
              />
            </div>
            {state.retryable ? (
              <CommandItem value={`retry:${key}`} onSelect={() => retry()}>
                <RotateCw className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-sm">Retry {label}</span>
              </CommandItem>
            ) : null}
          </>
        ) : null}
        {section?.withheld ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">{section.withheld}</div>
        ) : null}
        {state.status !== "error" && shown.map((hit) => renderHitRow(key, hit))}
        {state.status === "ready" && !items.length && !section?.withheld ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {emptySectionSentence(key, searchingText)}
          </div>
        ) : null}
        {key !== "top_hit" &&
        state.status !== "error" &&
        count !== null &&
        count > shown.length ? (
          <CommandItem
            value={`show-all:${key}`}
            onSelect={() => {
              setFilter(key);
              if (items.length < count && section?.next_cursor) void showMore(key);
            }}
          >
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm">
              Show all {count} in {label}
            </span>
          </CommandItem>
        ) : null}
      </CommandGroup>
    );
  };

  const renderCommands = () => {
    const expanded = filter === "commands";
    const list = expanded || searchingText ? matchedCommands : matchedCommands.slice(0, COMMANDS_WHEN_EMPTY);
    const webSearch = searchingText ? (
      <CommandItem
        value="command:search-web"
        onSelect={() => {
          close();
          startTransition(() => router.push(buildSearchHref(searchingText)));
        }}
      >
        <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="text-sm">Search the web for “{searchingText}”</span>
      </CommandItem>
    ) : null;
    if (!list.length && !webSearch) {
      return searchingText ? (
        <CommandGroup heading="Commands">
          <div className="px-2 py-1 text-xs text-muted-foreground">
            No command matches &apos;{searchingText}&apos;
          </div>
        </CommandGroup>
      ) : null;
    }
    return (
      <CommandGroup
        heading={
          <span className="flex items-center gap-1.5">
            Commands
            <span className="tabular-nums text-muted-foreground/80">{matchedCommands.length}</span>
            {!filter ? (
              <span className="ml-auto hidden text-[10px] text-muted-foreground/70 sm:inline">⌘9</span>
            ) : null}
          </span>
        }
      >
        {list.map((c) => {
          const Icon = c.icon ?? ArrowUpRight;
          return (
            <CommandItem
              key={c.id}
              value={`command:${c.id}`}
              onSelect={() => {
                close();
                c.run();
              }}
            >
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
              {c.group ? (
                <span className="hidden text-xs text-muted-foreground sm:inline">{c.group}</span>
              ) : null}
            </CommandItem>
          );
        })}
        {!expanded && !searchingText && matchedCommands.length > list.length ? (
          <CommandItem value="show-all:commands" onSelect={() => setFilter("commands")}>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="text-sm">Show all {matchedCommands.length} commands</span>
          </CommandItem>
        ) : null}
        {webSearch}
      </CommandGroup>
    );
  };

  const renderActions = (hit: KnowledgeHit) => {
    const href = hitHref(hit);
    const subjectEntity = hit.entity === "segment" ? "processed_document" : hit.entity;
    const subjectId = hit.entity === "segment" ? (hit.segment?.source_id ?? hit.id) : hit.id;
    const shareable = getShareableResource(subjectEntity);
    const canAttach = Boolean(attachTarget?.accepts(hit));
    const actions: {
      id: string;
      label: string;
      icon: LucideIcon;
      hint?: string;
      run: () => void;
    }[] = [];
    if (href)
      actions.push({ id: "open", label: "Open", icon: CornerDownLeft, hint: "↵", run: () => openHit(hit) });
    if (canAttach && attachTarget)
      actions.push({
        id: "attach",
        label: attachTarget.label,
        icon: Paperclip,
        run: () => void attachHit(hit),
      });
    actions.push({
      id: "file-under",
      label: "File under…",
      icon: FolderPlus,
      run: () => {
        close();
        openFileUnder({
          subject: {
            entityType: resolveEntityToken(subjectEntity) as EntityTypeToken,
            entityId: subjectId,
            title: hit.entity === "segment" ? (hit.segment?.source_title ?? hit.title) : hit.title,
          },
        });
      },
    });
    const url = hitAbsoluteUrl(hit);
    if (url)
      actions.push({
        id: "copy-link",
        label: "Copy link",
        icon: Link2,
        run: () => {
          void writeClipboard(url).then(() => toast.success("Link copied."));
          close();
        },
      });
    if (shareable)
      actions.push({
        id: "share",
        label: "Share…",
        icon: Share2,
        run: () => {
          close();
          openShare({
            resourceType: subjectEntity as ResourceType,
            resourceId: subjectId,
            resourceName: hit.title,
          });
        },
      });
    const q = actionText.trim().toLowerCase();
    const visible = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
    return (
      <CommandGroup heading={`Actions for “${hit.title}”`}>
        {visible.map((a) => (
          <CommandItem key={a.id} value={`action:${a.id}`} onSelect={a.run}>
            <a.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="flex-1 text-sm">{a.label}</span>
            {a.hint ? <CommandShortcut>{a.hint}</CommandShortcut> : null}
          </CommandItem>
        ))}
        {!visible.length ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">No action matches &apos;{actionText}&apos;</div>
        ) : null}
      </CommandGroup>
    );
  };

  const orderedKeys = KNOWLEDGE_SECTION_KEYS.filter(
    (k) => filter === null || filter === k || (k === "top_hit" && filter === null),
  );

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        if (view.kind === "actions") setView({ kind: "results" });
        else close();
      }}
    >
      {/* Nested inside CommandDialog's own Command so the list is unfiltered
          (the server ranks) and the selection is controlled; this root handles
          every key first, and cmdk skips keys it has already handled. */}
      <Command
        shouldFilter={false}
        loop
        value={selected}
        onValueChange={setSelected}
        className="bg-transparent"
      >
      <div data-testid="knowledge-command-bar" className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 pr-12">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {view.kind === "actions" ? (
            <button
              type="button"
              onClick={() => setView({ kind: "results" })}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
            >
              {view.hit.title}
              <X className="h-3 w-3" aria-hidden />
              <span className="sr-only">Back to results</span>
            </button>
          ) : (
            chips.map((chip) => (
              <span
                key={chipKey(chip)}
                data-testid="knowledge-chip"
                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
              >
                {chipLabel(chip)}
                <button
                  type="button"
                  aria-label={`Remove ${chipLabel(chip)}`}
                  className="rounded-sm hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => {
                    setChips((prev) => prev.filter((c) => chipKey(c) !== chipKey(chip)));
                    inputRef.current?.focus();
                  }}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))
          )}
          {filter ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground">
              Only {filter === "commands" ? "Commands" : KNOWLEDGE_SECTION_LABEL[filter]}
              <button
                type="button"
                aria-label="Show every section"
                className="rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => setFilter(null)}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ) : null}
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="knowledge-command-results"
            aria-autocomplete="list"
            aria-label="Search your knowledge"
            data-testid="knowledge-command-input"
            value={view.kind === "actions" ? actionText : input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              view.kind === "actions"
                ? "Search actions…"
                : chips.length
                  ? "Add words…"
                  : "Search your knowledge — try @Ava, type:pdf, #tag, last week"
            }
            className="min-w-[8rem] flex-1 bg-transparent py-1.5 text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
          />
        </div>

        {!online ? (
          <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            You&apos;re offline — searching needs a connection. Commands still work.
          </div>
        ) : null}
        {online && engine === "title_stand_in" ? (
          <div
            data-testid="knowledge-engine-banner"
            className="flex items-start gap-2 border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Title search only: the full knowledge search isn&apos;t on this server yet, so words inside
              documents and chats aren&apos;t searched.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  resetKnowledgeSearchEngine();
                  retry();
                }}
              >
                Check again
              </button>
            </span>
          </div>
        ) : null}
        {online && engine === "fixture" ? (
          <div className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
            Sample results — not your data.
          </div>
        ) : null}

        <CommandList
          ref={listRef}
          id="knowledge-command-results"
          className="max-h-[min(60dvh,32rem)] sm:h-[min(60dvh,32rem)]"
        >
          {view.kind === "actions" ? (
            renderActions(view.hit)
          ) : (
            <>
              {online && filter !== "commands"
                ? orderedKeys.map((k) => renderSection(k, sections[k]))
                : null}
              {filter === null || filter === "commands" ? (
                <>
                  {filter === null ? <CommandSeparator /> : null}
                  {renderCommands()}
                </>
              ) : null}
            </>
          )}
        </CommandList>

        <div className="hidden items-center gap-3 overflow-hidden whitespace-nowrap border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground sm:flex">
          <span>
            ↵ {primaryAction === "attach" && attachTarget ? attachTarget.label : "Open"}
          </span>
          <button type="button" className="hover:text-foreground" onClick={askInHub}>
            ⌘↵ Ask
          </button>
          <span>⌘K Actions</span>
          <span title="⌘1–8 one section · ⌘9 Commands · ⌘0 everything">⌘1–9 Filter</span>
          <span className="ml-auto">Esc {view.kind === "actions" ? "Back" : "Close"}</span>
        </div>
      </div>
      </Command>
    </CommandDialog>
  );
}
