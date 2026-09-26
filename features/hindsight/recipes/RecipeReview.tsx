"use client";

import { guardedUpdate } from "@ai-matrx/data/db";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/utils/supabase/client";

import {
  activateProposedRecipe,
  activationRefusal,
  parseReviewRecipe,
  type RecipeActivationStore,
  type ReviewRecipe,
} from "./activation";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const RECIPE_COLUMNS =
  "id,normalized_origin,match_pattern,provider_key,recipe_version,field_map,submit,success_signals,failure_signals,challenge_signals,notes,provenance,source_finding_id,status,confidence_floor,version,deleted_at";

function recipeTable() {
  return supabase.schema("browser").from("login_recipe");
}

function recipeStore(): RecipeActivationStore {
  return {
    findExistingActive: async (recipe) => {
      const query = recipeTable()
        .select("id")
        .eq("normalized_origin", recipe.normalized_origin)
        .eq("status", "active")
        .is("deleted_at", null)
        .neq("id", recipe.id)
        .limit(1);
      const response =
        recipe.match_pattern === null
          ? await query.is("match_pattern", null)
          : await query.eq("match_pattern", recipe.match_pattern);
      return { data: response.data, error: response.error };
    },
    writeActivation: async (recipe) => {
      const result = await guardedUpdate<{ id: string; version: number }>({
        expectedVersion: recipe.version,
        applyUpdate: ({ expectedVersion }) =>
          recipeTable()
            // The database stamps the actor and advances version. This patch must
            // remain status-only so activation cannot rewrite a reviewed recipe.
            .update({ status: "active" })
            .eq("id", recipe.id)
            .eq("status", "proposed")
            .is("deleted_at", null)
            .eq("recipe_version", recipe.recipe_version)
            .eq("version", expectedVersion)
            .select("id,version")
            .maybeSingle(),
        fetchCurrent: () =>
          recipeTable().select("id,version").eq("id", recipe.id).maybeSingle(),
      });
      return result.status === "saved"
        ? { data: result.row, error: null }
        : { data: null, error: null };
    },
    readRecipe: async (id) => {
      const response = await recipeTable()
        .select(RECIPE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      return { data: response.data, error: response.error };
    },
  };
}

function technicalRecipe(recipe: ReviewRecipe) {
  return {
    fields: recipe.field_map,
    submit: recipe.submit,
    signals: {
      success: recipe.success_signals,
      failure: recipe.failure_signals,
      challenge: recipe.challenge_signals,
    },
  };
}

function submitDescription(recipe: ReviewRecipe) {
  switch (recipe.submit.kind) {
    case "click":
      return `Clicks ${recipe.submit.selector} after filling the form.`;
    case "press_enter":
      return `Presses Enter in ${recipe.submit.selector} after filling the form.`;
    case "none":
      return "Fills the form without submitting it.";
  }
}

function signalDescription(
  direction: "authenticated" | "challenged" | "rejected",
  signal: ReviewRecipe["success_signals"][number],
) {
  const label = signal.label ? `${signal.label}: ` : "";
  return `${label}${direction} when ${signal.kind.replaceAll("_", " ")} matches ${signal.value}.`;
}

function expectedResults(recipe: ReviewRecipe) {
  return [
    ...recipe.success_signals.map((signal) => ({
      direction: "authenticated" as const,
      signal,
    })),
    ...recipe.failure_signals.map((signal) => ({
      direction: "rejected" as const,
      signal,
    })),
    ...recipe.challenge_signals.map((signal) => ({
      direction: "challenged" as const,
      signal,
    })),
  ];
}

export function RecipeReview({ id }: { id: string }) {
  const [recipe, setRecipe] = useState<ReviewRecipe | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivating, setIsActivating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [conflictingRecipeId, setConflictingRecipeId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let current = true;
    void recipeStore()
      .readRecipe(id)
      .then((response) => {
        if (!current) return;
        setIsLoading(false);
        if (response.error || !response.data) {
          setRecipe(null);
          setMessage(response.error?.message ?? "This recipe is unavailable.");
          return;
        }
        const parsed = parseReviewRecipe(response.data);
        if (!parsed.ok) {
          setRecipe(null);
          setMessage(parsed.reason);
          return;
        }
        setRecipe(parsed.recipe);
      })
      .catch(() => {
        if (!current) return;
        setIsLoading(false);
        setRecipe(null);
        setMessage("This recipe is unavailable.");
      });
    return () => {
      current = false;
    };
  }, [id]);

  const refusal = recipe ? activationRefusal(recipe) : undefined;

  const activate = async () => {
    if (!recipe) return;
    setIsConfirming(false);
    setIsActivating(true);
    setMessage(null);
    setConflictingRecipeId(null);
    const result = await activateProposedRecipe(recipe, recipeStore());
    setIsActivating(false);
    setRecipe(result.row ?? null);
    setConflictingRecipeId(
      result.kind === "refused" ? (result.conflictingRecipeId ?? null) : null,
    );
    if (result.kind === "activated") {
      setMessage("This shared login recipe is active for every user.");
      return;
    }
    if (result.kind === "already_active") {
      setMessage(
        "This recipe is already active. No additional change was written.",
      );
      return;
    }
    setMessage(result.reason);
  };

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Loading recipe…</p>;
  if (!recipe) return <p className="text-sm text-destructive">{message} <ErrorAlchemyMenu error={message} /></p>;

  const canActivate = !refusal && !isActivating;
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Login recipe review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">
            {recipe.normalized_origin}
            {recipe.match_pattern ?? ""}
          </p>
          <p className="text-muted-foreground">
            Status: {recipe.status} · Recipe revision {recipe.recipe_version} ·
            Record version {recipe.version}
          </p>
        </div>
        <p>
          This proposal describes how the login form is recognized. Activating
          it makes the recipe available to every user of this shared service.
        </p>
        <dl className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium">Provenance</dt>
          <dd>{recipe.provenance.replaceAll("_", " ")}</dd>
          <dt className="font-medium">Form actions</dt>
          <dd>
            <ul className="list-disc space-y-1 pl-4">
              {recipe.field_map.map((field, index) => (
                <li key={`${field.step}-${field.selector}-${index}`}>
                  Step {field.step + 1}: fills saved field “{field.field_key}”
                  at {field.selector}.
                </li>
              ))}
              <li>{submitDescription(recipe)}</li>
            </ul>
          </dd>
          <dt className="font-medium">Expected result</dt>
          <dd>
            <ul className="list-disc space-y-1 pl-4">
              {expectedResults(recipe).map(({ direction, signal }, index) => (
                <li
                  key={`${direction}-${signal.kind}-${signal.value}-${index}`}
                >
                  {signalDescription(direction, signal)}
                </li>
              ))}
              {recipe.success_signals.length === 0 &&
              recipe.failure_signals.length === 0 &&
              recipe.challenge_signals.length === 0 ? (
                <li>No outcome signals are recorded.</li>
              ) : null}
            </ul>
          </dd>
        </dl>
        <details className="rounded-md border bg-muted/30 p-3">
          <summary className="cursor-pointer font-medium">
            Technical recipe data
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(technicalRecipe(recipe), null, 2)}
          </pre>
        </details>
        {message ? <p className="text-muted-foreground">{message}</p> : null}
        {conflictingRecipeId ? (
          <p className="text-destructive">
            Blocking active recipe:{" "}
            <Link
              className="underline"
              href={`/administration/agents/hindsight/recipes/${encodeURIComponent(conflictingRecipeId)}`}
            >
              {conflictingRecipeId}
            </Link>
          </p>
        ) : null}
        {refusal ? <p className="text-destructive">{refusal} <ErrorAlchemyMenu error={refusal} /></p> : null}
        <Button disabled={!canActivate} onClick={() => setIsConfirming(true)}>
          {isActivating ? "Activating…" : "Activate shared recipe"}
        </Button>
      </CardContent>
      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Activate this shared login recipe?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This immediately makes the recipe available to every user. It does
              not change an existing active recipe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActivating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isActivating}
              onClick={() => void activate()}
            >
              Activate for all users
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
