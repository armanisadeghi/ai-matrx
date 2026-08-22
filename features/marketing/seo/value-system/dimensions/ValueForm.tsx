"use client";

/**
 * Add or re-label one allowed ANSWER on a dimension.
 *
 * The description is not decoration. It is the sentence an agent reads when it
 * decides whether a keyword belongs here — the thing that used to live in the
 * model's head and change between runs. So it gets the same weight as the name.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { IDENTITY_PATTERN, toIdentitySlug } from "./data";

export interface ValueFormValue {
  value: string;
  label: string;
  description: string;
}

export function ValueForm({
  mode,
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial?: Partial<ValueFormValue>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (value: ValueFormValue) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const identity =
    mode === "edit" ? (initial?.value ?? "") : toIdentitySlug(label);
  const identityOk = IDENTITY_PATTERN.test(identity);
  const canSubmit = label.trim().length > 0 && identityOk && !pending;

  return (
    <form
      className="space-y-2.5 rounded-md border border-primary/40 bg-card p-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        onSubmit({
          value: identity,
          label: label.trim(),
          description: description.trim(),
        });
      }}
    >
      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">
          One allowed answer
        </label>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="CRT monitor"
          autoFocus
          className="h-8 text-base sm:text-sm"
        />
        {identity ? (
          <p className="text-[11px] text-muted-foreground">
            Stored permanently as{" "}
            <span className="font-mono text-foreground">{identity}</span>
            {mode === "edit" ? " — the wording is yours to change, this is not." : "."}
          </p>
        ) : null}
        {mode === "create" && label.trim() && !identityOk ? (
          <p className="text-[11px] text-destructive">
            Start the answer with a letter so it can be stored.
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-foreground">
          What counts as this answer?
        </label>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="One old tube monitor from a garage. Costs money to take — never a job we want to rank for."
          className="resize-none text-base sm:text-sm"
        />
        <p className="text-[11px] leading-4 text-muted-foreground">
          Write it the way you would tell a new hire. This exact sentence is
          what decides borderline keywords, every run, for everyone.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={!canSubmit}>
          {pending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
          {mode === "create" ? "Add answer" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
