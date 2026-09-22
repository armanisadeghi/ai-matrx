import { z } from "zod";

const signalDescriptorSchema = z
  .object({
    kind: z.enum([
      "selector_present",
      "selector_absent",
      "url_prefix",
      "cookie_present",
      "text_present",
    ]),
    value: z.string().min(1),
    direction: z.enum(["authenticated", "challenged", "rejected"]),
    weight: z.number().min(0).max(1).default(0.5),
    label: z.string().nullable().default(null),
  })
  .strict();

const recipeFieldMapSchema = z
  .object({
    step: z.number().int().min(0).default(0),
    selector: z.string().min(1),
    field_key: z.string().nullable().default(null),
    literal_key: z.string().nullable().default(null),
    clear_first: z.boolean().default(true),
  })
  .strict();

const loginSubmitSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("click"),
      selector: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("press_enter"),
      selector: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("none"),
      selector: z.null().optional(),
    })
    .strict(),
]);

/**
 * The persisted form of the Python LoginRecipe plus the entity concurrency
 * fields. The schema is closed so a surprising database shape never becomes an
 * activation request. React renders this data as text only; it never executes
 * recipe selectors, signal values, or submitted JSON.
 */
export const reviewRecipeSchema = z
  .object({
    id: z.string().min(1),
    normalized_origin: z.string().min(1),
    match_pattern: z.string().nullable(),
    provider_key: z.string().nullable(),
    recipe_version: z.number().int(),
    field_map: z.array(recipeFieldMapSchema),
    submit: loginSubmitSchema,
    success_signals: z.array(signalDescriptorSchema),
    failure_signals: z.array(signalDescriptorSchema),
    challenge_signals: z.array(signalDescriptorSchema),
    notes: z.string().nullable(),
    provenance: z.enum(["human", "hindsight_proposal", "imported"]),
    source_finding_id: z.string().nullable(),
    status: z.enum(["proposed", "active", "retired"]),
    confidence_floor: z.number().min(0).max(1).nullable(),
    version: z.number().int(),
    deleted_at: z.string().nullable(),
  })
  .strict();

export type ReviewRecipe = z.output<typeof reviewRecipeSchema>;

export type RecipeStoreError = { message: string };

export type RecipeRead = {
  data: unknown | null;
  error: RecipeStoreError | null;
};

export type RecipeWrite = {
  data: unknown | null;
  error: RecipeStoreError | null;
};

const writeReceiptSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int(),
  })
  .strict();

export type RecipeActivationStore = {
  findExistingActive: (recipe: ReviewRecipe) => Promise<{
    data: unknown;
    error: RecipeStoreError | null;
  }>;
  writeActivation: (recipe: ReviewRecipe) => Promise<RecipeWrite>;
  readRecipe: (id: string) => Promise<RecipeRead>;
};

export type ActivationResult =
  | { kind: "activated"; row: ReviewRecipe }
  | { kind: "already_active"; row: ReviewRecipe }
  | {
      kind: "refused";
      reason: string;
      row?: ReviewRecipe;
      conflictingRecipeId?: string;
    };

export function parseReviewRecipe(
  value: unknown,
): { ok: true; recipe: ReviewRecipe } | { ok: false; reason: string } {
  const parsed = reviewRecipeSchema.safeParse(value);
  if (parsed.success) return { ok: true, recipe: parsed.data };
  return { ok: false, reason: "This recipe has an invalid structural shape." };
}

export function activationRefusal(value: unknown): string | undefined {
  const parsed = parseReviewRecipe(value);
  if (!parsed.ok) return parsed.reason;
  if (parsed.recipe.deleted_at)
    return "This recipe was deleted and cannot be activated.";
  if (parsed.recipe.status !== "proposed") {
    return "This recipe is no longer proposed; refresh to review its current status.";
  }
  if (parsed.recipe.field_map.length === 0) {
    return "This recipe has no saved-login fields, so it cannot be reused.";
  }
  if (
    parsed.recipe.field_map.some(
      (field) => !field.field_key || field.literal_key !== null,
    )
  ) {
    return "This recipe includes a non-reusable field mapping, so it cannot be activated.";
  }
  return undefined;
}

async function authoritativeRecipe(
  store: RecipeActivationStore,
  id: string,
): Promise<{ recipe?: ReviewRecipe; reason?: string }> {
  const response = await store.readRecipe(id);
  if (response.error) {
    return {
      reason:
        "The current recipe state could not be read. No activation was confirmed.",
    };
  }
  if (!response.data) return { reason: "This recipe is no longer available." };

  const parsed = parseReviewRecipe(response.data);
  return parsed.ok ? { recipe: parsed.recipe } : { reason: parsed.reason };
}

/**
 * Executes the review decision around the storage boundary. A conflict is never
 * retried against a newer recipe: the reviewer must see and decide on that row.
 */
export async function activateProposedRecipe(
  value: unknown,
  store: RecipeActivationStore,
): Promise<ActivationResult> {
  const parsed = parseReviewRecipe(value);
  if (!parsed.ok) return { kind: "refused", reason: parsed.reason };

  const recipe = parsed.recipe;
  const refusal = activationRefusal(recipe);
  if (recipe.status === "active")
    return { kind: "already_active", row: recipe };
  if (refusal) {
    return {
      kind: "refused",
      reason: refusal,
      row: recipe,
    };
  }

  let existing: Awaited<
    ReturnType<RecipeActivationStore["findExistingActive"]>
  >;
  try {
    existing = await store.findExistingActive(recipe);
  } catch {
    return {
      kind: "refused",
      reason:
        "The existing active recipe could not be checked, so this proposal was not changed.",
      row: recipe,
    };
  }
  if (existing.error || !Array.isArray(existing.data)) {
    return {
      kind: "refused",
      reason:
        "The existing active recipe could not be checked, so this proposal was not changed.",
      row: recipe,
    };
  }
  if (existing.data.length > 0) {
    const conflict = z
      .object({ id: z.string().min(1) })
      .passthrough()
      .safeParse(existing.data[0]);
    return {
      kind: "refused",
      reason:
        "An active recipe already exists for this origin and path. This proposal was not changed.",
      row: recipe,
      conflictingRecipeId: conflict.success ? conflict.data.id : undefined,
    };
  }

  let write: RecipeWrite;
  try {
    write = await store.writeActivation(recipe);
  } catch {
    write = {
      data: null,
      error: { message: "The activation request did not complete." },
    };
  }

  let current: { recipe?: ReviewRecipe; reason?: string };
  try {
    current = await authoritativeRecipe(store, recipe.id);
  } catch {
    return {
      kind: "refused",
      reason:
        "The current recipe state could not be read. No activation was confirmed.",
      row: recipe,
    };
  }
  if (!current.recipe) {
    return {
      kind: "refused",
      reason: current.reason ?? "Activation could not be confirmed.",
      row: recipe,
    };
  }
  if (current.recipe.status === "active") {
    if (write.error || !write.data)
      return { kind: "already_active", row: current.recipe };
    const receipt = writeReceiptSchema.safeParse(write.data);
    if (
      !receipt.success ||
      receipt.data.id !== recipe.id ||
      current.recipe.version !== receipt.data.version ||
      current.recipe.recipe_version !== recipe.recipe_version
    ) {
      return {
        kind: "refused",
        reason:
          "The recipe changed before activation could be confirmed. Review the current version before trying again.",
        row: current.recipe,
      };
    }
    return { kind: "activated", row: current.recipe };
  }
  return {
    kind: "refused",
    reason:
      "The recipe changed before activation could be applied. Review the current version before trying again.",
    row: current.recipe,
  };
}
