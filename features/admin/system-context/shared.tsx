"use client";

// Shared taxonomy + tiny presentation helpers for the System Context admin
// feature — used by the console (table cells) and the authoring dialogs.
//
// System Context is the platform's THIRD context source (what is simply TRUE),
// stored in `context.system_context_item`. Items belong to one of three fixed
// classes — there are no user-defined categories here.

import { Clock, Globe, Database as DatabaseIcon } from "lucide-react";
import type { Database as DB } from "@/types/database.types";
import type {
  SystemContextItem,
  SystemItemClass,
} from "@/app/api/admin/system-context/route";

export type ValueType = DB["public"]["Enums"]["context_value_type"];
export type Sensitivity = DB["public"]["Enums"]["context_sensitivity"];

// The three classes of System Context. Fixed — a class is a kind of truth, not
// a folder an admin invents.
export const CLASS_META: Record<
  SystemItemClass,
  {
    label: string;
    plural: string;
    description: string;
    icon: typeof Clock;
    tone: string;
  }
> = {
  ambient: {
    label: "Ambient",
    plural: "Ambient",
    description:
      "Computed fresh by the server on every request (date, time, current user). Read-only.",
    icon: Clock,
    tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  curated: {
    label: "Curated",
    plural: "Curated",
    description:
      "Admin-maintained platform truths (the app's name, one day today's news).",
    icon: Globe,
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  dataset: {
    label: "Dataset",
    plural: "Datasets",
    description:
      "Industry reference bodies delivered to agents as queryable RAG pointers.",
    icon: DatabaseIcon,
    tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  },
};

export const CLASS_ORDER: SystemItemClass[] = ["ambient", "curated", "dataset"];

// Direct-entry value types for curated items. (Reference/document authoring
// belongs to org scope items; a System dataset is wired through its feed.)
export const VALUE_TYPE_OPTIONS: { value: ValueType; label: string }[] = [
  { value: "string", label: "Text (string)" },
  { value: "markdown", label: "Markdown" },
  { value: "number", label: "Number" },
  { value: "percent", label: "Percent" },
  { value: "currency", label: "Currency" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & time" },
  { value: "time", label: "Time" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL / link" },
  { value: "phone", label: "Phone" },
  { value: "color", label: "Color" },
  { value: "object", label: "Object (JSON)" },
  { value: "array", label: "Array (JSON)" },
];

export const SENSITIVITY_OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "restricted", label: "Restricted" },
  { value: "privileged", label: "Privileged" },
];

export const PAGE_LOCATION =
  "AI Matrx Admin — System Context (/administration/scopes-context/system-context)";

export const SENSITIVITY_STYLES: Record<string, string> = {
  public:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  internal: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  restricted:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  privileged:
    "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export function valueTypeTone(t: string): string {
  switch (t) {
    case "string":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
    case "number":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
    case "boolean":
      return "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200";
    case "date":
      return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200";
    case "object":
    case "array":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200";
    case "document":
      return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-200";
    case "reference":
      return "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function itemSummary(it: SystemContextItem): string {
  return [
    `Key: ${it.key}`,
    `Name: ${it.display_name}`,
    `Class: ${CLASS_META[it.item_class]?.label ?? it.item_class}`,
    `Type: ${it.value_type}`,
    `Feed: ${it.feed_type}`,
    `Sensitivity: ${it.sensitivity}`,
    `Value: ${it.is_computed ? "(computed at runtime)" : (it.current_value ?? "—")}`,
    it.description ? `Description: ${it.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {error ? (
        <span className="block text-[11px] text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
