"use client";

/**
 * ReferencePickerBody — the user-grade "Add a reference" flow.
 *
 * Order of operations (Arman, 2026-09-11): pick the TYPE first (Chat, Note,
 * Task, … by the names users know; every other pickable type behind
 * "All types"), the ACTION defaults to "Link to it" and only shows the other
 * choices when the catalog says the type supports them, then a real SEARCH to
 * find the record. The result is the canonical minified reference fence —
 * the same bytes the chat chip renderer already understands.
 *
 * Reuses, never forks: `ReferenceTypeAdder` (record search / file window / url
 * form), the entity registry for labels + icons, `matrxDirectiveNouns` for
 * families, `buildDirectiveFence` for the wire. The overlay shell around this
 * body lives in `features/overlays/components/ReferencePickerOverlay.tsx`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import type { DirectiveClass } from "@ai-matrx/content-ir";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { isEntityTypeToken } from "@ai-matrx/associations";
import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  listableTokens,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { referenceTypeLabel } from "@/features/scopes/utils/referenceCell";
import { createEntityRow } from "@/features/scopes/service/entityRows";
import { matrxDirectiveNouns } from "@/features/matrx-envelope/directiveHost";
import { CATALOG_ALIASES } from "@/features/matrx-envelope/catalog-nouns.generated";
import { buildDirectiveFence } from "@/features/matrx-envelope/referenceFence";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import { ReferenceTypeAdder } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import { fetchDirectiveCatalog } from "@/features/directive-catalog/service";
import type {
  DirectiveCatalog,
  NounDirectives,
} from "@/features/directive-catalog/types";
import {
  COMMON_REFERENCE_TYPES,
  FRIENDLY_REFERENCE_TYPE_LABELS,
  INLINE_CREATE_REFERENCE_TYPES,
  type ReferenceDelivery,
  type ReferencePick,
} from "./referencePickerTypes";

// THE one canonical file picker — lazy, WindowPanel never enters a boot bundle.
const FilePickerWindow = dynamic(
  () =>
    import("@/features/resource-manager/resource-picker/FilePickerWindow").then(
      (m) => ({ default: m.FilePickerWindow }),
    ),
  { ssr: false, loading: () => null },
);

export interface ReferencePickerBodyProps {
  /** What the opening surface can do: an editable surface inserts (and may copy); everything else copies. */
  mode: ReferenceDelivery;
  onPicked: (pick: ReferencePick) => void;
  onCancel: () => void;
}

interface TypeOption {
  token: string;
  label: string;
  family: string;
  Icon: React.ComponentType<{ className?: string }>;
}

function typeOption(token: string): TypeOption {
  const label =
    FRIENDLY_REFERENCE_TYPE_LABELS[token] ?? referenceTypeLabel(token);
  if (token === "file") {
    return { token, label, family: "Files & links", Icon: FileIcon };
  }
  if (token === "url") {
    return { token, label, family: "Files & links", Icon: LinkIcon };
  }
  const info = tryGetEntityInfo(token);
  const family = matrxDirectiveNouns(token)?.family ?? "Other";
  return {
    token,
    label,
    family: family || "Other",
    Icon: info?.Icon ?? FileIcon,
  };
}

/** Every type the user may reference: file + url + the DB-driven pickable set. */
function allTypeOptions(): TypeOption[] {
  const tokens = [...new Set<string>(["file", "url", ...listableTokens()])];
  return tokens.map(typeOption);
}

function commonTypeOptions(all: TypeOption[]): TypeOption[] {
  const byToken = new Map(all.map((o) => [o.token, o]));
  return COMMON_REFERENCE_TYPES.map((t) => byToken.get(t)).filter(
    (o): o is TypeOption => Boolean(o),
  );
}

// ── Catalog (only loaded when the user asks for other actions) ──────────────

let catalogCache: { baseUrl: string; promise: Promise<DirectiveCatalog> } | null =
  null;

function loadCatalog(baseUrl: string): Promise<DirectiveCatalog> {
  if (catalogCache && catalogCache.baseUrl === baseUrl) return catalogCache.promise;
  const promise = fetchDirectiveCatalog(baseUrl).catch((err: unknown) => {
    catalogCache = null;
    throw err;
  });
  catalogCache = { baseUrl, promise };
  return promise;
}

function findNoun(catalog: DirectiveCatalog, token: string): NounDirectives | null {
  const canonical = CATALOG_ALIASES[token] ?? token;
  return catalog.nouns.find((n) => n.noun === canonical) ?? null;
}

interface ActionOption {
  directiveClass: DirectiveClass;
  label: string;
  /** Present = shown greyed with this reason (never silently absent). */
  disabledReason?: string;
}

const LINK_ACTION: ActionOption = {
  directiveClass: "reference",
  label: "Link to it",
};

function actionOptionsFor(noun: NounDirectives | null): ActionOption[] {
  const options: ActionOption[] = [LINK_ACTION];
  if (!noun) return options;
  if (noun.delete === "yes") {
    options.push({
      directiveClass: "delete",
      label: "Delete it (inserts a button; runs only when clicked)",
    });
  }
  if (noun.update === "yes") {
    options.push({
      directiveClass: "update",
      label: "Update it",
      disabledReason: "Needs field values — not available from this picker yet",
    });
  }
  if (noun.create === "yes") {
    options.push({
      directiveClass: "create",
      label: "Create one",
      disabledReason: "Needs field values — not available from this picker yet",
    });
  }
  return options;
}

// ── Body ────────────────────────────────────────────────────────────────────

export function ReferencePickerBody({
  mode,
  onPicked,
  onCancel,
}: ReferencePickerBodyProps) {
  const all = useMemo(allTypeOptions, []);
  const common = useMemo(() => commonTypeOptions(all), [all]);

  const [activeType, setActiveType] = useState<TypeOption | null>(null);
  const [delivery, setDelivery] = useState<ReferenceDelivery>(mode);
  const [directiveClass, setDirectiveClass] = useState<DirectiveClass>("reference");
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const finish = (items: ReferenceItem[], title: string | null) => {
    if (!activeType || items.length === 0) return;
    // Pure identity on the wire: the chip resolves the live label itself.
    const pure = items.map((item) => {
      const { label: _label, ...rest } = item as Record<string, unknown>;
      return rest as ReferenceItem;
    });
    const fence = buildDirectiveFence(directiveClass, activeType.token, pure);
    const shell = fence.split("\n")[1] ?? "";
    onPicked({
      fence,
      shell,
      directiveClass,
      type: activeType.token,
      title,
      delivery,
    });
  };

  if (!activeType) {
    return (
      <TypeStep
        all={all}
        common={common}
        onChoose={(option) => {
          setDirectiveClass("reference");
          setActiveType(option);
        }}
        onCancel={onCancel}
      />
    );
  }

  return (
    <>
      <RecordStep
        type={activeType}
        mode={mode}
        delivery={delivery}
        onDeliveryChange={setDelivery}
        directiveClass={directiveClass}
        onDirectiveClassChange={setDirectiveClass}
        onBack={() => setActiveType(null)}
        onBrowseFiles={() => setFilePickerOpen(true)}
        onPickMany={(items) => {
          const first = items[0] as Record<string, unknown> | undefined;
          const title =
            typeof first?.label === "string" ? (first.label as string) : null;
          finish(items, title);
        }}
      />
      <FilePickerWindow
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        scopeId="reference-picker"
        title="Choose a file"
        onPick={(selection) => {
          setFilePickerOpen(false);
          finish(
            [{ file_id: selection.fileId } as unknown as ReferenceItem],
            selection.details.filename || null,
          );
        }}
      />
    </>
  );
}

// ── Step 1: type ────────────────────────────────────────────────────────────

function TypeStep({
  all,
  common,
  onChoose,
  onCancel,
}: {
  all: TypeOption[];
  common: TypeOption[];
  onChoose: (option: TypeOption) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const matches = q
    ? all.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          o.token.includes(q) ||
          o.family.toLowerCase().includes(q),
      )
    : null;

  const grouped = useMemo(() => {
    const map = new Map<string, TypeOption[]>();
    for (const o of all) (map.get(o.family) ?? map.set(o.family, []).get(o.family)!).push(o);
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, options]) => ({
        family,
        options: [...options].sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [all]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to reference?"
          className="h-9 pl-8 text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches && matches[0]) onChoose(matches[0]);
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {matches ? (
          matches.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              No type matches "{query.trim()}".
            </p>
          ) : (
            <TypeList options={matches} onChoose={onChoose} />
          )
        ) : (
          <>
            <TypeGrid options={common} onChoose={onChoose} />
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showAll ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              All types ({all.length})
            </button>
            {showAll &&
              grouped.map((g) => (
                <div key={g.family} className="mt-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.family}
                  </p>
                  <TypeList options={g.options} onChoose={onChoose} />
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

function TypeGrid({
  options,
  onChoose,
}: {
  options: TypeOption[];
  onChoose: (option: TypeOption) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.token}
          type="button"
          onClick={() => onChoose(o)}
          className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <o.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function TypeList({
  options,
  onChoose,
}: {
  options: TypeOption[];
  onChoose: (option: TypeOption) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((o) => (
        <button
          key={o.token}
          type="button"
          onClick={() => onChoose(o)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <o.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground">{o.label}</span>
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {o.family}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Step 2: action + record ─────────────────────────────────────────────────

function RecordStep({
  type,
  mode,
  delivery,
  onDeliveryChange,
  directiveClass,
  onDirectiveClassChange,
  onBack,
  onBrowseFiles,
  onPickMany,
}: {
  type: TypeOption;
  mode: ReferenceDelivery;
  delivery: ReferenceDelivery;
  onDeliveryChange: (d: ReferenceDelivery) => void;
  directiveClass: DirectiveClass;
  onDirectiveClassChange: (c: DirectiveClass) => void;
  onBack: () => void;
  onBrowseFiles: () => void;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const isEntity = isEntityTypeToken(type.token);
  const verb = delivery === "insert" ? "Insert" : "Copy";

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1.5"
          onClick={onBack}
          aria-label="Back to types"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <type.Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{type.label}</span>
        {mode === "insert" && (
          <div
            role="radiogroup"
            aria-label="What to do with the reference"
            className="ml-auto flex rounded-md border border-border p-0.5 text-xs"
          >
            {(["insert", "copy"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={delivery === d}
                onClick={() => onDeliveryChange(d)}
                className={cn(
                  "rounded px-2 py-0.5",
                  delivery === d
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d === "insert" ? "Insert" : "Copy"}
              </button>
            ))}
          </div>
        )}
      </div>

      {isEntity && (
        <ActionRow
          token={type.token}
          directiveClass={directiveClass}
          onChange={onDirectiveClassChange}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {verb} the reference by choosing a {type.label.toLowerCase()} below.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReferenceTypeAdder
          type={type.token}
          onBrowseFiles={onBrowseFiles}
          onPickMany={onPickMany}
        />
      </div>

      {isEntity && INLINE_CREATE_REFERENCE_TYPES.has(type.token) && (
        <InlineCreate
          token={type.token as EntityTypeToken}
          label={type.label}
          onCreated={(id, title) =>
            onPickMany([{ id, label: title } as unknown as ReferenceItem])
          }
        />
      )}
    </div>
  );
}

function ActionRow({
  token,
  directiveClass,
  onChange,
}: {
  token: string;
  directiveClass: DirectiveClass;
  onChange: (c: DirectiveClass) => void;
}) {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const [expanded, setExpanded] = useState(false);
  const [options, setOptions] = useState<ActionOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!expanded || options || loading) return;
    if (!baseUrl) {
      setError("No server configured — only linking is available.");
      setOptions([LINK_ACTION]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadCatalog(baseUrl)
      .then((catalog) => {
        if (cancelled) return;
        setOptions(actionOptionsFor(findNoun(catalog, token)));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          `Couldn't load the other actions (${err instanceof Error ? err.message : "unknown error"}) — only linking is available.`,
        );
        setOptions([LINK_ACTION]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, options, loading, baseUrl, token]);

  const current =
    options?.find((o) => o.directiveClass === directiveClass) ?? LINK_ACTION;

  return (
    <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Action:</span>
        <span className="font-medium text-foreground">{current.label}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Hide" : "Change…"}
        </button>
      </div>
      {expanded && (
        <div className="mt-1.5 space-y-0.5">
          {loading && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading actions…
            </p>
          )}
          {error && <p className="text-amber-700 dark:text-amber-300">{error}</p>}
          {options?.map((o) => (
            <button
              key={o.directiveClass}
              type="button"
              disabled={Boolean(o.disabledReason)}
              title={o.disabledReason}
              aria-checked={o.directiveClass === directiveClass}
              role="radio"
              onClick={() => {
                onChange(o.directiveClass);
                setExpanded(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left",
                o.directiveClass === directiveClass
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-accent",
                o.disabledReason && "cursor-not-allowed opacity-60",
              )}
            >
              <span>{o.label}</span>
              {o.disabledReason && (
                <span className="ml-auto truncate text-[11px] text-muted-foreground">
                  {o.disabledReason}
                </span>
              )}
            </button>
          ))}
          {options && options.length === 1 && !loading && !error && (
            <p className="text-muted-foreground">
              Linking is the only action available for this type.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function InlineCreate({
  token,
  label,
  onCreated,
}: {
  token: EntityTypeToken;
  label: string;
  onCreated: (id: string, title: string) => void;
}) {
  const orgId = useAppSelector(selectOrganizationId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const result = await createEntityRow(token, { title: trimmed, orgId });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.data.id, result.data.title);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> New {label.toLowerCase()}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`New ${label.toLowerCase()} title`}
          className="h-8 text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <Button size="sm" className="h-8" disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
