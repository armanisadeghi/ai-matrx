"use client";

import { Field } from "@ai-matrx/design-system/controls";

import { cn } from "@/lib/utils";
import { fontStack } from "../fonts";
import { SIGNATURE_STYLES } from "../styles";

export function TypeTab({
  target,
  name,
  initials,
  styleKey,
  onName,
  onInitials,
  onStyle,
}: {
  target: "signature" | "initials";
  name: string;
  initials: string;
  styleKey: string;
  onName: (v: string) => void;
  onInitials: (v: string) => void;
  onStyle: (key: string) => void;
}) {
  const shown = target === "initials" ? initials : name;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
        {target === "signature" ? (
          <>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
              Full name
              {/* ui-exception: the signer types their own name to draw a signature — never dictated or rewritten */}
              <Field value={name} autoComplete="name" onChange={(e) => onName(e.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
              Initials
              {/* ui-exception: initials drawn as a signature mark, never dictated or rewritten */}
              <Field value={initials} maxLength={5} onChange={(e) => onInitials(e.target.value)} />
            </label>
          </>
        ) : (
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">
            Initials
            {/* ui-exception: initials drawn as a signature mark, never dictated or rewritten */}
            <Field value={initials} maxLength={5} onChange={(e) => onInitials(e.target.value)} />
          </label>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label="Signature style"
        className="grid max-h-[34dvh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
      >
        {SIGNATURE_STYLES.map((style) => {
          const selected = style.key === styleKey;
          return (
            <button
              key={style.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={style.label}
              data-clickable
              onClick={() => onStyle(style.key)}
              className={cn(
                "flex h-14 items-center overflow-hidden rounded-md border px-3 text-left transition-colors",
                selected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-accent",
              )}
            >
              <span
                className="block max-w-full truncate leading-none text-foreground"
                style={{ fontFamily: fontStack(style), fontSize: `${1.6 * style.previewScale}rem` }}
              >
                {shown.trim() || "Your name"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
