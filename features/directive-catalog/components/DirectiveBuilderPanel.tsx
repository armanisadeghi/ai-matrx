"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * DirectiveBuilderPanel — "trigger via a few dropdowns".
 *
 * Pick a verb + noun → see that cell's live state prominently → fill the
 * identity / payload fields → get the canonical Matrx envelope live (copyable).
 *
 *  - reference / view (state "yes"): render the envelope LIVE via the canonical
 *    `MatrxEnvelopeBlock` — the same reference-chip renderer the chat uses, which
 *    resolves the value from Supabase and opens the entity on click. This works
 *    TODAY and is the "test it" payoff.
 *  - create / update (state "yes"): a form generated from the server's item
 *    schema (`SchemaFieldsForm`; a JSON view stays one click away) + Execute runs it via
 *    `POST /directives/execute` (the Plane-1 writer, as the user / RLS) and shows the
 *    per-item receipts. Idempotent by content key; `force` opts out. delete is soft
 *    (planned) → disabled; non-"yes" writes are disabled. We NEVER write Supabase
 *    directly — the server is the only write path.
 */

import { useMemo, useState } from "react";
import { Check, Copy, Loader2, Play, Search } from "lucide-react";
import { toast } from "@/lib/toast";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { OptionCombobox } from "@/components/official/option-combobox/OptionCombobox";
import {
  buildDirectiveSlug,
  buildKindDirective,
  nounLabel as directiveNounLabel,
  parseDirectiveSlug,
  tryDecodeDirectiveContent,
} from "@ai-matrx/content-ir";
import { describeJsonParseError } from "@ai-matrx/kit/json-format";
import {
  askDirective,
  matrxDirectiveNouns,
} from "@/features/matrx-envelope/directiveHost";
import {
  alreadyApplied,
  blockKey,
  clearBuilderOutcome,
  getBuilderRun,
  runBuilder,
  useBuilderRun,
} from "@/features/directive-catalog/builderRunStore";
import { executeResultHeadline } from "@/features/directive-catalog/executeResult";
import { wordServerFieldNames } from "@/features/matrx-envelope/directiveFailureWords";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { getReferenceResolver } from "@/features/matrx-envelope/referenceResolvers";
import { StateBadge } from "@/features/directive-catalog/components/StateCell";
import { executeDirective } from "@/features/directive-catalog/service";
import { useNounSchemas } from "@/features/directive-catalog/hooks/useNounSchemas";
import { valueVocabularyFor } from "@/features/directive-catalog/valueVocabulary";
import {
  buildDirectiveEnvelope,
  isReferenceVerb,
  referenceFieldsForSpecs,
  refFieldsForNoun,
} from "@/features/directive-catalog/buildEnvelope";
import {
  formTitleColumn,
  identityFieldPickerInfo,
  payloadFieldEntityInfo,
} from "@/features/directive-catalog/identityPicker";
import {
  applyFieldChange,
  buildSchemaPayload,
  deriveSchemaFields,
  splitWarnings,
  valuesFromPayload,
  type SchemaFieldValue,
} from "@/features/directive-catalog/schemaFields";
import { SchemaFieldsForm } from "@/features/directive-catalog/components/SchemaFieldsForm";
import {
  buildSchemaExample,
  isJsonSchema,
} from "@/features/directive-catalog/schemaExamples";
import { useOpenDirectiveReferencePickerWindow } from "@/features/overlays/openers/directiveReferencePickerWindow";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { fetchEntityTitles } from "@/features/scopes/service/entityTitles";
import {
  cellState,
  DIRECTIVE_VERBS,
  directiveVerbWord,
  isDirectiveVerb,
  type DirectiveCatalog,
  type DirectiveReceipt,
  type DirectiveState,
  type DirectiveVerb,
  type NounDirectives,
} from "@/features/directive-catalog/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { humanizeBackendError, stripTerminalCodes } from "@/utils/errors";
import {
  commonNounTokens,
  nounHint,
  nounLabel,
  nounOptionGroups,
} from "@/features/directive-catalog/nounOptions";
import { useCommonReferenceTypes } from "@/features/matrx-envelope/components/reference-picker/useCommonReferenceTypes";
import { BackendApiError } from "@/lib/api/errors";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { isUuidShape } from "@ai-matrx/kit/uuid";

const RECEIPT_PILL: Record<DirectiveReceipt["status"], string> = {
  applied: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  already_applied: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  not_implemented: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

/** The run button says what it does; a server-added verb falls back to "Execute". */
const VERB_BUTTON: Partial<Record<DirectiveVerb, string>> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
};

/** The verb and noun pickers share one geometry. */
const PICKER_GEOMETRY = "h-11 text-base lg:h-8 lg:text-sm";

/** A cell state as words a person reads in a sentence. */
const STATE_WORDS: Record<DirectiveState, string> = {
  yes: "wired",
  planned: "planned",
  no: "not available",
};

/**
 * Error text as it arrives from the server can carry terminal colour codes and
 * a full ORM dump. Show the readable sentence; keep the cleaned full text one
 * click away and in the ErrorAlchemyMenu.
 */
function PanelError({
  raw,
  headline: given,
  titleColumn = null,
  recordLabel = null,
}: {
  raw: string;
  headline?: string;
  /** The form's title column: a refused field is named as the form names it. */
  titleColumn?: string | null;
  /** The type's name ("Task") — the form's word for the record field `id`. */
  recordLabel?: string | null;
}) {
  const clean = stripTerminalCodes(raw).trim();
  // The server's own sentence first (humanized: colour codes and ORM dumps
  // removed); its generic status line only when there is no sentence at all.
  // Until 2026-10-02 aidream sent "Bad request. Please check your input." as
  // `user_message` with the real reason in `message` — preferring the status
  // line hid "Nothing was applied — id is required." behind it.
  // A field the server refused is named as the form names it ("Title is
  // required", never "name is required" — G10B review, 2026-10-02).
  const headline = wordServerFieldNames(
    humanizeBackendError(clean) ??
      ((given ? stripTerminalCodes(given).trim() : "") || clean),
    titleColumn,
    recordLabel,
  );
  const hasDetail = clean.length > 0 && clean !== headline;
  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs"
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 break-words text-red-600 dark:text-red-400">
          {headline}
        </span>
        <ErrorAlchemyMenu error={clean} size="xs" />
      </div>
      {hasDetail && (
        <details className="min-w-0">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Technical detail
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/80 p-1.5 font-mono text-[11px] text-muted-foreground">
            {clean}
          </pre>
        </details>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DirectiveReceipt["status"] }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        RECEIPT_PILL[status],
      )}
    >
      {humanizeIdentifier(status) || status}
    </span>
  );
}

/** A request from outside (the grid) to load one noun into the builder. */
export interface DirectiveBuilderPick {
  noun: string;
  verb?: DirectiveVerb;
  /** Bumped per request so picking the same noun twice still applies. */
  nonce: number;
}

export function DirectiveBuilderPanel({
  catalog,
  pick = null,
}: {
  catalog: DirectiveCatalog;
  pick?: DirectiveBuilderPick | null;
}) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const verbs = DIRECTIVE_VERBS.filter(isDirectiveVerb);
  const nouns = catalog.nouns;
  const nounByToken = useMemo(
    () => new Map(nouns.map((n) => [n.noun, n] as const)),
    [nouns],
  );

  // A panel that mounts while a run is held (a re-render mid-run, or coming
  // back) opens on that run's verb and type, so its outcome is on screen.
  const [heldRun] = useState(() => parseDirectiveSlug(getBuilderRun().slug));
  const initialVerb: DirectiveVerb =
    heldRun && isDirectiveVerb(heldRun.directiveClass)
      ? heldRun.directiveClass
      : (verbs[0] ?? "reference");
  const [verb, setVerb] = useState<DirectiveVerb>(initialVerb);
  // No default noun: any pick made for the admin is a guess (nounOptions.ts).
  const [nounName, setNounName] = useState<string>(heldRun?.noun ?? "");
  // The same knob-driven "common types first" tier the reference picker shows.
  const { tokens: commonKnobTokens } = useCommonReferenceTypes();
  const commonNouns = useMemo(
    () => commonNounTokens(nouns, commonKnobTokens),
    [nouns, commonKnobTokens],
  );
  const nounGroups = useMemo(
    () => nounOptionGroups(nouns, verb, commonNouns),
    [nouns, verb, commonNouns],
  );
  const [fields, setFields] = useState<Record<string, string>>({});
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>(
    {},
  );
  const [copied, setCopied] = useState(false);
  // Bumping this commits the current fields into a live-rendered envelope.
  const [renderNonce, setRenderNonce] = useState(0);
  // Write-verb state.
  const [writePayload, setWritePayload] = useState("");
  // The same answers the reference picker's Create/Update form holds.
  const [payloadValues, setPayloadValues] = useState<
    Record<string, SchemaFieldValue>
  >({});
  const [payloadView, setPayloadView] = useState<"fields" | "json">("fields");
  /** Why the last Fields/JSON switch did less than asked — shown inline. */
  const [viewNote, setViewNote] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  // The run lives OUTSIDE the panel (builderRunStore): a re-render or remount
  // mid-run never loses it, and its outcome shows on return (G18 review).
  const run = useBuilderRun();
  const { executing, sentTitle } = run;
  const result = run.result;
  const execError = run.error;
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  /** Values to load into the next verb's form once its fields exist. */
  const [pendingPayload, setPendingPayload] = useState<Record<
    string,
    unknown
  > | null>(null);

  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const openReferencePicker = useOpenDirectiveReferencePickerWindow();

  const noun: NounDirectives | undefined = nounByToken.get(nounName);
  // The catalog summary carries no schemas: a write verb loads its ONE noun's
  // (`GET /directives/catalog/{noun}`, lane G12).
  const nounSchemas = useNounSchemas(
    noun && !isReferenceVerb(verb) ? noun.noun : null,
  );

  const state: DirectiveState | null = noun ? cellState(noun, verb) : null;
  const isReference = isReferenceVerb(verb);
  const fieldSpecs = useMemo(
    () => (isReference && nounName ? refFieldsForNoun(nounName, noun) : []),
    [isReference, nounName, noun],
  );
  const currentReferenceFields = useMemo(
    () => referenceFieldsForSpecs(fieldSpecs, fields),
    [fieldSpecs, fields],
  );
  const exampleReferenceFields = useMemo(
    () => referenceFieldsForSpecs(fieldSpecs, fields, nounName),
    [fieldSpecs, fields, nounName],
  );
  const writePayloadPlaceholder = useMemo(() => {
    const schema = nounSchemas.schemas?.[verb];
    if (!isJsonSchema(schema)) {
      return '{\n  "field": "value"\n}';
    }
    return JSON.stringify(buildSchemaExample(schema, "minimum"), null, 2);
  }, [nounSchemas.schemas, verb]);

  // The write payload, parsed. A reference has no payload (its ids drive it).
  // `error` is null when valid; `value` is always an object (empty on error).
  const parsed = useMemo<{
    value: Record<string, unknown>;
    error: string | null;
  }>(() => {
    if (isReference) return { value: {}, error: null };
    const text = writePayload.trim();
    if (text.length === 0) return { value: {}, error: null };
    try {
      const v: unknown = JSON.parse(text);
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        return {
          value: {},
          error: "Payload must be a JSON object (the row's fields).",
        };
      }
      return { value: v as Record<string, unknown>, error: null };
    } catch (e) {
      // A line and a column in one sentence — never the engine's
      // "at position 42" (reviewer, 2026-10-02).
      return { value: {}, error: describeJsonParseError(text, e).sentence };
    }
  }, [isReference, writePayload]);

  // The form generated from the server's item schema for this verb + noun.
  const writeFields = useMemo(() => {
    const schema = nounSchemas.schemas?.[verb];
    if (isReference || !noun || !isJsonSchema(schema)) return [];
    return deriveSchemaFields(schema, {
      titleColumn: formTitleColumn(noun),
      resolveRecordToken: (key) =>
        payloadFieldEntityInfo(key, noun.noun)?.token ?? null,
      resolveValueVocabulary: (key) => valueVocabularyFor(noun.noun, key),
    });
  }, [isReference, noun, verb, nounSchemas.schemas]);
  // No published schema → the JSON view is the only editor, and only offered
  // where Execute can run it; elsewhere one line says why there is no form.
  const noSchema = !isReference && writeFields.length === 0;
  const effectiveView = noSchema ? "json" : payloadView;
  const builtPayload = useMemo(
    () =>
      buildSchemaPayload(
        writeFields,
        payloadValues,
        verb === "update" ? "update" : "create",
      ),
    [writeFields, payloadValues, verb],
  );

  const switchPayloadView = (next: "fields" | "json") => {
    if (next === effectiveView) return;
    if (next === "json") {
      setWritePayload(JSON.stringify(builtPayload.payload, null, 2));
      setViewNote(null);
    } else if (parsed.error === null) {
      const known = new Set(writeFields.map((f) => f.key));
      const unknown = Object.keys(parsed.value).filter((k) => !known.has(k));
      setViewNote(
        unknown.length > 0
          ? `Not in this schema, so not sent from Fields: ${unknown.join(", ")}`
          : null,
      );
      setPayloadValues(valuesFromPayload(writeFields, parsed.value));
    } else {
      setViewNote("Fix the JSON below to switch to Fields.");
      return;
    }
    setPayloadView(next);
  };

  // What Execute sends: the form's payload, or the JSON view's.
  const effectivePayload =
    effectiveView === "fields" ? builtPayload.payload : parsed.value;
  const payloadError = effectiveView === "json" ? parsed.error : null;
  const payloadOk = payloadError === null;

  const envelope = useMemo(() => {
    if (!nounName) return null;
    if (isReference)
      return buildDirectiveEnvelope(verb, nounName, currentReferenceFields);
    return buildKindDirective(
      buildDirectiveSlug(verb, nounName),
      payloadOk ? [effectivePayload] : [],
    );
  }, [
    verb,
    nounName,
    isReference,
    currentReferenceFields,
    payloadOk,
    effectivePayload,
  ]);

  const displayedEnvelope = useMemo(() => {
    if (!nounName || !isReference) return envelope;
    return buildDirectiveEnvelope(verb, nounName, exampleReferenceFields);
  }, [nounName, isReference, envelope, verb, exampleReferenceFields]);

  const setField = (key: string, value: string, label?: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSelectedLabels((prev) => {
      const next = { ...prev };
      if (label) next[key] = label;
      else delete next[key];
      return next;
    });
  };

  // A new noun or verb is a new schema: the generated form is the default
  // editor again (a JSON view chosen for the previous one never carries over).
  const handleNounChange = (nextNoun: string) => {
    setNounName(nextNoun);
    setFields({});
    setSelectedLabels({});
    setRenderNonce(0);
    clearBuilderOutcome();
    setWritePayload("");
    setPayloadValues({});
    setPayloadView("fields");
    setViewNote(null);
  };

  const handleVerbChange = (nextVerb: DirectiveVerb) => {
    setVerb(nextVerb);
    setRenderNonce(0);
    clearBuilderOutcome();
    setWritePayload("");
    setPayloadValues({});
    setPayloadView("fields");
    setViewNote(null);
  };

  // The grid asked for a noun: apply it once per request (render-time state
  // adjustment, no effect).
  const [appliedPickNonce, setAppliedPickNonce] = useState<number | null>(null);
  if (pick && pick.nonce !== appliedPickNonce && nounByToken.has(pick.noun)) {
    setAppliedPickNonce(pick.nonce);
    if (pick.verb && pick.verb !== verb) handleVerbChange(pick.verb);
    if (pick.noun !== nounName) handleNounChange(pick.noun);
  }

  // "Update it" / "Delete it" on a receipt: same type, next verb, the written
  // record already chosen — a create → update → delete walk is three clicks.
  const continueWith = (nextVerb: DirectiveVerb, id: string) => {
    if (!id) return;
    const title = sentTitle;
    handleVerbChange(nextVerb);
    setPendingPayload({ id });
    setPendingTitle(title);
  };
  if (pendingPayload && writeFields.length > 0) {
    const values = valuesFromPayload(writeFields, pendingPayload);
    if (values.id) values.id = { ...values.id, recordTitle: pendingTitle };
    setPayloadValues(values);
    setPendingPayload(null);
  }

  const chooseIdentity = async (
    fieldKey: string,
    picker: NonNullable<ReturnType<typeof identityFieldPickerInfo>>,
  ) => {
    if (picker.token === "file") {
      const ids = await openFilePicker({
        multi: false,
        title: `Choose ${picker.label}`,
      });
      const id = ids?.[0];
      if (!id) return;
      const titles = await fetchEntityTitles(picker.token, [id]);
      setField(fieldKey, id, titles.get(id) ?? picker.label);
      setRenderNonce((n) => n + 1);
      return;
    }
    openReferencePicker({
      entityToken: picker.token,
      fieldKey,
      title: `Choose ${picker.label}`,
      onPicked: (event) => {
        setField(fieldKey, event.id, event.title);
        setRenderNonce((n) => n + 1);
      },
    });
  };

  // An update/delete with no record chosen says so beside its button.
  const recordField = writeFields.find((f) => f.key === "id");
  const missingRecord =
    (verb === "update" || verb === "delete") &&
    effectiveView === "fields" &&
    recordField &&
    !(payloadValues.id?.touched && typeof payloadValues.id.raw === "string" && payloadValues.id.raw)
      ? `Choose ${/^[aeiou]/i.test(recordField.label) ? "an" : "a"} ${recordField.label.toLowerCase()}`
      : null;

  // A write verb executes exactly when the catalog says the cell is wired —
  // the server's registration is the only authority (no verb allowlist here).
  const canExecute =
    !isReference && state === "yes" && payloadOk && !!baseUrl && !executing;

  const handleExecute = async () => {
    if (!canExecute || !nounName) return;
    const slug = `directive_v${catalog.directive_version}_${verb}_${nounName}`;
    const items = [effectivePayload];
    const key = blockKey(slug, items);
    // THE CARD'S RULE: a block that already applied asks "This already ran
    // once." and a yes runs it again (`force`) — never a silent dedup (G18).
    const again = alreadyApplied(key);
    // A WRITE STATES ITS CONSEQUENCE FIRST (reviewer, 2026-10-02: Create and
    // Delete ran on one click). The SAME question an action card asks
    // (`askDirective` → `directiveConsequenceDialog`), in the admin's words.
    const directive = tryDecodeDirectiveContent({ __kind: slug, items });
    if (directive) {
      const ok = await askDirective(
        {
          directive,
          items: directive.items,
          nounLabel: directiveNounLabel(directive.noun, matrxDirectiveNouns),
          ...(again ? { again: true } : {}),
        },
        { surface: "admin" },
      );
      if (!ok) return;
    }
    const titleKey = noun ? formTitleColumn(noun) : null;
    const sent = titleKey ? effectivePayload[titleKey] : undefined;
    // A delete/update names its record by the one chosen in the form.
    const chosen = payloadValues.id?.recordTitle ?? null;
    const title = typeof sent === "string" && sent.trim() ? sent : chosen;
    const recordWord = noun ? nounLabel(noun) : null;
    const done = await runBuilder(
      slug,
      key,
      title,
      // The result panel below says what happened, in the receipts' own terms;
      // a toast repeating it was the second, wrong, copy.
      () => executeDirective(baseUrl, { directive: slug, items, force: force || again }),
      (e) => {
        // A server refusal carries a sentence written for a person
        // (`user_message`) and a technical `detail`; show the first, keep the
        // second one click away. Terminal colour codes never reach the screen.
        const raw =
          e instanceof BackendApiError
            ? e.detail
            : e instanceof Error
              ? e.message
              : "Execute failed";
        const headline = e instanceof BackendApiError ? e.userMessage : undefined;
        return { raw, headline };
      },
    );
    if (done.error) {
      toast.error(
        wordServerFieldNames(
          humanizeBackendError(stripTerminalCodes(done.error.raw)) ??
            stripTerminalCodes(done.error.headline ?? done.error.raw),
          noun ? formTitleColumn(noun) : null,
          recordWord,
        ),
      );
    }
  };

  // Live render is only meaningful for a reference/view whose type resolves and
  // whose required UUID ids are present + valid.
  const hasResolver = !!(nounName && getReferenceResolver(nounName));
  const requiredFilled = fieldSpecs.every((f) => {
    const raw = fields[f.key];
    const v = raw === undefined ? "" : raw.trim();
    if (v.length === 0) return false;
    if (f.uuid && !isUuidShape(v)) return false;
    return true;
  });
  const canLiveRender =
    isReference && state === "yes" && hasResolver && requiredFilled;

  const handleCopy = async () => {
    if (!displayedEnvelope) return;
    if (!(await copyText(
      JSON.stringify(displayedEnvelope, null, 2), "Envelope copied",
    ))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // The envelope is the OUTPUT: a reference shows it under the record it
  // names; a write shows it under the form that fills it.
  const envelopeBlock = displayedEnvelope ? (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Matrx envelope {requiredFilled || !isReference ? "" : "example"}
        </span>
        <Button
          icon={copied ? (
            <Check />
          ) : (
            <Copy />
          )}
          type="button"
          variant="quiet"
          onClick={handleCopy}
        >
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">
        {JSON.stringify(displayedEnvelope, null, 2)}
      </pre>
    </div>
  ) : null;

  return (
    // Phone: natural height, FIRST in the page's one scroll area (the page's
    // scroll owner carries the floating-chip runway). lg: its own scrolling pane.
    <div className="flex flex-col gap-3 p-3 lg:h-full lg:overflow-y-auto">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AGENT_ICON className="h-4 w-4 text-primary" />
        Build &amp; test an action
      </div>

      {/* The two dimensions */}
      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Verb</label>
          {/* ONE control geometry for both pickers (G18 review: the verb was a
              short pill beside a tall noun box). */}
          <OptionCombobox
            value={verb}
            onChange={(value) => {
              if (isDirectiveVerb(value)) handleVerbChange(value);
            }}
            options={verbs}
            getLabel={directiveVerbWord}
            searchable={false}
            ariaLabel="Directive verb"
            className={PICKER_GEOMETRY}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Noun</label>
          <OptionCombobox
            value={nounName}
            onChange={handleNounChange}
            groups={nounGroups}
            getLabel={(token) => {
              const n = nounByToken.get(token);
              return n ? nounLabel(n) : token;
            }}
            getHint={(token) => {
              const n = nounByToken.get(token);
              if (!n) return null;
              const hint = nounHint(n);
              // The common tier mixes states; the other groups' headings say it.
              const s = cellState(n, verb);
              if (s === "yes" || !commonNouns.includes(token)) return hint;
              return [STATE_WORDS[s], hint].filter(Boolean).join(" · ");
            }}
            placeholder="Choose a type"
            searchPlaceholder={`Search ${nouns.length.toLocaleString()} types…`}
            ariaLabel="Directive noun"
            className={PICKER_GEOMETRY}
          />
        </div>
      </div>

      {!noun && (
        <p className="text-xs text-muted-foreground">
          Choose a type to build an action.
        </p>
      )}

      {/* Prominent availability read-out */}
      {noun && state && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="min-w-0 break-words text-sm text-foreground">
              <span className="font-semibold">{directiveVerbWord(verb)}</span>{" "}
              <span className="text-muted-foreground">·</span>{" "}
              <span className="font-semibold">{nounLabel(noun)}</span>
            </span>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {noun.noun} · {noun.table}
            </span>
          </div>
          <StateBadge state={state} />
        </div>
      )}

      {/* Identity fields (reference/view) */}
      {isReference && fieldSpecs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
          <span className="text-xs font-medium text-muted-foreground">
            Identity
          </span>
          {fieldSpecs.map((f) => {
            const raw = fields[f.key];
            const value = raw === undefined ? "" : raw;
            const picker = noun
              ? identityFieldPickerInfo(noun, fieldSpecs, f.key)
              : null;
            const selectedLabel = selectedLabels[f.key];
            const invalid =
              f.uuid && value.trim().length > 0 && !isUuidShape(value.trim());
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {f.label}
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={value}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={
                      picker
                        ? `Choose ${picker.label.toLowerCase()} or paste its id`
                        : "Paste the record's id"
                    }
                    className="min-w-0 flex-1" mono aria-invalid={invalid}
                  />
                  {picker ? (
                    <Button
                      icon={<Search />}
                      type="button"
                      variant="primary"
                      className="shrink-0"
                      onClick={() => void chooseIdentity(f.key, picker)}
                      aria-label={`Search ${picker.labelPlural} for ${f.label}`}
                    >
                      Select
                    </Button>
                  ) : null}
                </div>
                {picker && selectedLabel && value.trim() ? (
                  <EntityRef
                    token={picker.token}
                    id={value.trim()}
                    name={selectedLabel}
                    openInNewTab
                    alwaysShowActions
                    className="text-xs"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {isReference && envelopeBlock}

      {/* Action area: live render for reads, execute for writes */}
      {!noun ? null : isReference ? (
        <div className="flex flex-col gap-2">
          {state === "yes" && (
            <Button
              icon={<Play />}
              variant="primary"
              type="button"
              disabled={!canLiveRender}
              onClick={() => setRenderNonce((n) => n + 1)}
              className="w-fit"
            >
              Render live
            </Button>
          )}
          {state !== "yes" && (
            <p className="text-xs text-muted-foreground">
              Only wired types render live.
            </p>
          )}
          {state === "yes" && !requiredFilled && (
            <p className="text-xs text-muted-foreground">
              Choose the record above to render it live.
            </p>
          )}
          {canLiveRender && renderNonce > 0 && envelope && (
            <div className="rounded-md border border-border bg-card p-3">
              <span className="mb-2 block text-xs font-medium text-muted-foreground">
                Live result
              </span>
              <MatrxEnvelopeBlock
                key={`${nounName}:${renderNonce}`}
                content={envelope}
              />
            </div>
          )}
        </div>
      ) : state === "no" ? (
        // Nothing to fill in and nothing to run — no dead editor, no dead button.
        <p className="text-xs text-muted-foreground">
          Not available for this verb.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Payload — the row's fields (shape mirrors the table). A planned
              type with no published field list has nothing to fill in: one
              state line, no empty heading, no raw JSON box. */}
          {nounSchemas.loading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-md" />
              ))}
            </div>
          ) : nounSchemas.error ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {nounSchemas.error} <ErrorAlchemyMenu error={nounSchemas.error} />
            </p>
          ) : noSchema && state !== "yes" ? (
            <p className="text-xs text-muted-foreground">
              Planned — no field list published yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  The record&apos;s fields
                </span>
                {writeFields.length > 0 && (
                  <div
                    role="radiogroup"
                    aria-label="Payload editor"
                    className="ml-auto flex rounded-md border border-border p-0.5 text-xs"
                  >
                    {(["fields", "json"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={effectiveView === v}
                        onClick={() => switchPayloadView(v)}
                        className={cn(
                          "min-h-7 rounded px-2",
                          effectiveView === v
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {v === "fields" ? "Fields" : "JSON"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {noSchema && (
                <p className="text-xs text-muted-foreground">
                  No field list published — write it as JSON.
                </p>
              )}
              {viewNote && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {viewNote}
                </p>
              )}
              {effectiveView === "fields" ? (
                <SchemaFieldsForm
                  fields={writeFields}
                  values={payloadValues}
                  mode={verb === "update" ? "update" : "create"}
                  warnings={builtPayload.warnings}
                  onChange={(key, value) => {
                    // Inputs changed: an old error no longer applies (G18).
                    clearBuilderOutcome();
                    setPayloadValues((prev) =>
                      applyFieldChange(prev, key, value),
                    );
                  }}
                />
              ) : (
                <>
                  <Textarea
                    value={writePayload}
                    onChange={(e) => {
                      clearBuilderOutcome();
                      setWritePayload(e.target.value);
                    }}
                    spellCheck={false}
                    className={cn(
                      "min-h-[120px] font-mono text-base lg:text-xs",
                      payloadError &&
                        "border-red-500 focus-visible:ring-red-500",
                    )}
                    placeholder={writePayloadPlaceholder}
                  />
                  {payloadError && <PanelError raw={payloadError} />}
                </>
              )}
            </div>
          )}

          {state === "yes" && (
            <>
              <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={force}
                  onCheckedChange={(v) => {
                    clearBuilderOutcome();
                    setForce(v === true);
                  }}
                />
                Force — apply even if it already ran
              </label>

              {effectiveView === "fields" &&
                splitWarnings(builtPayload.warnings, payloadValues).action.map(
                  (m) => (
                    <p
                      key={m}
                      className="text-xs text-amber-700 dark:text-amber-300"
                    >
                      {m}
                    </p>
                  ),
                )}
              <div className="flex items-center gap-2">
                <Button
                  icon={executing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Play />
                  )}
                  type="button"
                  // A delete looks like one before the click, not only in
                  // its confirm (reviewer, 2026-10-02: it was blue).
                  variant={verb === "delete" ? "danger" : "primary"}
                  disabled={!canExecute}
                  onClick={() => void handleExecute()}
                  className="w-fit"
                >
                  {VERB_BUTTON[verb] ?? "Execute"}
                </Button>
                {missingRecord ? (
                  // Said beside the button, never only after a failed run.
                  <span
                    className="text-xs text-amber-700 dark:text-amber-300"
                    data-builder-missing-record=""
                  >
                    {missingRecord}
                  </span>
                ) : verb === "delete" ? (
                  <span className="text-xs text-muted-foreground">
                    Moves the record to trash.
                  </span>
                ) : null}
              </div>
            </>
          )}

          {state === "planned" && !noSchema && (
            <p className="text-xs text-muted-foreground">
              Planned — copy the envelope; it can&apos;t run yet.
            </p>
          )}

          {execError && (
            <PanelError
              raw={execError.raw}
              headline={execError.headline}
              titleColumn={noun ? formTitleColumn(noun) : null}
              recordLabel={noun ? nounLabel(noun) : null}
            />
          )}

          {result && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <span
                className="text-xs font-medium text-muted-foreground"
                data-execute-headline=""
              >
                {executeResultHeadline(result)}
              </span>
              {result.receipts.map((r, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-0.5 rounded border border-border bg-muted px-2 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <StatusPill status={r.status} />
                    <span className="font-mono text-muted-foreground">
                      {r.directive_class}:{r.noun}
                    </span>
                  </div>
                  {r.summary && (
                    <span className="break-words text-foreground">
                      {stripTerminalCodes(r.summary)}
                    </span>
                  )}
                  {r.resource_ids !== undefined &&
                    r.resource_ids.length > 0 &&
                    (() => {
                      // A written record opens — never a bare id.
                      const info = payloadFieldEntityInfo("id", r.noun);
                      const ids = r.resource_ids;
                      return info ? (
                        <div className="flex flex-wrap gap-1">
                          {ids.map((id) => (
                            <EntityRef
                              key={id}
                              token={info.token}
                              id={id}
                              name={sentTitle ?? undefined}
                              openInNewTab
                              className="text-xs"
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="break-all font-mono text-muted-foreground">
                          id: {ids.join(", ")}
                        </span>
                      );
                    })()}
                  {r.error && (
                    <PanelError
                      raw={r.error}
                      titleColumn={noun ? formTitleColumn(noun) : null}
                      recordLabel={noun ? nounLabel(noun) : null}
                    />
                  )}
                  {r.status !== "failed" &&
                    verb !== "delete" &&
                    r.resource_ids?.length === 1 &&
                    noun &&
                    (["update", "delete"] as const).filter(
                      (v) => v !== verb && cellState(noun, v) === "yes",
                    ).length > 0 && (
                      <div className="flex gap-1 pt-1">
                        {(["update", "delete"] as const)
                          .filter(
                            (v) => v !== verb && cellState(noun, v) === "yes",
                          )
                          .map((v) => (
                            <Button
                              key={v}
                              type="button"
                              variant="outline"
                              onClick={() =>
                                continueWith(v, r.resource_ids?.[0] ?? "")
                              }
                            >
                              {v === "update" ? "Update it" : "Delete it"}
                            </Button>
                          ))}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}

          {envelopeBlock}
        </div>
      )}
    </div>
  );
}
