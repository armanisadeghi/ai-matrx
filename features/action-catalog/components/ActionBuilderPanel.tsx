"use client";

/**
 * ActionBuilderPanel — "trigger via a few dropdowns".
 *
 * Pick a verb + noun → see that cell's live state prominently → fill the
 * identity / payload fields → get the canonical Matrx envelope live (copyable).
 *
 *  - reference / view (state "yes"): render the envelope LIVE via the canonical
 *    `MatrxEnvelopeBlock` — the same reference-chip renderer the chat uses, which
 *    resolves the value from Supabase and opens the entity on click. This works
 *    TODAY and is the "test it" payoff.
 *  - create / update (state "yes"): a JSON payload editor + Execute runs it via
 *    `POST /actions/execute` (the Plane-1 writer, as the user / RLS) and shows the
 *    per-item receipts. Idempotent by content key; `force` opts out. delete is soft
 *    (planned) → disabled; non-"yes" writes are disabled. We NEVER write Supabase
 *    directly — the server is the only write path.
 */

import { useMemo, useState } from "react";
import { Check, Copy, Loader2, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MATRX_VERSION } from "@/features/matrx-envelope/envelope";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { getReferenceResolver } from "@/features/matrx-envelope/referenceResolvers";
import { StateBadge } from "@/features/action-catalog/components/StateCell";
import { executeAction } from "@/features/action-catalog/service";
import {
  buildActionEnvelope,
  isReferenceVerb,
  refFieldsForNoun,
} from "@/features/action-catalog/buildEnvelope";
import {
  cellState,
  type ActionApplyResult,
  type ActionCatalog,
  type ActionReceipt,
  type ActionState,
  type ActionVerb,
  type NounActions,
} from "@/features/action-catalog/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RECEIPT_PILL: Record<ActionReceipt["status"], string> = {
  applied: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  already_applied: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  not_implemented: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

function StatusPill({ status }: { status: ActionReceipt["status"] }) {
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

export function ActionBuilderPanel({ catalog }: { catalog: ActionCatalog }) {
  const verbs = catalog.verbs as ActionVerb[];
  const nouns = useMemo(
    () => [...catalog.nouns].sort((a, b) => a.noun.localeCompare(b.noun)),
    [catalog.nouns],
  );

  const [verb, setVerb] = useState<ActionVerb>(verbs[0] ?? "reference");
  const [nounName, setNounName] = useState<string>(nouns[0]?.noun ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  // Bumping this commits the current fields into a live-rendered envelope.
  const [renderNonce, setRenderNonce] = useState(0);
  // Write-verb state.
  const [writePayload, setWritePayload] = useState("{\n  \n}");
  const [force, setForce] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ActionApplyResult | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const baseUrl = useAppSelector(selectResolvedBaseUrl);

  const noun: NounActions | undefined = useMemo(
    () => nouns.find((n) => n.noun === nounName),
    [nouns, nounName],
  );

  const state: ActionState | null = noun ? cellState(noun, verb) : null;
  const isReference = isReferenceVerb(verb);
  const fieldSpecs = useMemo(
    () => (isReference && nounName ? refFieldsForNoun(nounName) : []),
    [isReference, nounName],
  );

  // The write payload, parsed. A reference has no payload (its ids drive it).
  // `error` is null when valid; `value` is always an object (empty on error).
  const parsed = useMemo<{ value: Record<string, unknown>; error: string | null }>(() => {
    if (isReference) return { value: {}, error: null };
    const text = writePayload.trim();
    if (text.length === 0) return { value: {}, error: null };
    try {
      const v: unknown = JSON.parse(text);
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        return { value: {}, error: "Payload must be a JSON object (the row's fields)." };
      }
      return { value: v as Record<string, unknown>, error: null };
    } catch (e) {
      return { value: {}, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [isReference, writePayload]);

  const payloadError = parsed.error;
  const payloadOk = parsed.error === null;

  const envelope = useMemo(() => {
    if (!nounName) return null;
    if (isReference) return buildActionEnvelope(verb, nounName, fields);
    return {
      matrx_version: MATRX_VERSION,
      kind: "output_directive" as const,
      type: `${verb}:${nounName}`,
      items: payloadOk ? [parsed.value] : [],
    };
  }, [verb, nounName, isReference, fields, payloadOk, parsed.value]);

  const setField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  // Only wired create/update on a "yes" noun can execute (delete is soft → planned).
  const canExecute =
    !isReference &&
    (verb === "create" || verb === "update") &&
    state === "yes" &&
    payloadOk &&
    !!baseUrl &&
    !executing;

  const handleExecute = async () => {
    if (!canExecute || !nounName) return;
    setExecuting(true);
    setExecError(null);
    setResult(null);
    try {
      const res = await executeAction(baseUrl, {
        kind: "output_directive",
        type: `${verb}:${nounName}`,
        items: [parsed.value],
        force,
      });
      setResult(res);
      if (res.failed === 0) toast.success(`Applied ${res.applied} item(s)`);
      else toast.error(`${res.failed} item(s) failed`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Execute failed";
      setExecError(msg);
      toast.error(msg);
    } finally {
      setExecuting(false);
    }
  };

  // Live render is only meaningful for a reference/view whose type resolves and
  // whose required UUID ids are present + valid.
  const hasResolver = !!(nounName && getReferenceResolver(nounName));
  const requiredFilled = fieldSpecs.every((f) => {
    const v = fields[f.key]?.trim() ?? "";
    if (v.length === 0) return false;
    if (f.uuid && !UUID_RE.test(v)) return false;
    return true;
  });
  const canLiveRender =
    isReference && state === "yes" && hasResolver && requiredFilled;

  const handleCopy = async () => {
    if (!envelope) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
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
        <Sparkles className="h-4 w-4 text-primary" />
        Build &amp; test an action
      </div>

      {/* The two dimensions */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Verb</label>
          <Select value={verb} onValueChange={(v) => setVerb(v as ActionVerb)}>
            <SelectTrigger className="h-8 text-sm">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Noun</label>
          <Select value={nounName} onValueChange={setNounName}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select a noun" />
            </SelectTrigger>
            <SelectContent>
              {nouns.map((n) => (
                <SelectItem key={n.noun} value={n.noun}>
                  {n.noun}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Prominent availability read-out */}
      {noun && state && (
        <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
          <div className="flex flex-col">
            <span className="text-sm text-foreground">
              <span className="font-semibold capitalize">{verb}</span>{" "}
              <span className="text-muted-foreground">·</span>{" "}
              <span className="font-semibold">{noun.noun}</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {noun.table}
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
            const value = fields[f.key] ?? "";
            const invalid =
              f.uuid && value.trim().length > 0 && !UUID_RE.test(value.trim());
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  {f.label}
                  {f.uuid ? " (UUID)" : ""}
                </label>
                <Input
                  value={value}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.key}
                  className={cn(
                    "h-8 font-mono text-sm",
                    invalid && "border-red-500 focus-visible:ring-red-500",
                  )}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Built envelope (live JSON) */}
      {envelope && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Matrx envelope
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-1 text-xs"
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
            {JSON.stringify(envelope, null, 2)}
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
            className="h-8 w-fit gap-1"
          >
            <Play className="h-3.5 w-3.5" />
            Render live
          </Button>
          {state !== "yes" && (
            <p className="text-xs text-muted-foreground">
              This reference is{" "}
              <span className="font-medium">{state}</span> — live resolution is
              only available for wired (&quot;Yes&quot;) references.
            </p>
          )}
          {state === "yes" && !requiredFilled && (
            <p className="text-xs text-muted-foreground">
              Enter the identity ids above (valid UUIDs) to render the live chip.
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
      ) : (
        <div className="flex flex-col gap-3">
          {/* Payload — the row's fields (shape mirrors the table). */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">
              Payload — the row&apos;s fields (JSON)
              {verb === "update" ? " · include the row's id" : ""}
            </label>
            <Textarea
              value={writePayload}
              onChange={(e) => setWritePayload(e.target.value)}
              spellCheck={false}
              className={cn(
                "min-h-[120px] font-mono text-xs",
                payloadError && "border-red-500 focus-visible:ring-red-500",
              )}
              placeholder={'{ "label": "My note", "content": "..." }'}
            />
            {payloadError && <p className="text-xs text-red-500">{payloadError}</p>}
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={force}
              onCheckedChange={(v) => setForce(v === true)}
            />
            Force — bypass idempotency (apply a deliberate duplicate)
          </label>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!canExecute}
              onClick={handleExecute}
              className="h-8 w-fit gap-1"
            >
              {executing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Execute
            </Button>
            {verb === "delete" && (
              <span className="text-xs text-muted-foreground">
                delete is soft-delete — not yet wired (planned).
              </span>
            )}
          </div>

          {state === "no" && (
            <p className="text-xs text-muted-foreground">
              Not a writable row — this noun has no create/update/delete path.
            </p>
          )}
          {state === "planned" && verb !== "delete" && (
            <p className="text-xs text-muted-foreground">
              This write is <span className="font-medium">planned</span> — only wired
              (&quot;Yes&quot;) nouns execute today.
            </p>
          )}

          {execError && <p className="text-xs text-red-500">{execError}</p>}

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
                      {r.verb}:{r.noun}
                    </span>
                  </div>
                  {r.summary && <span className="text-foreground">{r.summary}</span>}
                  {r.resource_ids.length > 0 && (
                    <span className="font-mono text-muted-foreground">
                      id: {r.resource_ids.join(", ")}
                    </span>
                  )}
                  {r.error && <span className="text-red-500">{r.error}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
