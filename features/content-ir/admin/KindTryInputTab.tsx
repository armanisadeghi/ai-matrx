"use client";

/**
 * Try input tab — the first real consumer of the canonical `KindInputForm`
 * (features/content-ir/input/). Where the Inputs tab is the R5 bridge LAB
 * (round-trip drift, loss reports, live validation), this tab exercises the
 * PRODUCT path end-to-end exactly as any feature would consume it: resolver
 * gate → bridged form (or instance-json fallback) → structural validation →
 * `onSubmit` with a schema-valid canonical instance, shown here as copyable
 * JSON. Read-only: nothing is persisted.
 *
 * Loaded via `next/dynamic({ ssr: false })` from KindDetailClient —
 * KindInputForm pulls in ajv + the production input stack.
 */

import { useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { toast } from "sonner";
import KindInputForm from "@/features/content-ir/input/KindInputForm";

interface KindTryInputTabProps {
  kind: string;
}

export default function KindTryInputTab({ kind }: KindTryInputTabProps) {
  const [submitted, setSubmitted] = useState<string | null>(null);

  async function copySubmitted(): Promise<void> {
    if (submitted === null) return;
    try {
      await navigator.clipboard.writeText(submitted);
      toast.success(`Copied ${kind} instance`);
    } catch (error) {
      toast.error(
        `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          The canonical <code className="font-mono">KindInputForm</code>{" "}
          (features/content-ir/input/) consumed exactly as a feature would:
          resolver-gated, bridge-rendered, validated by the activation gate&apos;s
          structural leg before <code className="font-mono">onSubmit</code>{" "}
          fires. Nothing here is persisted.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card p-3">
          <KindInputForm
            kind={kind}
            submitLabel="Emit instance"
            onSubmit={(instance) => {
              setSubmitted(JSON.stringify(instance, null, 2));
              toast.success(`Emitted a schema-valid "${kind}" instance`);
            }}
          />
        </section>

        <section className="rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-foreground">
              Emitted instance
            </span>
            {submitted !== null && (
              <>
                <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Check className="h-3 w-3" />
                  structural leg passed
                </span>
                <button
                  type="button"
                  onClick={() => void copySubmitted()}
                  className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </>
            )}
          </div>
          {submitted === null ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Submit the form — the validated canonical instance lands here.
            </p>
          ) : (
            <pre className="max-h-[32rem] overflow-auto p-3 font-mono text-[11px] text-foreground">
              {submitted}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
