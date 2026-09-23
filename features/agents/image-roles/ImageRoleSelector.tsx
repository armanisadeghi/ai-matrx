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

import { cn } from "@/lib/utils";
import {
  IMAGE_REFERENCE_ROLES,
  IMAGE_ROLE_META,
  imageRoleVerdict,
  type ImageReferenceRole,
  type ImageRoleLimits,
} from "./roles";

export interface ImageRoleSelectorProps {
  value: ImageReferenceRole | null;
  onChange: (role: ImageReferenceRole | null) => void;
  /** null = limits still loading; roles are not judged until they arrive. */
  limits: ImageRoleLimits | null;
  modelLabel: string;
  className?: string;
}

export function ImageRoleSelector({
  value,
  onChange,
  limits,
  modelLabel,
  className,
}: ImageRoleSelectorProps) {
  const chosenVerdict =
    value && limits ? imageRoleVerdict(value, limits, modelLabel) : null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        role="radiogroup"
        aria-label="Reference image role"
        className="inline-flex w-fit flex-wrap rounded-md border border-border bg-muted/40 p-0.5"
      >
        {IMAGE_REFERENCE_ROLES.map((role) => {
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
                "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
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
          : "No role: the model simply sees this image. Pick what it should control."}
      </p>
    </div>
  );
}
