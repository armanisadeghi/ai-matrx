"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllShortcutsArray } from "@ai-matrx/chat/agents/redux/agent-shortcuts/selectors";
import { cn } from "@/lib/utils";

interface AgentShortcutPickerProps {
  label: string;
  description?: string;
  /** Currently-selected shortcut id, or null when using the default. */
  value: string | null;
  /** Default shortcut id (shown as the first option). */
  defaultId: string;
  onChange: (next: string) => void;
}

export function AgentShortcutPicker({
  label,
  description,
  value,
  defaultId,
  onChange,
}: AgentShortcutPickerProps) {
  // Read all loaded shortcuts. The agent-shortcuts slice is hydrated by the
  // shell on first render of any agent surface; if the user hasn't visited
  // an agent surface yet, this can be empty — we handle that gracefully by
  // showing the current selection's id and letting the user paste / type.
  const shortcuts = useAppSelector(selectAllShortcutsArray);

  // Sort options: default first, then alphabetical by label.
  const options = useMemo(() => {
    const sorted = [...shortcuts].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    const def = sorted.find((s) => s.id === defaultId);
    const rest = sorted.filter((s) => s.id !== defaultId);
    return def ? [def, ...rest] : sorted;
  }, [shortcuts, defaultId]);

  const selectedId = value ?? defaultId;
  const hasSelectedInList = options.some((o) => o.id === selectedId);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-foreground">{label}</label>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={cn(
          "h-8 w-full rounded-md border border-border/60 bg-background px-2 text-[12px]",
          "focus:outline-none focus:ring-1 focus:ring-ring",
        )}
      >
        {!hasSelectedInList && (
          <option value={selectedId}>
            {selectedId.slice(0, 8)}… (not in registry)
          </option>
        )}
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id === defaultId ? "[default] " : ""}
            {s.label}
          </option>
        ))}
      </select>
      {description && (
        <p className="text-[10px] text-muted-foreground/80">{description}</p>
      )}
    </div>
  );
}
