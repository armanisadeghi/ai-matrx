"use client";

/**
 * ImageRoleSelector — the compact segmented control on an image block inside a
 * user message, shown when the selected model generates images.
 *
 * Six roles in plain words (Subject · Character · Style · Mask · Edit this ·
 * Composition). Clicking the active role clears it: no role = a plain image
 * the model simply sees. A role the model cannot take stays visible, greyed,
 * with the reason on hover and — when it is the chosen one — in the line
 * below, never hidden and never silently accepted.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  IMAGE_REFERENCE_ROLES,
  IMAGE_ROLE_META,
  imageRoleVerdict,
  namedReferenceVerdict,
  normalizeReferenceName,
  roleTakesName,
  type ImageRoleLimits,
  type ReferenceRole,
} from "./roles";

export interface ImageRoleSelectorProps {
  value: ReferenceRole | null;
  onChange: (role: ReferenceRole | null) => void;
  /** null = limits still loading; roles are not judged until they arrive. */
  limits: ImageRoleLimits | null;
  modelLabel: string;
  /** The roles this block offers (image-generation roles by default; a video
   *  model offers first frame / last frame / asset / style on images, extend /
   *  restyle on videos, lip sync on audio). */
  roles?: readonly ReferenceRole[];
  /** Tagged reference name (`@name`). Offered only when `onNameChange` is set
   *  and the chosen role can carry a name. */
  name?: string | null;
  onNameChange?: (name: string | null) => void;
  className?: string;
}

export function ImageRoleSelector({
  value,
  onChange,
  limits,
  modelLabel,
  roles = IMAGE_REFERENCE_ROLES,
  name = null,
  onNameChange,
  className,
}: ImageRoleSelectorProps) {
  const chosenVerdict =
    value && limits ? imageRoleVerdict(value, limits, modelLabel) : null;
  const showName = !!onNameChange && roleTakesName(value);
  const [draft, setDraft] = useState(name ?? "");
  useEffect(() => setDraft(name ?? ""), [name]);
  const draftValid = draft.trim() === "" || normalizeReferenceName(draft) !== null;
  const nameVerdict =
    showName && name && limits ? namedReferenceVerdict(limits, modelLabel) : null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        role="radiogroup"
        aria-label="Reference image role"
        // One row, never a ragged wrap: on a phone it scrolls sideways.
        className="inline-flex w-fit max-w-full overflow-x-auto rounded-md border border-border bg-muted p-0.5 [scrollbar-width:none]"
      >
        {roles.map((role) => {
          const meta = IMAGE_ROLE_META[role];
          const verdict = limits ? imageRoleVerdict(role, limits, modelLabel) : null;
          const refused = verdict?.verdict === "refused";
          const active = value === role;
          return (
            <button
              key={role}
              type="button"
              role="radio"
              aria-checked={active}
              data-refused={refused || undefined}
              title={refused && verdict ? verdict.reason : meta.explanation}
              onClick={() => onChange(active ? null : role)}
              className={cn(
                "shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
                refused && "opacity-40 line-through decoration-muted-foreground/60",
              )}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
      <p
        className={cn(
          "text-[11px] leading-snug",
          chosenVerdict?.verdict === "refused"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
        data-testid="image-role-explanation"
      >
        {value
          ? chosenVerdict?.verdict === "refused"
            ? chosenVerdict.reason
            : IMAGE_ROLE_META[value].explanation
          : "No role: the model simply sees this. Pick what it should control."}
      </p>
      {showName && (
        <div className="flex items-center gap-1.5">
          <label
            className="text-[11px] text-muted-foreground"
            htmlFor="reference-name"
          >
            Name
          </label>
          <span className="text-[11px] text-muted-foreground">@</span>
          <input
            id="reference-name"
            data-testid="reference-name"
            value={draft}
            placeholder="hero"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (!onNameChange) return;
              const next = normalizeReferenceName(draft);
              if (draft.trim() === "") onNameChange(null);
              else if (next) onNameChange(next);
            }}
            className={cn(
              "h-6 w-32 rounded border bg-background px-1.5 text-base md:text-[11px]",
              draftValid ? "border-border" : "border-destructive",
            )}
          />
          <span
            className={cn(
              "text-[11px]",
              !draftValid || nameVerdict?.verdict === "refused"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
            data-testid="reference-name-hint"
          >
            {!draftValid
              ? "A letter, then letters, digits, _ or -."
              : nameVerdict?.verdict === "refused"
                ? nameVerdict.reason
                : "The prompt can address it as @" + (name || "name") + "."}
          </span>
        </div>
      )}
    </div>
  );
}
