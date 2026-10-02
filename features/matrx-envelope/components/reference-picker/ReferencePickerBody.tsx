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
 * form), the entity registry for labels + icons, `referenceTypeGroups` for
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
import { Input, Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { ENTITY_TYPE_METADATA, isEntityTypeToken } from "@ai-matrx/associations";
import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  listableTokens,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { createEntityRow } from "@/features/scopes/service/entityRows";
import { referenceTypeGroup } from "@/features/scopes/utils/referenceTypeGroups";
import { CATALOG_ALIASES } from "@/features/matrx-envelope/catalog-nouns.generated";
import { buildDirectiveFence } from "@ai-matrx/agents/envelope";
import type { ReferenceItem } from "@ai-matrx/agents/envelope";
import { ReferenceTypeAdder } from "@/features/matrx-envelope/components/ReferenceTypeAdder";
import { fetchDirectiveCatalog } from "@/features/directive-catalog/service";
import type {
  DirectiveCatalog,
  NounDirectives,
} from "@/features/directive-catalog/types";
import { isJsonSchema } from "@/features/directive-catalog/schemaExamples";
import { payloadFieldEntityInfo } from "@/features/directive-catalog/identityPicker";
import {
  applyFieldChange,
  buildSchemaPayload,
  deriveSchemaFields,
  humanFormFields,
  splitWarnings,
  type SchemaFieldValue,
} from "@/features/directive-catalog/schemaFields";
import { SchemaFieldsForm } from "@/features/directive-catalog/components/SchemaFieldsForm";
import {
  INLINE_CREATE_REFERENCE_TYPES,
  allTypesToggleLabel,
  referenceTypeDisplayLabel,
  visibleReferenceTypeTokens,
  wireItems,
  type ReferenceDelivery,
  type ReferencePick,
} from "./referencePickerTypes";
import {
  useCommonReferenceTypes,
  useHiddenReferenceTypes,
} from "./useCommonReferenceTypes";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
  const label = referenceTypeDisplayLabel(token);
  // The group is the ONE grouping every type chooser shares (admin chooser
  // bucket → schema display name), never the catalogue's `family`, which is
  // empty for most types and left ~90 of 116 under "Other".
  const family = referenceTypeGroup(token);
  if (token === "file") return { token, label, family, Icon: FileIcon };
  if (token === "url") return { token, label, family, Icon: LinkIcon };
  const info = tryGetEntityInfo(token);
  return { token, label, family, Icon: info?.Icon ?? FileIcon };
}

/** Every type that may be referenced: file + url + the DB-driven pickable set. */
function allTypeOptions(): TypeOption[] {
  const tokens = [...new Set<string>(["file", "url", ...listableTokens()])];
  return tokens.map(typeOption);
}

const isComponentType = (token: string): boolean =>
  isEntityTypeToken(token) && ENTITY_TYPE_METADATA[token].isComponent;

/**
 * The curated tier, resolved against what is actually pickable. A token the
 * registry cannot list is SKIPPED rather than drawn broken, so pruning an
 * entity type can never leave a dead tile in the picker.
 */
function commonTypeOptions(all: TypeOption[], tokens: string[]): TypeOption[] {
  const byToken = new Map(all.map((o) => [o.token, o]));
  return tokens
    .map((t) => byToken.get(t))
    .filter((o): o is TypeOption => Boolean(o));
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
  /** One short line under the label (side effects say what gets inserted). */
  hint?: string;
}

const LINK_ACTION: ActionOption = {
  directiveClass: "reference",
  label: "Link to it",
};

/** Every side effect is inserted as a button that asks before it runs. */
const BUTTON_HINT = "Inserts a button that asks before it runs";

/**
 * The actions the server says this type supports — every one of them real.
 * Order: link, then the writes from least to most destructive.
 */
function actionOptionsFor(noun: NounDirectives | null): ActionOption[] {
  const options: ActionOption[] = [LINK_ACTION];
  if (!noun) return options;
  if (noun.create === "yes") {
    options.push({ directiveClass: "create", label: "Create one", hint: BUTTON_HINT });
  }
  if (noun.update === "yes") {
    options.push({ directiveClass: "update", label: "Update it", hint: BUTTON_HINT });
  }
  if (noun.delete === "yes") {
    options.push({ directiveClass: "delete", label: "Delete it", hint: BUTTON_HINT });
  }
  return options;
}

/** What each action is called — derived from the class, so it is never wrong while loading. */
const ACTION_LABEL: Partial<Record<DirectiveClass, string>> = {
  reference: "Link to it",
  create: "Create one",
  update: "Update it",
  delete: "Delete it",
};

/**
 * The type's catalog row — schemas, title column — from the cached catalog.
 * `enabled: false` fetches nothing (the action list loads only when opened).
 *
 * The effect depends on exactly (enabled, baseUrl, token): its own loading
 * state is NOT a dependency, because an effect that re-runs on its own
 * setState cancels the request it just started and spins forever — the
 * defect this hook replaced (live 2026-09-30: "Loading actions…" never ended).
 */
function useDirectiveNoun(
  token: string,
  enabled = true,
): {
  noun: NounDirectives | null;
  loading: boolean;
  error: string | null;
} {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const [state, setState] = useState<{
    noun: NounDirectives | null;
    loading: boolean;
    error: string | null;
  }>({ noun: null, loading: enabled, error: null });

  useEffect(() => {
    if (!enabled) {
      setState({ noun: null, loading: false, error: null });
      return;
    }
    if (!baseUrl) {
      setState({
        noun: null,
        loading: false,
        error: "No server is configured, so this type's fields cannot be loaded.",
      });
      return;
    }
    let cancelled = false;
    setState({ noun: null, loading: true, error: null });
    loadCatalog(baseUrl)
      .then((catalog) => {
        if (!cancelled) {
          setState({ noun: findNoun(catalog, token), loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            noun: null,
            loading: false,
            error: `Couldn't load this type's fields (${err instanceof Error ? err.message : "unknown error"}).`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, baseUrl, token]);

  return state;
}

// ── Body ────────────────────────────────────────────────────────────────────

export function ReferencePickerBody({
  mode,
  onPicked,
  onCancel,
}: ReferencePickerBodyProps) {
  const all = useMemo(allTypeOptions, []);
  const {
    tokens: commonTokens,
    loading: commonLoading,
    error: commonError,
  } = useCommonReferenceTypes();
  const { tokens: hiddenTokens, loading: hiddenLoading } =
    useHiddenReferenceTypes();
  // The common tier resolves against EVERY type, so an organization that puts
  // a hidden type in its shortcut tier still gets it.
  const common = useMemo(
    () => commonTypeOptions(all, commonTokens),
    [all, commonTokens],
  );
  const visible = useMemo(() => {
    const keep = new Set(
      visibleReferenceTypeTokens(
        all.map((o) => o.token),
        hiddenTokens,
        isComponentType,
      ),
    );
    return all.filter((o) => keep.has(o.token));
  }, [all, hiddenTokens]);

  const [activeType, setActiveType] = useState<TypeOption | null>(null);
  const [delivery, setDelivery] = useState<ReferenceDelivery>(mode);
  const [directiveClass, setDirectiveClassState] =
    useState<DirectiveClass>("reference");
  /** The record an Update will change — chosen by search before the form opens. */
  const [target, setTarget] = useState<{ id: string; title: string | null } | null>(
    null,
  );
  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const setDirectiveClass = (next: DirectiveClass) => {
    setDirectiveClassState(next);
    setTarget(null);
  };

  const finish = (items: object[], title: string | null) => {
    if (!activeType || items.length === 0) return;
    const wire = wireItems(directiveClass, items) as ReferenceItem[];
    const fence = buildDirectiveFence(directiveClass, activeType.token, wire);
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
        all={visible}
        common={common}
        commonLoading={commonLoading || hiddenLoading}
        allSettled={!hiddenLoading}
        commonUnavailable={Boolean(commonError)}
        onChoose={(option) => {
          setDirectiveClass("reference");
          setActiveType(option);
        }}
        onCancel={onCancel}
      />
    );
  }

  const header = {
    type: activeType,
    mode,
    delivery,
    onDeliveryChange: setDelivery,
    directiveClass,
    onDirectiveClassChange: setDirectiveClass,
    onBack: () => {
      setDirectiveClass("reference");
      setActiveType(null);
    },
  };

  // Create has nothing to search for; Update searches first, then opens the form.
  if (directiveClass === "create" || (directiveClass === "update" && target)) {
    return (
      <WriteStep
        {...header}
        target={directiveClass === "update" ? target : null}
        onChangeTarget={() => setTarget(null)}
        onSubmit={finish}
      />
    );
  }

  return (
    <>
      <RecordStep
        {...header}
        onBrowseFiles={() => setFilePickerOpen(true)}
        onPickMany={(items) => {
          const first = items[0] as Record<string, unknown> | undefined;
          const title =
            typeof first?.label === "string" ? (first.label as string) : null;
          if (directiveClass === "update") {
            if (typeof first?.id === "string") setTarget({ id: first.id, title });
            return;
          }
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
  commonLoading,
  allSettled,
  commonUnavailable,
  onChoose,
  onCancel,
}: {
  all: TypeOption[];
  common: TypeOption[];
  /** The curated tier is still being read from the knob. */
  commonLoading: boolean;
  /** The hidden-types knob has answered, so `all.length` is final. */
  allSettled: boolean;
  /** The knob is missing/malformed: run uncurated, with everything expanded. */
  commonUnavailable: boolean;
  onChoose: (option: TypeOption) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  // Uncurated (no knob) means there is no shortcut to collapse BEHIND, so the
  // full grouped list opens by default instead of hiding behind "All types".
  const [showAll, setShowAll] = useState(commonUnavailable);
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
            {commonLoading ? (
              <CommonTierSkeleton />
            ) : (
              <TypeGrid options={common} onChoose={onChoose} />
            )}
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
              {allTypesToggleLabel(all.length, allSettled)}
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

/**
 * The curated tier is one cached knob read (60s TTL), so this is usually a
 * single frame — but it is a real loading state, never a layout jump and never
 * a flash of the uncurated list pretending to be the curated one.
 */
function CommonTierSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
      aria-busy="true"
      aria-label="Loading the types offered first"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[38px] w-full rounded-md" />
      ))}
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

interface StepHeaderProps {
  type: TypeOption;
  mode: ReferenceDelivery;
  delivery: ReferenceDelivery;
  onDeliveryChange: (d: ReferenceDelivery) => void;
  directiveClass: DirectiveClass;
  onDirectiveClassChange: (c: DirectiveClass) => void;
  onBack: () => void;
}

/** What the search step asks for, per action. */
function searchPrompt(
  directiveClass: DirectiveClass,
  delivery: ReferenceDelivery,
  typeLabel: string,
): string {
  const noun = typeLabel.toLowerCase();
  if (directiveClass === "update") return `Choose the ${noun} to update.`;
  if (directiveClass === "delete") return `Choose the ${noun} the button will delete.`;
  return `${delivery === "insert" ? "Insert" : "Copy"} the reference by choosing a ${noun} below.`;
}

function RecordStep({
  onBrowseFiles,
  onPickMany,
  ...header
}: StepHeaderProps & {
  onBrowseFiles: () => void;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const { type, delivery, directiveClass } = header;
  const isEntity = isEntityTypeToken(type.token);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <StepHeader {...header} />

      <p className="text-xs text-muted-foreground">
        {searchPrompt(directiveClass, delivery, type.label)}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ReferenceTypeAdder
          type={type.token}
          onBrowseFiles={onBrowseFiles}
          onPickMany={onPickMany}
        />
      </div>

      {isEntity &&
        directiveClass === "reference" &&
        INLINE_CREATE_REFERENCE_TYPES.has(type.token) && (
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

/** Back, type, Insert/Copy toggle, and the action — shared by both steps. */
function StepHeader({
  type,
  mode,
  delivery,
  onDeliveryChange,
  directiveClass,
  onDirectiveClassChange,
  onBack,
}: StepHeaderProps) {
  const isEntity = isEntityTypeToken(type.token);
  return (
    <div className="flex shrink-0 flex-col gap-3">
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
    </div>
  );
}

// ── Step 2b: the write form (Create / Update) ───────────────────────────────

function WriteStep({
  target,
  onChangeTarget,
  onSubmit,
  ...header
}: StepHeaderProps & {
  /** Update only: the record this button will change. */
  target: { id: string; title: string | null } | null;
  onChangeTarget: () => void;
  onSubmit: (items: object[], title: string | null) => void;
}) {
  const { type, delivery, directiveClass } = header;
  const formMode = directiveClass === "update" ? "update" : "create";
  const { noun, loading, error } = useDirectiveNoun(type.token);
  const [values, setValues] = useState<Record<string, SchemaFieldValue>>({});

  const schema = noun?.schemas?.[directiveClass];
  const fields = useMemo(
    () =>
      noun && isJsonSchema(schema)
        ? humanFormFields(deriveSchemaFields(schema, {
            titleColumn: noun.title_column,
            // The record an update changes was chosen by search; it is not a field.
            exclude: formMode === "update" ? ["id"] : [],
            resolveRecordToken: (key) =>
              payloadFieldEntityInfo(key, noun.noun)?.token ?? null,
          }))
        : [],
    [noun, schema, formMode],
  );

  const built = buildSchemaPayload(
    fields,
    values,
    formMode,
    formMode === "update" && target ? { id: target.id } : {},
  );

  const titleColumn = noun?.title_column ?? null;
  const typedTitle =
    titleColumn && typeof values[titleColumn]?.raw === "string"
      ? (values[titleColumn]!.raw as string).trim()
      : "";

  const submit = () =>
    onSubmit(
      [built.payload],
      formMode === "update" ? (target?.title ?? null) : typedTitle || null,
    );

  const body = (() => {
    if (loading) {
      return (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {error} <ErrorAlchemyMenu error={error} />
        </p>
      );
    }
    if (fields.length === 0) {
      const message = `The server did not publish the fields for this action on ${type.label}, so it cannot be filled in here.`;
      return (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {message} <ErrorAlchemyMenu error={message} />
        </p>
      );
    }
    return (
      <SchemaFieldsForm
        fields={fields}
        values={values}
        mode={formMode}
        warnings={built.warnings}
        onChange={(key, value) =>
          setValues((prev) => applyFieldChange(prev, key, value))
        }
      />
    );
  })();

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <StepHeader {...header} />

      {formMode === "update" && target && (
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <span className="text-muted-foreground">Updating</span>
          <span className="truncate font-medium text-foreground">
            {target.title ?? `this ${type.label.toLowerCase()}`}
          </span>
          <button
            type="button"
            onClick={onChangeTarget}
            className="ml-auto min-h-7 text-muted-foreground hover:text-foreground"
          >
            Change
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{body}</div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border pt-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          {splitWarnings(built.warnings, values).action.map((m) => (
            <p key={m} className="text-xs text-amber-700 dark:text-amber-300">
              {m}
            </p>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-11 lg:h-8"
          disabled={loading || fields.length === 0}
          onClick={submit}
        >
          {delivery === "insert" ? "Insert button" : "Copy button"}
        </Button>
      </div>
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
  const [expanded, setExpanded] = useState(false);
  // Loads only once the list is opened — or already open on a non-link action.
  const {
    noun,
    loading,
    error: loadError,
  } = useDirectiveNoun(token, expanded || directiveClass !== "reference");
  const options: ActionOption[] | null = loading
    ? null
    : loadError
      ? [LINK_ACTION]
      : actionOptionsFor(noun);
  const error = loadError ? `${loadError} Only linking is available.` : null;

  const current: ActionOption = {
    directiveClass,
    label: ACTION_LABEL[directiveClass] ?? LINK_ACTION.label,
  };

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
          {error && <p className="text-amber-700 dark:text-amber-300">{error} <ErrorAlchemyMenu error={error} /></p>}
          {options?.map((o) => (
            <button
              key={o.directiveClass}
              type="button"
              aria-checked={o.directiveClass === directiveClass}
              role="radio"
              onClick={() => {
                onChange(o.directiveClass);
                setExpanded(false);
              }}
              className={cn(
                "flex min-h-9 w-full flex-col items-start justify-center rounded px-1.5 py-1 text-left",
                o.directiveClass === directiveClass
                  ? "bg-primary/10 text-foreground"
                  : "hover:bg-accent",
              )}
            >
              <span>{o.label}</span>
              {o.hint && (
                <span className="text-[11px] text-muted-foreground">{o.hint}</span>
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
      {error && <p className="text-xs text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
    </div>
  );
}
