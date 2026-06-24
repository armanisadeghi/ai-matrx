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
 *  - create / update / delete: there is no execute endpoint yet (Plane 1 writer
 *    pending) — the Execute button is disabled with an inline note. We NEVER fake
 *    an execution or write to Supabase directly.
 */

import { useMemo, useState } from "react";
import { Check, Copy, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import { getReferenceResolver } from "@/features/matrx-envelope/referenceResolvers";
import { StateBadge } from "@/features/action-catalog/components/StateCell";
import {
  buildActionEnvelope,
  isReferenceVerb,
  refFieldsForNoun,
} from "@/features/action-catalog/buildEnvelope";
import {
  cellState,
  type ActionCatalog,
  type ActionState,
  type ActionVerb,
  type NounActions,
} from "@/features/action-catalog/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const envelope = useMemo(
    () => (nounName ? buildActionEnvelope(verb, nounName, fields) : null),
    [verb, nounName, fields],
  );

  const setField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

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
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            disabled
            className="h-8 w-fit gap-1"
            title="Execution endpoint pending"
          >
            <Play className="h-3.5 w-3.5" />
            Execute
          </Button>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {state === "no"
              ? "Not a writable row — this noun has no create/update/delete path."
              : "Execution endpoint pending (Plane 1 writer + idempotency ledger). The envelope above is the exact payload that path will accept."}
          </p>
        </div>
      )}
    </div>
  );
}
