"use client";

/**
 * Test tab — the magic moment: fill the canonical `KindInputForm` and watch
 * YOUR component render the instance live through the REAL production route
 * (`KindInstanceRender` → SafeBlockRenderer → applyIrKindRoute; db-sourced
 * kind_component renderers resolve automatically).
 *
 * HEAVY (KindInputForm pulls ajv + the production input stack) — the route
 * loads this whole tab via `next/dynamic({ ssr: false })`.
 */

import { useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import KindInputForm from "@/features/content-ir/input/KindInputForm";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

interface ShapeTestTabProps {
  kind: string;
  label: string;
}

export default function ShapeTestTab({ kind, label }: ShapeTestTabProps) {
  const [instance, setInstance] = useState<unknown>(null);
  const [renderKey, setRenderKey] = useState(0);

  async function copyInstance(): Promise<void> {
    if (instance === null) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(instance, null, 2));
      toast.success(`Copied ${kind} instance`);
    } catch (error) {
      toast.error(
        `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* The form */}
      <section className="rounded-md border border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Fill in your {label}
          </span>
        </div>
        <KindInputForm
          kind={kind}
          submitLabel="Render"
          onSubmit={(value) => {
            setInstance(value);
            setRenderKey((k) => k + 1);
          }}
        />
      </section>

      {/* The live render */}
      <section className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Live render
          </span>
          {instance !== null && (
            <>
              <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <Check className="h-3 w-3" />
                valid instance
              </span>
              <button
                type="button"
                onClick={() => void copyInstance()}
                className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy JSON
              </button>
            </>
          )}
        </div>
        {instance === null ? (
          <div className="rounded-md border border-dashed border-border bg-card/50 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Submit the form — your shape renders here, exactly as it will in
              chat and everywhere else.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <KindInstanceRender key={renderKey} kind={kind} value={instance} />
            <details className="rounded-md border border-border bg-card">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                Instance JSON
              </summary>
              <pre className="max-h-[24rem] overflow-auto border-t border-border p-3 font-mono text-[11px] text-foreground">
                {JSON.stringify(instance, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
