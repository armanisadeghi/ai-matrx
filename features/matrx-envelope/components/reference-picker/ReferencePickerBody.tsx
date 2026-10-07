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

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  File as FileIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
} from "lucide-react";
import type { DirectiveClass } from "@ai-matrx/content-ir";
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
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
import {
  actionsOf,
  cachedNounActions,
  findCatalogNoun,
  loadDirectiveCatalog,
  peekDirectiveCatalog,
  prefetchDirectiveCatalog,
  type NounActions,
} from "@/features/directive-catalog/catalogCache";
import type { NounDirectives } from "@/features/directive-catalog/types";
import { isJsonSchema } from "@/features/directive-catalog/schemaExamples";
import {
  formTitleColumn,
  payloadFieldEntityInfo,
} from "@/features/directive-catalog/identityPicker";
import {
  applyFieldChange,
  buildSchemaPayload,
  deriveSchemaFields,
  humanFormFields,
  splitWarnings,
  type SchemaFieldValue,
} from "@/features/directive-catalog/schemaFields";
import { valueVocabularyFor } from "@/features/directive-catalog/valueVocabulary";
import { SchemaFieldsForm } from "@/features/directive-catalog/components/SchemaFieldsForm";
import {
  INLINE_CREATE_REFERENCE_TYPES,
  referenceTypeDisplayLabel,
  visibleReferenceTypeTokens,
  wireItems,
  type ReferenceDelivery,
  type ReferencePick,
} from "./referencePickerTypes";
import { TypeStep, type TypeOption } from "./TypeStep";
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

// ── Catalog ─────────────────────────────────────────────────────────────────
// THE shared cache (`features/directive-catalog/catalogCache.ts`): the picker
// starts the load when it opens, and the action list reads the last answer
// synchronously, so "Change…" never waits on a 5–7 s request it already began.

const ALIASES = CATALOG_ALIASES as Readonly<Record<string, string>>;

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
function actionOptionsFor(actions: NounActions | null): ActionOption[] {
  const options: ActionOption[] = [LINK_ACTION];
  if (!actions) return options;
  if (actions.create) {
    options.push({ directiveClass: "create", label: "Create one", hint: BUTTON_HINT });
  }
  if (actions.update) {
    options.push({ directiveClass: "update", label: "Update it", hint: BUTTON_HINT });
  }
  if (actions.delete) {
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
 * The type's catalog row — schemas, title column — from the shared cache.
 * `enabled: false` fetches nothing.
 *
 * `loading` is DERIVED, never a stored flag that an effect flips later: the
 * answer belongs to one (baseUrl, token) request, and until that exact answer
 * is in hand the hook says "loading". A stored flag was `false` for the render
 * between enabling and the effect running, and that one frame printed
 * "Linking is the only action available" for Task (G11A review, 2026-10-07).
 * The effect's own state is not a dependency (live 2026-09-30: an effect that
 * re-ran on its own setState cancelled its request and spun forever).
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
  const requestKey = enabled && baseUrl ? `${baseUrl}|${token}` : null;
  const [answer, setAnswer] = useState<{
    key: string;
    noun: NounDirectives | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !baseUrl || !requestKey) return;
    let cancelled = false;
    loadDirectiveCatalog(baseUrl)
      .then((catalog) => {
        if (!cancelled) {
          setAnswer({ key: requestKey, noun: findCatalogNoun(catalog, token, ALIASES), error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAnswer({
            key: requestKey,
            noun: null,
            error: `Couldn't load this type's fields (${err instanceof Error ? err.message : "unknown error"}).`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, baseUrl, token, requestKey]);

  if (!enabled) return { noun: null, loading: false, error: null };
  if (!baseUrl) {
    return {
      noun: null,
      loading: false,
      error: "No server is configured, so this type's fields cannot be loaded.",
    };
  }
  // Already in this tab: no loading frame at all.
  const loaded = peekDirectiveCatalog(baseUrl);
  if (loaded) return { noun: findCatalogNoun(loaded, token, ALIASES), loading: false, error: null };
  if (answer && answer.key === requestKey) {
    return { noun: answer.noun, loading: false, error: answer.error };
  }
  return { noun: null, loading: true, error: null };
}

/**
 * Which writes a type supports, for the action list: instantly from the cache
 * (this tab's catalog, else the persisted last answer), else loading until the
 * catalog arrives — never a guess stated as fact.
 */
export function useNounActions(
  token: string,
  enabled: boolean,
): { actions: NounActions | null; loading: boolean; error: string | null } {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const cached = baseUrl ? cachedNounActions(baseUrl, token, ALIASES) : undefined;
  // The network is asked only when nothing is cached yet.
  const live = useDirectiveNoun(token, enabled && cached === undefined);
  if (cached !== undefined) return { actions: cached, loading: false, error: null };
  if (!enabled) return { actions: null, loading: true, error: null };
  return {
    actions: live.noun ? actionsOf(live.noun) : null,
    loading: live.loading,
    error: live.error,
  };
}

// ── Body ────────────────────────────────────────────────────────────────────

export function ReferencePickerBody({
  mode,
  onPicked,
  onCancel,
}: ReferencePickerBodyProps) {
  const all = useMemo(allTypeOptions, []);
  // Start the catalog now: by the time a person has chosen a type and opens
  // "Change…", the actions are known (G11A review: 4–8 s of skeletons).
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  useEffect(() => {
    prefetchDirectiveCatalog(baseUrl);
  }, [baseUrl]);
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

export function RecordStep({
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
    // The whole chain is flex-col + min-h-0 so the record list fills the
    // dialog / phone sheet instead of stopping at a fixed height (G10A).
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StepHeader {...header} />

      <p className="shrink-0 text-xs text-muted-foreground">
        {searchPrompt(directiveClass, delivery, type.label)}
      </p>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <ReferenceTypeAdder
          type={type.token}
          onBrowseFiles={onBrowseFiles}
          onPickMany={onPickMany}
          fill
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
          icon={<ArrowLeft />}
          variant="quiet"
          onClick={onBack}
          aria-label="Back to types"
        />
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
            titleColumn: formTitleColumn(noun),
            // The record an update changes was chosen by search; it is not a field.
            exclude: formMode === "update" ? ["id"] : [],
            resolveRecordToken: (key) =>
              payloadFieldEntityInfo(key, noun.noun)?.token ?? null,
            resolveValueVocabulary: (key) => valueVocabularyFor(noun.noun, key),
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

  const titleColumn = noun ? formTitleColumn(noun) : null;
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
          variant="primary"
          type="button"
          disabled={loading || fields.length === 0}
          onClick={submit}
        >
          {delivery === "insert" ? "Insert button" : "Copy button"}
        </Button>
      </div>
    </div>
  );
}

export function ActionRow({
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
  // The picker already started the catalog load when it opened; this reads
  // the answer, or waits for it while the list is open.
  const {
    actions,
    loading,
    error: loadError,
  } = useNounActions(token, expanded || directiveClass !== "reference");
  const options: ActionOption[] | null = loading
    ? null
    : loadError
      ? [LINK_ACTION]
      : actionOptionsFor(actions);
  const error = loadError ? `${loadError} Only linking is available.` : null;

  const current: ActionOption = {
    directiveClass,
    label: ACTION_LABEL[directiveClass] ?? LINK_ACTION.label,
  };

  // The list opens in a popover, never inline (G8B review, 2026-10-02):
  // inline, it pushed the record list ~140px down the moment the actions
  // loaded. Floating, nothing under it moves; while loading it holds the
  // height of the rows it is waiting for.
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">Action:</span>
      <span className="font-medium text-foreground">{current.label}</span>
      <Popover open={expanded} onOpenChange={setExpanded}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            Change…
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-72 max-w-[calc(100vw-2rem)] space-y-0.5 p-1 text-xs"
        >
          {loading &&
            [0, 1, 2].map((n) => <Skeleton key={n} className="h-9 w-full rounded" />)}
          {error && (
            <p className="px-1.5 py-1 text-amber-700 dark:text-amber-300">
              {error} <ErrorAlchemyMenu error={error} />
            </p>
          )}
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
            <p className="px-1.5 py-1 text-muted-foreground">
              Linking is the only action available for this type.
            </p>
          )}
        </PopoverContent>
      </Popover>
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <Button variant="primary" disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
    </div>
  );
}
