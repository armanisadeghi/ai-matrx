"use client";

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
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { OptionCombobox } from "@/components/official/option-combobox/OptionCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildDirectiveSlug,
  buildKindDirective,
} from "@ai-matrx/content-ir";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { getReferenceResolver } from "@/features/matrx-envelope/referenceResolvers";
import { StateBadge } from "@/features/directive-catalog/components/StateCell";
import { executeDirective } from "@/features/directive-catalog/service";
import {
  buildDirectiveEnvelope,
  isReferenceVerb,
  referenceFieldsForSpecs,
  refFieldsForNoun,
} from "@/features/directive-catalog/buildEnvelope";
import {
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
  isDirectiveVerb,
  type DirectiveApplyResult,
  type DirectiveCatalog,
  type DirectiveReceipt,
  type DirectiveState,
  type DirectiveVerb,
  type NounDirectives,
} from "@/features/directive-catalog/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { humanizeBackendError, stripTerminalCodes } from "@/utils/errors";
import {
  defaultNounFor,
  nounHint,
  nounLabel,
  nounOptionGroups,
} from "@/features/directive-catalog/nounOptions";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { isUuidShape } from "@ai-matrx/kit/uuid";

const RECEIPT_PILL: Record<DirectiveReceipt["status"], string> = {
  applied: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  already_applied: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  not_implemented: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

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
function PanelError({ raw }: { raw: string }) {
  const clean = stripTerminalCodes(raw).trim();
  const headline = humanizeBackendError(clean) ?? clean;
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
      {status.replace(/_/g, " ")}
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
  const verbs = DIRECTIVE_VERBS.filter(isDirectiveVerb);
  const nouns = catalog.nouns;
  const nounByToken = useMemo(
    () => new Map(nouns.map((n) => [n.noun, n] as const)),
    [nouns],
  );

  const initialVerb: DirectiveVerb = verbs[0] ?? "reference";
  const [verb, setVerb] = useState<DirectiveVerb>(initialVerb);
  const [nounName, setNounName] = useState<string>(() =>
    defaultNounFor(nouns, initialVerb),
  );
  const nounGroups = useMemo(
    () => nounOptionGroups(nouns, verb),
    [nouns, verb],
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
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<DirectiveApplyResult | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const openReferencePicker = useOpenDirectiveReferencePickerWindow();

  const noun: NounDirectives | undefined = nounByToken.get(nounName);

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
    const schema = noun?.schemas?.[verb];
    if (!isJsonSchema(schema)) {
      return '{\n  "field": "value"\n}';
    }
    return JSON.stringify(buildSchemaExample(schema, "minimum"), null, 2);
  }, [noun, verb, nounName]);

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
      return {
        value: {},
        error: e instanceof Error ? e.message : "Invalid JSON",
      };
    }
  }, [isReference, writePayload]);

  // The form generated from the server's item schema for this verb + noun.
  const writeFields = useMemo(() => {
    const schema = noun?.schemas?.[verb];
    if (isReference || !noun || !isJsonSchema(schema)) return [];
    return deriveSchemaFields(schema, {
      titleColumn: noun.title_column,
      resolveRecordToken: (key) =>
        payloadFieldEntityInfo(key, noun.noun)?.token ?? null,
    });
  }, [isReference, noun, verb]);
  // No published schema → the JSON view is the only honest editor.
  const effectiveView = writeFields.length === 0 ? "json" : payloadView;
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
    setResult(null);
    setExecError(null);
    setWritePayload("");
    setPayloadValues({});
    setPayloadView("fields");
    setViewNote(null);
  };

  const handleVerbChange = (nextVerb: DirectiveVerb) => {
    setVerb(nextVerb);
    setRenderNonce(0);
    setResult(null);
    setExecError(null);
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
      return;
    }
    openReferencePicker({
      entityToken: picker.token,
      fieldKey,
      title: `Choose ${picker.label}`,
      onPicked: (event) => setField(fieldKey, event.id, event.title),
    });
  };

  // A write verb executes exactly when the catalog says the cell is wired —
  // the server's registration is the only authority (no verb allowlist here).
  const canExecute =
    !isReference && state === "yes" && payloadOk && !!baseUrl && !executing;

  const handleExecute = async () => {
    if (!canExecute || !nounName) return;
    setExecuting(true);
    setExecError(null);
    setResult(null);
    try {
      const res = await executeDirective(baseUrl, {
        directive: `directive_v${catalog.directive_version}_${verb}_${nounName}`,
        items: [effectivePayload],
        force,
      });
      setResult(res);
      if (res.failed === 0) toast.success(`Applied ${res.applied} item(s)`);
      else toast.error(`${res.failed} item(s) failed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Execute failed";
      setExecError(msg);
      toast.error(humanizeBackendError(stripTerminalCodes(msg)) ?? msg);
    } finally {
      setExecuting(false);
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
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(displayedEnvelope, null, 2),
      );
      setCopied(true);
      toast.success("Envelope copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AGENT_ICON className="h-4 w-4 text-primary" />
        Build &amp; test an action
      </div>

      {/* The two dimensions */}
      <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Verb</label>
          <Select
            value={verb}
            onValueChange={(value) => {
              if (isDirectiveVerb(value)) handleVerbChange(value);
            }}
          >
            <SelectTrigger
              className="h-11 text-base capitalize lg:h-8 lg:text-sm"
              aria-label="Directive verb"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {verbs.map((v) => (
                <SelectItem key={v} value={v} className="capitalize">
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              return n ? nounHint(n) : null;
            }}
            placeholder="Choose a noun"
            searchPlaceholder={`Search ${nouns.length} nouns by name or token…`}
            ariaLabel="Directive noun"
            className="h-11 text-base lg:h-8 lg:text-sm"
          />
        </div>
      </div>

      {/* Prominent availability read-out */}
      {noun && state && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="min-w-0 break-words text-sm text-foreground">
              <span className="font-semibold capitalize">{verb}</span>{" "}
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
                    className={cn(
                      "h-11 min-w-0 flex-1 font-mono text-base lg:h-8 lg:text-sm",
                      invalid && "border-red-500 focus-visible:ring-red-500",
                    )}
                  />
                  {picker ? (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-11 shrink-0 gap-1 px-3 lg:h-8 lg:px-2"
                      onClick={() => void chooseIdentity(f.key, picker)}
                      aria-label={`Search ${picker.labelPlural} for ${f.label}`}
                    >
                      <Search className="h-3.5 w-3.5" />
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

      {/* Built envelope (live JSON) */}
      {displayedEnvelope && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Matrx envelope {requiredFilled || !isReference ? "" : "example"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-11 gap-1 text-xs lg:h-7"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground">
            {JSON.stringify(displayedEnvelope, null, 2)}
          </pre>
        </div>
      )}

      {/* Action area: live render for reads, stubbed execute for writes */}
      {isReference ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!canLiveRender}
            onClick={() => setRenderNonce((n) => n + 1)}
            className="h-11 w-fit gap-1 lg:h-8"
          >
            <Play className="h-3.5 w-3.5" />
            Render live
          </Button>
          {state !== "yes" && (
            <p className="text-xs text-muted-foreground">
              This {verb} is{" "}
              <span className="font-medium">
                {state ? STATE_WORDS[state] : "unknown"}
              </span>{" "}
              — only wired nouns render live. Pick one from &quot;Ready to{" "}
              {verb}&quot; in the noun list.
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
          {noun ? nounLabel(noun) : "This noun"} can&apos;t be{" "}
          {verb === "delete" ? "deleted" : `${verb}d`} through a directive. Pick
          one from &quot;Ready to {verb}&quot; in the noun list.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Payload — the row's fields (shape mirrors the table). */}
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
            {writeFields.length === 0 && noun && (
              <p className="text-xs text-muted-foreground">
                The server publishes no field list for{" "}
                <span className="font-medium">{nounLabel(noun)}</span> {verb}{" "}
                yet, so this one is written as JSON.
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
                onChange={(key, value) =>
                  setPayloadValues((prev) => applyFieldChange(prev, key, value))
                }
              />
            ) : (
              <>
                <Textarea
                  value={writePayload}
                  onChange={(e) => setWritePayload(e.target.value)}
                  spellCheck={false}
                  className={cn(
                    "min-h-[120px] font-mono text-base lg:text-xs",
                    payloadError && "border-red-500 focus-visible:ring-red-500",
                  )}
                  placeholder={writePayloadPlaceholder}
                />
                {payloadError && <PanelError raw={payloadError} />}
              </>
            )}
          </div>

          <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={force}
              onCheckedChange={(v) => setForce(v === true)}
            />
            Force — bypass idempotency (apply a deliberate duplicate)
          </label>

          {effectiveView === "fields" &&
            splitWarnings(builtPayload.warnings, payloadValues).action.map((m) => (
              <p key={m} className="text-xs text-amber-700 dark:text-amber-300">
                {m}
              </p>
            ))}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canExecute}
              onClick={handleExecute}
              className="h-11 w-fit gap-1 lg:h-8"
            >
              {executing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Execute
            </Button>
            {verb === "delete" && state === "yes" && (
              <span className="text-xs text-muted-foreground">
                Soft delete — the record goes to trash, never destroyed.
              </span>
            )}
          </div>

          {state === "planned" && (
            <p className="text-xs text-muted-foreground">
              This {verb} is <span className="font-medium">planned</span>, not
              wired yet — you can build and copy the envelope, but Execute runs
              only for nouns under &quot;Ready to {verb}&quot;.
            </p>
          )}

          {execError && <PanelError raw={execError} />}

          {result && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <span className="text-xs font-medium text-muted-foreground">
                Result — {result.applied} applied, {result.failed} failed
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
                    <span className="text-foreground">{r.summary}</span>
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
                  {r.error && <PanelError raw={r.error} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
