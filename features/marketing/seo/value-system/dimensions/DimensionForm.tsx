"use client";

/**
 * Create or rename a SITE dimension.
 *
 * Inline, not a dialog: this is the headline action of the screen and it sits
 * where the result will appear, so nothing is hidden behind a modal on a 375px
 * phone. The permanent identity (the slug the fact store points at) is derived
 * from what the expert types and SHOWN to them before they commit — an
 * identity that can never be changed is never a hidden derivation.
 *
 * Nothing here re-implements a governance rule. The pattern check only stops a
 * round-trip that is certain to fail; the DB is the authority and its refusal
 * sentence is what the user reads.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/styles/themes/utils";
import {
  IDENTITY_PATTERN,
  toIdentitySlug,
  type DimensionCardinality,
  type DimensionNature,
} from "./data";

export interface DimensionFormValue {
  slug: string;
  label: string;
  description: string;
  cardinality: DimensionCardinality;
  /** Only sent on create — renaming must never reclassify what it records. */
  nature?: DimensionNature;
}

/**
 * P20 — the nature question, asked in the reader's words. Never "intrinsic /
 * situational" on the screen: the words on the buttons are what the two
 * things ARE, and the model word stays behind the glass.
 */
const NATURE_CHOICES: Array<{
  key: DimensionNature;
  title: string;
  blurb: string;
}> = [
  {
    key: "intrinsic",
    title: "Something the keyword IS",
    blurb:
      "True whoever is looking, and it does not change week to week — what kind of equipment, who is asking.",
  },
  {
    key: "situational",
    title: "Where it sits on your site right now",
    blurb:
      "Worked out from your own data and re-checked on a cadence — parked, slipping, worth shifting traffic to.",
  },
];

const CARDINALITY_CHOICES: Array<{
  key: DimensionCardinality;
  title: string;
  blurb: string;
}> = [
  {
    key: "single",
    title: "One answer only",
    blurb: "A keyword is a CRT job or a server job — it cannot be both.",
  },
  {
    key: "multi",
    title: "Several answers",
    blurb: "A keyword can carry more than one, like certifications a buyer asks for.",
  },
];

export function DimensionForm({
  mode,
  initial,
  existing = [],
  pending,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: Partial<DimensionFormValue>;
  /** Dimensions already visible here — used to catch a name collision BEFORE
      it silently rewrites a dimension that already exists. */
  existing?: Array<{ slug: string; label: string; scope: "platform" | "site" }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (value: DimensionFormValue) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cardinality, setCardinality] = useState<DimensionCardinality>(
    initial?.cardinality ?? "single",
  );
  const [nature, setNature] = useState<DimensionNature>(
    initial?.nature ?? "intrinsic",
  );

  // On edit the identity is FIXED — every classified keyword points at it.
  const identity =
    mode === "edit" ? (initial?.slug ?? "") : toIdentitySlug(label);
  const identityOk = IDENTITY_PATTERN.test(identity);

  // A COLLISION IS NOT A CREATE. `facet_dimension_upsert` is an upsert: typing
  // a name that resolves to an existing identity would quietly RE-LABEL that
  // dimension — and for a super admin it would do so to a dimension every
  // tenant shares, under a toast that says "yours". The DB is still the
  // authority on who may; this only stops an edit nobody asked for.
  const collision =
    mode === "create" && identityOk
      ? existing.find((entry) => entry.slug === identity)
      : undefined;

  const canSubmit =
    label.trim().length > 0 && identityOk && !collision && !pending;

  return (
    <form
      className="space-y-3 rounded-lg border border-primary/40 bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          slug: identity,
          label: label.trim(),
          description: description.trim(),
          cardinality,
          ...(mode === "create" ? { nature } : {}),
        });
      }}
    >
      <div className="space-y-1">
        <label
          htmlFor="dimension-label"
          className="text-xs font-semibold text-foreground"
        >
          What do you want to know about every keyword?
        </label>
        <Input
          id="dimension-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Equipment class"
          autoFocus
          className="h-9 text-base sm:text-sm"
        />
        <p className="text-[11px] leading-4 text-muted-foreground">
          {mode === "edit" ? (
            <>
              Permanent name in the data:{" "}
              <span className="font-mono text-foreground">{identity}</span> — it
              never changes, because every keyword already sorted by this
              dimension points at it.
            </>
          ) : identity ? (
            <>
              Saved permanently as{" "}
              <span className="font-mono text-foreground">{identity}</span>. You
              can rename the wording later; this never changes.
            </>
          ) : (
            "Name it the way you would say it out loud."
          )}
        </p>
        {collision ? (
          <p className="text-[11px] leading-4 text-destructive">
            {collision.scope === "platform"
              ? `“${collision.label}” already exists as a dimension shared by every site. Pick a different name — renaming a shared one would change it for everybody.`
              : `You already have a dimension called “${collision.label}”. Edit that one instead of creating a second.`}
          </p>
        ) : null}
        {mode === "create" && label.trim() && !identityOk ? (
          <p className="text-[11px] text-destructive">
            Start the name with a letter so it can be stored — &ldquo;Equipment
            class&rdquo; works, &ldquo;3rd party&rdquo; does not.
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="dimension-description"
          className="text-xs font-semibold text-foreground"
        >
          Why it matters to your business
        </label>
        <Textarea
          id="dimension-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="What the customer physically has. A CRT is a money-losing consumer pickup; a server is an enterprise account."
          className="resize-none text-base sm:text-sm"
        />
        <p className="text-[11px] leading-4 text-muted-foreground">
          Every agent that sorts your keywords reads this first. It is the
          difference between a guess and your judgement.
        </p>
      </div>

      {mode === "create" ? (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-foreground">
            What kind of thing is this?
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {NATURE_CHOICES.map((choice) => (
              <button
                key={choice.key}
                type="button"
                aria-pressed={nature === choice.key}
                onClick={() => {
                  setNature(choice.key);
                  // A keyword can be parked AND slipping — a segment group is
                  // never one-answer-only unless the person says so after.
                  if (choice.key === "situational") setCardinality("multi");
                }}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left transition-colors",
                  nature === choice.key
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="block text-xs font-semibold text-foreground">
                  {choice.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                  {choice.blurb}
                </span>
              </button>
            ))}
          </div>
          {nature === "situational" ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              Segments like this are filled by your Dig Here rules and always
              show when they were last worked out. Nobody types them in one at
              a time, and nothing here is a to-do somebody closes.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {mode === "create" ? (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-foreground">
            Can a keyword have more than one answer?
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CARDINALITY_CHOICES.map((choice) => (
              <button
                key={choice.key}
                type="button"
                aria-pressed={cardinality === choice.key}
                onClick={() => setCardinality(choice.key)}
                className={cn(
                  "rounded-md border px-2.5 py-2 text-left transition-colors",
                  cardinality === choice.key
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent",
                )}
              >
                <span className="block text-xs font-semibold text-foreground">
                  {choice.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                  {choice.blurb}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={!canSubmit}>
          {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {mode === "create" ? "Create dimension" : "Save changes"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
