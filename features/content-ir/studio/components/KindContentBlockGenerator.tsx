"use client";

/**
 * KindContentBlockGenerator — the no-LLM "generate a teaching block" panel,
 * shared by the admin kind-registry page and the /shapes owner editor. It
 * DERIVES the block from the kind's schema + canonical example
 * (kind-content-block-generator, pure), previews it, and stores it through the
 * caller-supplied `store` (admin → super-admin RPC; owner → canonical thunks).
 *
 * Two tiers (Simple / Detailed) match the house content-block formats. Storing
 * is an upsert by the deterministic block_id, so "Generate" and "Regenerate"
 * are the same call — re-running never duplicates.
 */

import { useMemo, useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import type { Json } from "@/types/database.types";
import {
  contentBlockIdFor,
  generateKindContentBlock,
  type ContentBlockTier,
  type GeneratedContentBlock,
} from "@/features/content-ir/registry/kind-content-block-generator";

interface KindContentBlockGeneratorProps {
  kind: string;
  label: string;
  emittedJsonSchema: Json | null;
  canonicalExample?: unknown;
  /** block_ids already stored for this kind — drives Generate vs Regenerate. */
  existingBlockIds?: string[];
  /** Persist the block. Throws on failure (surfaced as a toast). */
  store: (block: GeneratedContentBlock) => Promise<void>;
  onStored?: () => void;
  /** Copy on the store button when there is no elevated write (rare). */
  storeLabel?: string;
}

const TIERS: ReadonlyArray<{ id: ContentBlockTier; label: string; hint: string }> =
  [
    { id: "basic", label: "Simple", hint: "Core shape + one __kind sample" },
    {
      id: "detailed",
      label: "Detailed",
      hint: "Every field, enum, and nested shape annotated",
    },
  ];

export default function KindContentBlockGenerator({
  kind,
  label,
  emittedJsonSchema,
  canonicalExample,
  existingBlockIds = [],
  store,
  onStored,
  storeLabel,
}: KindContentBlockGeneratorProps) {
  const [tier, setTier] = useState<ContentBlockTier>("detailed");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const block = useMemo(
    () =>
      generateKindContentBlock({
        kind,
        label,
        emittedJsonSchema,
        canonicalExample,
        tier,
      }),
    [kind, label, emittedJsonSchema, canonicalExample, tier],
  );

  const alreadyStored = existingBlockIds.includes(
    contentBlockIdFor(kind, tier),
  );

  async function persist(): Promise<void> {
    setSaving(true);
    try {
      await store(block);
      toast.success(
        alreadyStored ? "Content block regenerated" : "Content block stored",
        { description: block.label },
      );
      onStored?.();
    } catch (error) {
      toast.error("Failed to store the content block", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function copyTemplate(): Promise<void> {
    try {
      await navigator.clipboard.writeText(block.template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      toast.success("Content block copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-primary/25 bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Generate a teaching content block
        </span>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-border">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              title={t.hint}
              className={`px-2.5 py-1 text-xs transition-colors ${
                tier === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Derived from this kind&apos;s schema
        {canonicalExample != null ? " and its canonical example" : ""}. Stored as{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">
          {block.blockId}
        </code>{" "}
        under the Agent Skills category.
      </p>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Preview
          </span>
          {alreadyStored && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
              already stored — will regenerate
            </span>
          )}
          <button
            type="button"
            onClick={() => void copyTemplate()}
            className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            Copy
          </button>
        </div>
        <pre className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap">
          {block.template}
        </pre>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={() => void persist()}>
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          )}
          {storeLabel ??
            (alreadyStored ? "Regenerate & save" : "Generate & save")}
        </Button>
      </div>
    </div>
  );
}
