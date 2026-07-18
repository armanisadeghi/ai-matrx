"use client";

/**
 * CreateShapeDialog — register a `schema_proposal` as a platform Shape
 * (content_ir kind). The second apply target beside "Apply to an agent".
 *
 * Flow: label + slug (derived from the proposal name, editable, live
 * availability check against BOTH the compiled registry and every visible
 * kind_definition row) + a REQUIRED sample instance (pre-drafted from the
 * schema, user-editable JSON) → ajv pre-validation with the production
 * structural leg → the create-shape write sequence (definitions → edges →
 * canonical example) → the DB trigger's verdict read back. A verdict that is
 * not 'passed' is surfaced loudly with the validator's errors and the sample
 * stays editable for a fix-and-retry — a broken kind is never left silent.
 *
 * Heavy on purpose (ajv + converter + planner) — ALWAYS reach this file
 * through the `next/dynamic({ ssr:false })` wrapper in SchemaProposalBlock,
 * never a static import.
 */

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Shapes } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { supabase } from "@/utils/supabase/client";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import type { OutputSchema } from "@/features/agents/types/json-schema";
import {
  buildShapePlan,
  createShapeFromPlan,
  deriveKindSlug,
  draftSampleFromJsonSchema,
  findTakenSlugs,
  isShapePlanFailure,
  isValidKindSlug,
  updateShapeExampleSample,
  validateSampleAgainstPlan,
  type CreateShapeResult,
} from "./create-shape";

// TODO(K3): point at the Shapes studio route (/shapes/[kind]) once it ships;
// until then the admin kind-registry detail page is the canonical deep link.
function kindDetailUrl(slug: string): string {
  return `/administration/kind-registry/${encodeURIComponent(slug)}`;
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

interface CreateShapeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The proposal envelope ({ name, schema, strict? }) from the block. */
  schema: OutputSchema;
}

const CreateShapeDialog: React.FC<CreateShapeDialogProps> = ({
  open,
  onOpenChange,
  schema,
}) => {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  const derivedSlug = useMemo(() => deriveKindSlug(schema.name), [schema.name]);
  const draftSample = useMemo(
    () => JSON.stringify(draftSampleFromJsonSchema(schema.schema) ?? {}, null, 2),
    [schema.schema],
  );

  // The parent mounts this dialog fresh per open (conditional render), so
  // initial state IS the per-open reset — no reset effect needed.
  const [label, setLabel] = useState(schema.name);
  const [slug, setSlug] = useState(derivedSlug);
  const [slugEdited, setSlugEdited] = useState(false);
  /** Last completed availability check, keyed by the slug it checked. */
  const [slugCheck, setSlugCheck] = useState<{
    slug: string;
    taken: boolean;
  } | null>(null);
  const [sampleText, setSampleText] = useState(draftSample);
  const [errors, setErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  /** Set once the definition exists but its example verdict is not 'passed'. */
  const [pendingFix, setPendingFix] = useState<CreateShapeResult | null>(null);

  // Live per-slug availability (debounced): compiled registry + every
  // visible kind_definition row (the registry is global by slug). Status is
  // DERIVED (invalid / stale-check → checking) so the effect only ever sets
  // state from the async completion, never synchronously.
  useEffect(() => {
    if (!open || !isValidKindSlug(slug)) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      void findTakenSlugs(supabase, [slug], (s) =>
        kindRegistry.getSchema(s) !== undefined,
      )
        .then((taken) => {
          if (cancelled) return;
          setSlugCheck({ slug, taken: taken.length > 0 });
        })
        .catch(() => {
          // Loud at submit time; the live hint just stays on "checking".
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, slug]);

  const slugStatus: SlugStatus = !isValidKindSlug(slug)
    ? "invalid"
    : slugCheck?.slug === slug
      ? slugCheck.taken
        ? "taken"
        : "available"
      : "checking";

  const parseSample = (): unknown | undefined => {
    try {
      return JSON.parse(sampleText) as unknown;
    } catch (err) {
      setErrors([
        `Sample is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      ]);
      return undefined;
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    setErrors([]);

    if (!organizationId) {
      setErrors(["No active organization — pick one from the sidebar first."]);
      return;
    }
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setErrors(["Give the Shape a name."]);
      return;
    }

    const plan = buildShapePlan(
      {
        name: schema.name,
        // MATRX-EXCEPTION: OutputSchema.schema is the agents feature's
        // structural JsonSchema; the converter takes the generic
        // Record<string, unknown> node. Same JSON at runtime — re-typed at
        // this boundary exactly once (mirrors kindBinding's documented cast).
        schema: schema.schema as unknown as Record<string, unknown>,
        strict: schema.strict,
      },
      slug,
    );
    if (isShapePlanFailure(plan)) {
      setErrors(plan.errors);
      return;
    }
    // The plan's kinds carry converter-derived labels; the root uses the
    // user's label.
    plan.rootPlan.label = trimmedLabel;

    const sample = parseSample();
    if (sample === undefined) return;

    // Production ajv leg BEFORE any write — same check the DB re-runs.
    const structural = validateSampleAgainstPlan(plan, sample);
    if (!structural.ok) {
      setErrors([
        "The sample does not match the schema — fix it before creating the Shape.",
        structural.detail ?? "Validation failed.",
      ]);
      return;
    }

    setCreating(true);
    try {
      const allSlugs = plan.planned.map((k) => k.kind);
      const taken = await findTakenSlugs(supabase, allSlugs, (s) =>
        kindRegistry.getSchema(s) !== undefined,
      );
      if (taken.length > 0) {
        if (taken.includes(slug)) setSlugCheck({ slug, taken: true });
        setErrors([
          `Slug${taken.length > 1 ? "s" : ""} already in use: ${taken.join(", ")}. Pick a different slug.`,
        ]);
        return;
      }

      const result = await createShapeFromPlan({
        client: supabase,
        organizationId,
        plan,
        sample,
        exampleLabel: `${trimmedLabel} canonical example`,
      });
      finishForVerdict(result, plan.rootSlug);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setCreating(false);
    }
  };

  /** Fix-and-retry after a non-passed verdict: update the example in place. */
  const handleRetrySample = async () => {
    if (!pendingFix || creating) return;
    setErrors([]);
    const sample = parseSample();
    if (sample === undefined) return;
    setCreating(true);
    try {
      const status = await updateShapeExampleSample(
        supabase,
        pendingFix.exampleId,
        sample,
      );
      finishForVerdict({ ...pendingFix, validationStatus: status }, slug);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setCreating(false);
    }
  };

  const finishForVerdict = (result: CreateShapeResult, rootSlug: string) => {
    if (result.validationStatus === "passed") {
      // Warm the client registry so the new kind appears without a reload.
      for (const created of result.createdKinds) {
        kindRegistry.requestSchema(created);
      }
      toast.success(`Shape "${rootSlug}" created`, {
        action: {
          label: "Open",
          onClick: () => window.open(kindDetailUrl(rootSlug), "_blank"),
        },
      });
      setPendingFix(null);
      onOpenChange(false);
      return;
    }
    // NOT passed — loud, actionable, never silent. Keep the dialog open with
    // the sample editable; the definition exists, the example needs fixing.
    setPendingFix(result);
    setErrors([
      `The database validator marked the example "${result.validationStatus}" (it must be "passed").`,
      ...(result.validationStatus === "pending"
        ? [
            "A 'pending' verdict means the validator could not evaluate the schema — this is a platform defect worth reporting, not a sample problem.",
          ]
        : ["Edit the sample below and retry — the verdict recomputes on save."]),
    ]);
  };

  const slugHint: { text: string; tone: "muted" | "ok" | "bad" } =
    slugStatus === "checking"
      ? { text: "Checking availability…", tone: "muted" }
      : slugStatus === "available"
        ? { text: "Available", tone: "ok" }
        : slugStatus === "taken"
          ? { text: "Already in use", tone: "bad" }
          : slugStatus === "invalid"
            ? {
                text: "Lowercase letters, digits and underscores only",
                tone: "bad",
              }
            : { text: "Used as the __kind identifier", tone: "muted" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shapes className="h-4 w-4 text-primary" />
            Create a Shape
          </DialogTitle>
          <DialogDescription>
            Register{" "}
            <span className="font-medium text-foreground">{schema.name}</span>{" "}
            as a reusable structured-content Shape in your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="shape-label">Name</Label>
            <Input
              id="shape-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!slugEdited && !pendingFix) {
                  setSlug(deriveKindSlug(e.target.value));
                }
              }}
              disabled={creating || pendingFix !== null}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shape-slug">Slug</Label>
            <Input
              id="shape-slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              disabled={creating || pendingFix !== null}
              className="font-mono"
            />
            <p
              className={cn(
                "text-xs",
                slugHint.tone === "ok" && "text-primary",
                slugHint.tone === "bad" && "text-destructive",
                slugHint.tone === "muted" && "text-muted-foreground",
              )}
            >
              {slugHint.text}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shape-sample">
              Sample instance{" "}
              <span className="text-muted-foreground">
                (required — validated against the schema)
              </span>
            </Label>
            <Textarea
              id="shape-sample"
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              disabled={creating}
              spellCheck={false}
              className="h-44 resize-y font-mono text-xs"
            />
          </div>

          {errors.length > 0 && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-1 text-xs text-destructive">
                {errors.map((err, i) => (
                  <p key={i} className="break-words">
                    {err}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            {pendingFix ? "Close" : "Cancel"}
          </Button>
          {pendingFix ? (
            <Button onClick={handleRetrySample} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retry sample
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={
                creating || slugStatus === "taken" || slugStatus === "invalid"
              }
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Shape
            </Button>
          )}
          {pendingFix && (
            <Button
              variant="outline"
              onClick={() => window.open(kindDetailUrl(slug), "_blank")}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open kind
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateShapeDialog;
