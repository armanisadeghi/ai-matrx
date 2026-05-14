// File: features/user-profile/components/ListEditorRow.tsx
//
// Shared chrome for the four JSONB array editors (phones, emails, social
// handles, emergency contacts). Renders a numbered row with a per-row
// remove button, optional "primary" toggle, and a slot for the actual
// fields. Keeps the four editors consistent without copy-pasting layout.

"use client";

import { Trash2, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ListEditorRowProps {
  index: number;
  /** Triggered when the user clicks the trash icon. */
  onRemove: () => void;
  /** If provided, renders a star toggle that marks this row primary. */
  primary?: {
    value: boolean;
    onChange: (next: boolean) => void;
    title?: string;
  };
  children: React.ReactNode;
}

export function ListEditorRow({
  index,
  onRemove,
  primary,
  children,
}: ListEditorRowProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-2 rounded-md border border-border/40 bg-card/30 p-3 sm:flex-row sm:items-start sm:gap-3",
      )}
    >
      <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
          {index + 1}
        </span>
        {primary && (
          <button
            type="button"
            onClick={() => primary.onChange(!primary.value)}
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs transition",
              primary.value
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border/40 text-muted-foreground hover:bg-accent",
            )}
            title={primary.title ?? "Mark primary"}
            aria-pressed={primary.value}
            aria-label={primary.title ?? "Mark primary"}
          >
            <Star
              className={cn("h-3.5 w-3.5", primary.value && "fill-current")}
            />
          </button>
        )}
      </div>
      <div className="flex-1 grid gap-2 sm:grid-cols-2">{children}</div>
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          "self-start rounded-md border border-border/40 p-1.5 text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
        )}
        title="Remove"
        aria-label="Remove"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export interface ListAddButtonProps {
  label: string;
  onClick: () => void;
}

export function ListAddButton({ label, onClick }: ListAddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-background px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:bg-accent hover:text-foreground"
    >
      <span aria-hidden>+</span>
      {label}
    </button>
  );
}

export interface ListEditorEmptyStateProps {
  icon: LucideIcon;
  label: string;
}

export function ListEditorEmptyState({
  icon: Icon,
  label,
}: ListEditorEmptyStateProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}

// ── Shared field-level building blocks ─────────────────────────────────────

export interface TextFieldProps {
  label?: string;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "url";
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
}

export function TextField({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  autoComplete,
}: TextFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label && <span className="text-muted-foreground">{label}</span>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-card px-2.5 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
        style={{ fontSize: "16px" }}
      />
    </label>
  );
}

export interface SelectFieldProps<T extends string> {
  label?: string;
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps<T>) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label && <span className="text-muted-foreground">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-md border border-border bg-card px-2.5 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
        style={{ fontSize: "16px" }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
