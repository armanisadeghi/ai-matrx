"use client";

/**
 * ProvisionOfferComposer — the test bench's STRUCTURED alternative to the raw
 * variables-JSON textarea, generated from the mandate's Provision offer.
 *
 * Two paths, decided by the kind catalog (mirrors `KindInputForm`'s own
 * resolver gate):
 *  1. The derived offer kind (`<provision_key>.offer`, registered by
 *     aidream's boot sync) RESOLVES → the canonical `KindInputForm` collects a
 *     schema-valid instance (loaded via next/dynamic — ajv + the production
 *     input stack stay out of the initial chunk, same as KindDetailClient).
 *  2. It doesn't resolve yet → scaffold plain fields from the provision's
 *     offered values (scalar kinds → inputs; structured kinds → JSON
 *     textareas), honestly labeled.
 *
 * Either way the result lands in the bench's variables JSON — the JSON
 * textarea remains the escape hatch and stays authoritative for legacy
 * mandates (which have no provision and never render this).
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CircleAlert, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { isJsonObject, type JsonObject, type JsonValue } from "@/types/json";
import { KIND_KEY } from "@/features/content-ir/core/kind-schema.types";
import { getKindInputContractBySlug } from "@/features/content-ir/registry/schema-source-kind-tables";
import {
  SCALAR_VALUE_KINDS,
  type OfferedValue,
} from "@/features/agents/mandates/provision-shapes";
import {
  fetchProvision,
  type ProvisionOffer,
} from "@/features/agents/mandates/provisions";

const KindInputForm = dynamic(
  () => import("@/features/content-ir/input/KindInputForm"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading the offer form…</span>
      </div>
    ),
  },
);

type ComposerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "missing" }
  | { status: "kind-form"; offer: ProvisionOffer; offerKind: string }
  | { status: "scaffold"; offer: ProvisionOffer };

export function ProvisionOfferComposer({
  provisionKey,
  onApply,
}: {
  provisionKey: string;
  /** Receives the composed values object — the bench serializes it into the
   * variables JSON (the escape hatch stays). */
  onApply: (values: JsonObject) => void;
}) {
  const [state, setState] = useState<ComposerState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const offer = await fetchProvision(provisionKey);
        if (cancelled) return;
        if (!offer) {
          console.error(
            `[mandates] bench: provision "${provisionKey}" has no live row — the declaration hasn't synced`,
          );
          setState({ status: "missing" });
          return;
        }
        // Path decision: use the canonical KindInputForm when the derived
        // offer kind resolves in the catalog; otherwise scaffold from the
        // offered values.
        if (offer.offerKindSlug) {
          try {
            const contract = await getKindInputContractBySlug(
              offer.offerKindSlug,
            );
            if (cancelled) return;
            if (contract) {
              setState({
                status: "kind-form",
                offer,
                offerKind: offer.offerKindSlug,
              });
              return;
            }
          } catch (error) {
            console.error(
              `[mandates] bench: offer kind "${offer.offerKindSlug}" lookup failed — scaffolding from the provision instead`,
              error,
            );
          }
        }
        if (!cancelled) setState({ status: "scaffold", offer });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provisionKey]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-[11px]">Loading the provision offer…</span>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-destructive">
        <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        Couldn&apos;t load provision &quot;{provisionKey}&quot;: {state.message}
      </p>
    );
  }
  if (state.status === "missing") {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        Provision &quot;{provisionKey}&quot; has no live row yet (declaration
        not synced) — use the variables JSON below.
      </p>
    );
  }

  if (state.status === "kind-form") {
    return (
      <div className="rounded-md border border-border bg-card p-2">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Structured input from the offer kind{" "}
          <code className="font-mono">{state.offerKind}</code> — submitting
          fills the variables JSON below (which stays editable).
        </p>
        <KindInputForm
          kind={state.offerKind}
          submitLabel="Use these values"
          onSubmit={(instance) => {
            if (!isJsonObject(instance)) {
              // The offer schema is always an object root — a non-object here
              // is a platform defect, never something to write into the JSON.
              console.error(
                "[mandates] bench: offer instance is not an object",
                instance,
              );
              return;
            }
            const values = { ...instance };
            delete values[KIND_KEY];
            onApply(values);
          }}
        />
      </div>
    );
  }

  return <ScaffoldForm offer={state.offer} onApply={onApply} />;
}

/** Fallback fields scaffolded straight from the provision's offered values —
 * used until the derived offer kind is registered in the catalog. */
function ScaffoldForm({
  offer,
  onApply,
}: {
  offer: ProvisionOffer;
  onApply: (values: JsonObject) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const apply = () => {
    const out: JsonObject = {};
    for (const value of offer.values) {
      const raw = drafts[value.name] ?? "";
      if (raw.trim() === "") continue; // omitted — fine for optional values
      const parsed = parseScaffoldValue(value, raw);
      if (!parsed.ok) {
        setProblem(`${value.name}: ${parsed.error}`);
        return;
      }
      out[value.name] = parsed.value;
    }
    setProblem(null);
    onApply(out);
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-card p-2">
      <p className="text-[11px] text-muted-foreground">
        The offer kind isn&apos;t registered yet, so these fields are
        scaffolded straight from the provision&apos;s offered values. Blank
        fields are omitted.
      </p>
      {offer.values.map((value) => (
        <div key={value.name} className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {value.name}
            </code>
            <Badge variant="outline" className="text-[10px] font-mono">
              {value.kind}
            </Badge>
            {!value.guaranteed && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                optional
              </Badge>
            )}
          </div>
          {SCALAR_VALUE_KINDS.has(value.kind) && value.kind !== "markdown" ? (
            <Input
              value={drafts[value.name] ?? ""}
              onChange={(e) =>
                setDrafts((prev) => ({ ...prev, [value.name]: e.target.value }))
              }
              placeholder={value.description || value.name}
              className="h-7 text-[11px]"
              style={{ fontSize: "13px" }}
            />
          ) : (
            <Textarea
              value={drafts[value.name] ?? ""}
              onChange={(e) =>
                setDrafts((prev) => ({ ...prev, [value.name]: e.target.value }))
              }
              placeholder={
                SCALAR_VALUE_KINDS.has(value.kind)
                  ? value.description || value.name
                  : `JSON for ${value.kind}`
              }
              rows={3}
              className={
                SCALAR_VALUE_KINDS.has(value.kind)
                  ? "text-[11px]"
                  : "font-mono text-[11px]"
              }
              style={{ fontSize: "13px" }}
            />
          )}
        </div>
      ))}
      {problem && (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {problem}
        </p>
      )}
      <Button size="sm" className="h-7 gap-1 text-xs" onClick={apply}>
        <Wand2 className="h-3 w-3" /> Use these values
      </Button>
    </div>
  );
}

function parseScaffoldValue(
  value: OfferedValue,
  raw: string,
): { ok: true; value: JsonValue } | { ok: false; error: string } {
  switch (value.kind) {
    case "text":
    case "string":
    case "markdown":
      return { ok: true, value: raw };
    case "number": {
      const n = Number(raw);
      return Number.isNaN(n)
        ? { ok: false, error: "not a number" }
        : { ok: true, value: n };
    }
    case "integer": {
      const n = Number(raw);
      return Number.isInteger(n)
        ? { ok: true, value: n }
        : { ok: false, error: "not an integer" };
    }
    case "boolean": {
      const v = raw.trim().toLowerCase();
      if (v === "true") return { ok: true, value: true };
      if (v === "false") return { ok: true, value: false };
      return { ok: false, error: "use 'true' or 'false'" };
    }
    default: {
      // string_list, json, and registered structured kinds — authored as JSON.
      try {
        return { ok: true, value: JSON.parse(raw) as JsonValue };
      } catch (error) {
        return {
          ok: false,
          error: `invalid JSON (${error instanceof Error ? error.message : String(error)})`,
        };
      }
    }
  }
}
