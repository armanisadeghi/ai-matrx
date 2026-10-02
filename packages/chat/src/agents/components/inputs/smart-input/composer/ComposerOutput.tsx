"use client";

/**
 * Output (brief §11; Arman 2026-09-28). What the person wants back — two
 * levels, both multi-select, sticky for the chat (the conversation's run
 * settings), × on the pill resets to the default (Text only, no shapes).
 *
 *  - Output TYPES: Text (on by default), Image, Audio, Video, Voice, Music,
 *    Document, Spreadsheet, Presentation, PDF, Code, Data. Saved in
 *    `builderAdvancedSettings.outputTypes`. NOT SENT — no request field
 *    carries requested output types yet, and the agent picker cannot filter by
 *    them yet — and the panel says exactly that.
 *  - SHAPES: the whole kind catalog (system + organization + mine) through the
 *    canonical Shapes list RPC, searchable, paged, selected pinned on top. A
 *    kind with a render_block skill toggles that skill in `addedSkills` (sent
 *    as `skill_config.included` — the same write the Quickset chips make); a
 *    kind with none is kept in `outputKinds` and marked "no skill".
 *
 * State logic: `output-selection.ts` (pure, tested). Catalog read:
 * `useOutputShapeCatalog`.
 */

import { useRef, useState, type ComponentType } from "react";
import {
  AudioLines,
  Braces,
  Check,
  ChevronDown,
  Code,
  FileSpreadsheet,
  FileText,
  FileType,
  Image as ImageIcon,
  Mic,
  Music,
  Presentation,
  RotateCcw,
  Search,
  Shapes,
  Type,
  Video,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { ComposerMenuDivider, ComposerMenuHelp, ComposerMenuLabel, ComposerMenuRow } from "./ComposerMenu";
import { composerPillClass } from "./ComposerAgentPill";
import type { ComposerSize } from "./composer-types";
import {
  OUTPUT_TYPES,
  clearOutput,
  isDefaultOutput,
  prettifySlug,
  readOutputTypes,
  resolveKindSkillId,
  selectedOutputKinds,
  summarizeOutput,
  toggleOutputKind,
  toggleOutputType,
} from "./output-selection";
import { SHAPE_SOURCES, knownShapeLabel, useOutputShapeCatalog, type ShapeSource } from "./useOutputShapeCatalog";

type IconType = ComponentType<{ className?: string }>;

const TYPE_ICONS: Record<string, IconType> = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  voice: Mic,
  music: Music,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  pdf: FileType,
  code: Code,
  data: Braces,
};

const kindLabel = (kind: string) => knownShapeLabel(kind) ?? prettifySlug(kind);

/** The Output selection for one conversation, and its writes. */
function useComposerOutput(conversationId: string) {
  const dispatch = useAppDispatch();
  const { skills } = useSkills();
  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ?? DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const types = readOutputTypes(settings.outputTypes);
  const outputKinds = settings.outputKinds ?? [];
  const addedSkills = settings.addedSkills ?? [];
  const kinds = selectedOutputKinds(outputKinds, addedSkills, skills);

  const write = (changes: { outputTypes?: string[]; outputKinds?: string[]; addedSkills?: string[] }) =>
    dispatch(setBuilderAdvancedSettings({ conversationId, changes }));

  return {
    types,
    kinds,
    skills,
    isDefault: isDefaultOutput(types, kinds.length),
    label: summarizeOutput(types, kinds, kindLabel),
    toggleType: (id: string) => write({ outputTypes: toggleOutputType(types, id) }),
    toggleKind: (kind: string) => write(toggleOutputKind({ outputKinds, addedSkills }, kind, skills)),
    clear: () => write(clearOutput({ outputKinds, addedSkills }, skills)),
  };
}

function TypeGrid({ types, onToggle }: { types: readonly string[]; onToggle: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-0.5 px-1 @[300px]:grid-cols-3">
      {OUTPUT_TYPES.map((type) => {
        const on = types.includes(type.id);
        const Icon = TYPE_ICONS[type.id] ?? FileText;
        return (
          <button
            key={type.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(type.id)}
            className={cn(
              "flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-[13px] transition-colors",
              on ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0", !on && "text-muted-foreground")} />
            <span className="min-w-0 flex-1 truncate">{type.label}</span>
            {on ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function ShapePicker({
  kinds,
  skills,
  onToggle,
}: {
  kinds: readonly string[];
  skills: ReturnType<typeof useSkills>["skills"];
  onToggle: (kind: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<ShapeSource>("system");
  const catalog = useOutputShapeCatalog({ source, search, enabled: true });
  const listRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(listRef, { label: "Composer Output shapes list" });

  const selected = new Set(kinds);
  const needle = search.trim().toLowerCase();
  const pinned = kinds.filter(
    (kind) => !needle || kind.toLowerCase().includes(needle) || kindLabel(kind).toLowerCase().includes(needle),
  );
  const unpinned = catalog.rows.filter((row) => !selected.has(row.kind));
  const skillsKnown = skills.length > 0;
  const hasSkill = (kind: string) => resolveKindSkillId(kind, skills) !== null;

  const row = (kind: string, label: string, checked: boolean) => (
    <ComposerMenuRow
      key={kind}
      icon={Shapes}
      label={label}
      checked={checked}
      detail={skillsKnown && !hasSkill(kind) ? "no skill" : undefined}
      title={
        skillsKnown && !hasSkill(kind)
          ? `${label} (${kind}) — no skill teaches the model this shape yet; saved for this chat only`
          : `${label} (${kind}) — adds its skill to this chat`
      }
      onClick={() => onToggle(kind)}
    />
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-2.5 pb-1 pt-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Shapes
        </span>
        {kinds.length > 0 ? (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{kinds.length} selected</span>
        ) : null}
      </div>
      <label className="mx-1 flex h-8 shrink-0 items-center gap-2 rounded-md bg-muted/60 px-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search shapes"
          aria-label="Search shapes"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="shrink-0 rounded text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>
      <div className="mx-1 mt-1 flex shrink-0 gap-0.5" role="tablist" aria-label="Shape source">
        {SHAPE_SOURCES.map((option) => {
          const active = option.id === source;
          const count = catalog.totals[option.id];
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSource(option.id)}
              className={cn(
                "flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-xs transition-colors",
                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60",
              )}
            >
              <span className="truncate">{option.label}</span>
              {count !== undefined ? <span className="shrink-0 tabular-nums opacity-70">{count}</span> : null}
            </button>
          );
        })}
      </div>
      <div ref={listRef} className="mt-1 max-h-64 min-h-0 flex-1 overflow-y-auto">
        {pinned.map((kind) => row(kind, kindLabel(kind), true))}
        {pinned.length > 0 && (unpinned.length > 0 || catalog.loading) ? <ComposerMenuDivider /> : null}
        {catalog.loading ? (
          <div className="flex flex-col gap-1 px-2.5 py-1" aria-label="Loading shapes">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-full rounded-md" />
            ))}
          </div>
        ) : catalog.error ? (
          <ErrorNotice
            size="compact"
            className="mx-1"
            title="Shapes did not load"
            error={catalog.error}
            operation="Load the shape catalog for the composer Output picker"
            calls={["shx_list_scoped"]}
            actions={<ComposerMenuRow icon={RotateCcw} label="Try again" onClick={catalog.retry} />}
          />
        ) : (
          <>
            {unpinned.map((shape) => row(shape.kind, shape.label, false))}
            {unpinned.length === 0 && pinned.length === 0 ? (
              <ComposerMenuHelp>
                {needle ? `No shapes match "${search.trim()}" here.` : "No shapes in this list yet."}
              </ComposerMenuHelp>
            ) : null}
            {catalog.hasMore ? (
              <ComposerMenuRow
                label="Show more"
                detail={`${catalog.rows.length} of ${catalog.total}`}
                disabled={catalog.loadingMore}
                onClick={catalog.loadMore}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The Output menu's body — rendered in the pill (page/splash) or inside + (compact). */
export function ComposerOutputPanel({ conversationId }: { conversationId: string }) {
  const output = useComposerOutput(conversationId);
  const unsent = output.skills.length > 0 ? output.kinds.filter((kind) => !resolveKindSkillId(kind, output.skills)) : [];
  return (
    <div className="@container flex min-h-0 flex-col">
      <ComposerMenuLabel>Output types</ComposerMenuLabel>
      <TypeGrid types={output.types} onToggle={output.toggleType} />
      <ComposerMenuHelp>Saved for this chat. Not sent to the model or used to filter agents yet.</ComposerMenuHelp>
      <ComposerMenuDivider />
      <ShapePicker kinds={output.kinds} skills={output.skills} onToggle={output.toggleKind} />
      {unsent.length > 0 ? (
        <ComposerMenuHelp>
          {unsent.length === 1 ? "1 selected shape has" : `${unsent.length} selected shapes have`} no skill yet, so the
          model is not told about {unsent.length === 1 ? "it" : "them"}.
        </ComposerMenuHelp>
      ) : null}
      {!output.isDefault ? (
        <>
          <ComposerMenuDivider />
          <ComposerMenuRow icon={RotateCcw} label="Reset to Text only" onClick={output.clear} />
        </>
      ) : null}
    </div>
  );
}

export function ComposerOutputPill({
  conversationId,
  size,
  menuSide,
}: {
  conversationId: string;
  size: ComposerSize;
  menuSide: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const output = useComposerOutput(conversationId);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <div className={cn(composerPillClass(size, open), "gap-0 p-0")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-full min-w-0 items-center gap-1 px-2"
            aria-label={`Output: ${output.label}`}
          >
            <span className={cn("truncate", !output.isDefault && "font-medium text-foreground")}>{output.label}</span>
            {output.isDefault ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : null}
          </button>
        </PopoverTrigger>
        {!output.isDefault ? (
          <button
            type="button"
            onClick={output.clear}
            className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Reset output to Text only"
            title="Reset to Text only"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      <PopoverContent
        /* sizing: fixed — the Output panel is a fixed 340px column (type grid + searchable shape list), capped to the viewport on phones */
        side={menuSide}
        align="start"
        sideOffset={8}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[340px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-1"
      >
        <ComposerOutputPanel conversationId={conversationId} />
      </PopoverContent>
    </Popover>
  );
}
