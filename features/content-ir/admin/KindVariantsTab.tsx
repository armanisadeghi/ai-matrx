"use client";

/**
 * Variants tab — where a kind's NAMED PRESENTATION VARIANTS are registered.
 *
 * THE RULE (common-docs `systems/workflows/INPUT-SURFACE.md` §"Presentation
 * variants"): a rendering hint is a named variant registered ON the kind, and
 * an input selects it BY NAME. Never an ad-hoc component on the input. This
 * screen is therefore the ONE home for anything that renders a kind's value,
 * and the names authored here are the strings workflow inputs reference.
 *
 * The component picker and its config editor are the PRODUCTION agent-variable
 * editor (`CustomComponentConfigurator`) embedded whole — the same control the
 * Agent Builder uses, so the 27-type vocabulary and its config rules have one
 * implementation, not two. Validation likewise reads the agent editor's own
 * component metadata through `validateKindVariant`.
 *
 * Loaded via `next/dynamic({ ssr: false })` from KindDetailClient: the
 * configurator pulls in the Structured-List binding editor and the resource
 * policy editor, neither of which belongs in the page's initial chunk.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, TriangleAlert, Trash2, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { CustomComponentConfigurator } from "@/features/agents/components/variables-management/CustomComponentConfigurator";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import type { KindDetailData } from "@/features/content-ir/admin/kind-detail-types";
import {
  loadKindVariants,
  saveKindVariants,
} from "@/features/content-ir/admin/kind-variants-service";
import {
  customComponentToVariantParts,
  validateKindVariant,
  variantToCustomComponent,
  type KindPresentationVariant,
} from "@/features/content-ir/variants/kind-variants";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

interface Draft {
  /** The name being edited, or null for a new variant. */
  originalName: string | null;
  name: string;
  label: string;
  description: string;
  component: VariableCustomComponent | undefined;
}

function draftFromVariant(variant: KindPresentationVariant): Draft {
  return {
    originalName: variant.name,
    name: variant.name,
    label: variant.label,
    description: variant.description ?? "",
    component: variantToCustomComponent(variant),
  };
}

function emptyDraft(): Draft {
  return {
    originalName: null,
    name: "",
    label: "",
    description: "",
    component: undefined,
  };
}

function draftToVariant(draft: Draft): KindPresentationVariant {
  const { component_type, config } = customComponentToVariantParts(
    draft.component,
  );
  return {
    name: draft.name.trim(),
    label: draft.label.trim(),
    component_type,
    config,
    ...(draft.description.trim()
      ? { description: draft.description.trim() }
      : {}),
  };
}

interface KindVariantsTabProps {
  detail: KindDetailData;
}

export default function KindVariantsTab({ detail }: KindVariantsTabProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [variants, setVariants] = useState<KindPresentationVariant[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  /** DB-authored input renderers registered on this kind — a variant may name
   * one of these instead of one of the 27 component types. */
  const dbComponentKeys = useMemo(
    () =>
      detail.components
        .filter((c) => c.role === "input" && c.isActive)
        .map((c) => c.componentKey),
    [detail.components],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await loadKindVariants(detail.id);
        if (cancelled) return;
        setVariants(rows);
        setState({ status: "ready" });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail.id]);

  const draftValidation = useMemo(() => {
    if (!draft) return null;
    return validateKindVariant(draftToVariant(draft), {
      existingNames: variants
        .filter((v) => v.name !== draft.originalName)
        .map((v) => v.name),
      dbComponentKeys,
    });
  }, [draft, variants, dbComponentKeys]);

  async function persist(next: KindPresentationVariant[], message: string) {
    setSaving(true);
    try {
      const saved = await saveKindVariants(detail.id, next);
      setVariants(saved);
      setDraft(null);
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function commitDraft() {
    if (!draft || !draftValidation || draftValidation.errors.length > 0) return;
    const variant = draftToVariant(draft);
    const next =
      draft.originalName === null
        ? [...variants, variant]
        : variants.map((v) => (v.name === draft.originalName ? variant : v));
    void persist(
      next,
      draft.originalName === null
        ? `Registered variant "${variant.name}"`
        : `Updated variant "${variant.name}"`,
    );
  }

  async function deleteVariant(name: string) {
    const approved = await confirm({
      title: `Delete the "${name}" variant?`,
      description:
        "Any input that references it by name will fall back to the kind's default component.",
      confirmLabel: "Delete variant",
      variant: "destructive",
    });
    if (!approved) return;
    void persist(
      variants.filter((v) => v.name !== name),
      `Deleted variant "${name}"`,
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading variants</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-4xl rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
        {state.message}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <section className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">
            Presentation variants
          </span>
          <span className="text-xs text-muted-foreground">
            {variants.length} registered on{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              {detail.kind}
            </code>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto min-h-10"
            disabled={saving || draft !== null}
            onClick={() => setDraft(emptyDraft())}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add variant
          </Button>
        </div>
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          A rendering hint lives HERE, on the kind — never on the input. An
          input selects one of these by <strong>name</strong>; an unregistered
          name falls back to the kind&apos;s default input component and is
          reported as a defect.
        </p>

        {variants.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            No variants registered. Inputs of this kind render with its default
            input component.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {variants.map((variant) => {
              const validation = validateKindVariant(variant, {
                existingNames: variants
                  .filter((v) => v.name !== variant.name)
                  .map((v) => v.name),
                dbComponentKeys,
              });
              const issues = [...validation.errors, ...validation.warnings];
              return (
                <li key={variant.name} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                      {variant.name}
                    </code>
                    <span className="text-sm text-foreground">
                      {variant.label}
                    </span>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      {variant.component_type}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-10"
                        disabled={saving || draft !== null}
                        onClick={() => setDraft(draftFromVariant(variant))}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit {variant.name}</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-10 text-red-600 dark:text-red-400"
                        disabled={saving || draft !== null}
                        onClick={() => void deleteVariant(variant.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Delete {variant.name}</span>
                      </Button>
                    </div>
                  </div>
                  {variant.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {variant.description}
                    </p>
                  ) : null}
                  {issues.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {validation.errors.map((message) => (
                        <li
                          key={message}
                          className="flex items-start gap-1 text-xs text-red-700 dark:text-red-300"
                        >
                          <X className="mt-0.5 h-3 w-3 shrink-0" />
                          {message}
                        </li>
                      ))}
                      {validation.warnings.map((message) => (
                        <li
                          key={message}
                          className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"
                        >
                          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                          {message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {draft !== null && draftValidation !== null ? (
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
            {draft.originalName === null
              ? "New variant"
              : `Edit "${draft.originalName}"`}
          </div>
          <div className="space-y-3 px-3 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="variant-name">Name</Label>
                <Input
                  id="variant-name"
                  value={draft.name}
                  placeholder="snake_case_name"
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The string an input references. snake_case, unique on this
                  kind.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="variant-label">Label</Label>
                <Input
                  id="variant-label"
                  value={draft.label}
                  placeholder="Human label"
                  onChange={(event) =>
                    setDraft({ ...draft, label: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="variant-description">Description</Label>
              <Input
                id="variant-description"
                value={draft.description}
                placeholder="When an author should pick this rendering"
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </div>

            <CustomComponentConfigurator
              value={draft.component}
              onChange={(component) => setDraft({ ...draft, component })}
            />

            {draftValidation.errors.length > 0 ? (
              <ul className="space-y-0.5">
                {draftValidation.errors.map((message) => (
                  <li
                    key={message}
                    className="flex items-start gap-1 text-xs text-red-700 dark:text-red-300"
                  >
                    <X className="mt-0.5 h-3 w-3 shrink-0" />
                    {message}
                  </li>
                ))}
              </ul>
            ) : null}
            {draftValidation.warnings.length > 0 ? (
              <ul className="space-y-0.5">
                {draftValidation.warnings.map((message) => (
                  <li
                    key={message}
                    className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"
                  >
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {message}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="min-h-10"
                disabled={saving || draftValidation.errors.length > 0}
                onClick={commitDraft}
              >
                {saving ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {draft.originalName === null ? "Register variant" : "Save"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-10"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
