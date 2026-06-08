"use client";

/**
 * SmartModelSelect
 *
 * Self-wired model dropdown. Fetches its own options from Redux on mount.
 * Styled to match the compact toolbar aesthetic (h-6, text-xs).
 *
 * Data responsibilities (internal):
 *   - Dispatches fetchModelOptions on mount to populate the list.
 *   - Dispatches fetchModelById whenever value changes so the full
 *     record is available for downstream consumers.
 *   - Both thunks are guarded — never re-fetches data already in the store.
 *
 * Caller responsibilities:
 *   - Pass value (current model ID) and onValueChange.
 *   - Never pass a models array — data is owned by Redux.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchModelById,
  fetchModelOptions,
  selectModelOptions,
  selectModelRegistryLoading,
} from "@/features/ai-models/redux/modelRegistrySlice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SmartModelSelectProps {
  value: string | null | undefined;
  onValueChange: (modelId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Model IDs to pin at the top of the dropdown (e.g. the agent default). */
  priorityValues?: string[];
}

function orderOptionsWithPriority<T extends { value: string; label: string }>(
  options: T[],
  priorityValues?: string[],
): T[] {
  if (!priorityValues?.length) return options;
  const prioritySet = new Set(priorityValues);
  const pinned = priorityValues
    .map((id) => options.find((o) => o.value === id))
    .filter((o): o is T => o != null);
  const rest = options.filter((o) => !prioritySet.has(o.value));
  return [...pinned, ...rest];
}

export function SmartModelSelect({
  value,
  onValueChange,
  placeholder = "Select a model...",
  disabled = false,
  className,
  priorityValues,
}: SmartModelSelectProps) {
  const dispatch = useAppDispatch();
  const options = useAppSelector(selectModelOptions);
  const orderedOptions = orderOptionsWithPriority(options, priorityValues);
  const isLoading = useAppSelector(selectModelRegistryLoading);

  useEffect(() => {
    dispatch(fetchModelOptions());
  }, [dispatch]);

  useEffect(() => {
    if (value) {
      dispatch(fetchModelById(value));
    }
  }, [dispatch, value]);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ??
    (isLoading ? "Loading..." : (value ?? placeholder));

  return (
    <Select
      value={value ?? ""}
      onValueChange={onValueChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger
        className={cn(
          "h-6 w-auto min-w-[220px] text-xs",
          "border-0 shadow-none focus:ring-0 focus-visible:ring-0 focus:outline-none",
          "hover:bg-gray-200 dark:hover:bg-gray-700",
          "bg-transparent",
          className,
        )}
      >
        <SelectValue
          placeholder={isLoading ? "Loading models..." : placeholder}
        >
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {orderedOptions.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
