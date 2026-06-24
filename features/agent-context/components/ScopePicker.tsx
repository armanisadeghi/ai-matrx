"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesLoading,
} from "../redux/scope/scopeTypesSlice";
import { fetchScopes, selectScopesLoading } from "../redux/scope/scopesSlice";
import {
  fetchEntityScopes,
  setEntityScopes,
  selectScopeIdsForEntity,
} from "../redux/scope/scopeAssignmentsSlice";
import { selectScopePickerOptions } from "../redux/scope/selectors";
import type { ScopePickerOption } from "../redux/scope/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/utils/cn";

interface ScopePickerProps {
  entityType: string;
  entityId: string;
  orgId: string;
  onChange?: (scopeIds: string[]) => void;
}

export function ScopePicker({
  entityType,
  entityId,
  orgId,
  onChange,
}: ScopePickerProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const hasFetched = useRef(false);

  const pickerOptions = useAppSelector((state) =>
    selectScopePickerOptions(state, orgId),
  );
  const currentScopeIds = useAppSelector((state) =>
    selectScopeIdsForEntity(state, entityType, entityId),
  );
  const typesLoading = useAppSelector(selectScopeTypesLoading);
  const scopesLoading = useAppSelector(selectScopesLoading);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    dispatch(fetchScopeTypes(orgId));
    dispatch(fetchScopes({ org_id: orgId }));
    dispatch(
      fetchEntityScopes({ entity_type: entityType, entity_id: entityId }),
    );
  }, [dispatch, orgId, entityType, entityId]);

  const selectedSet = new Set(currentScopeIds);

  const handleToggle = (scopeId: string, group: ScopePickerOption) => {
    const next = new Set(selectedSet);
    if (next.has(scopeId)) {
      next.delete(scopeId);
    } else {
      if (group.max_assignments !== null) {
        const currentInGroup = group.options.filter((o) =>
          next.has(o.value),
        ).length;
        if (currentInGroup >= group.max_assignments) return;
      }
      next.add(scopeId);
    }

    const scopeIds = Array.from(next);
    dispatch(
      setEntityScopes({
        entity_type: entityType,
        entity_id: entityId,
        scope_ids: scopeIds,
      }),
    );
    onChange?.(scopeIds);
  };

  const selectedLabels = pickerOptions.flatMap((g) =>
    g.options
      .filter((o) => selectedSet.has(o.value))
      .map((o) => ({
        label: o.label,
        color: g.color,
      })),
  );

  const filteredGroups = pickerOptions
    .map((g) => ({
      ...g,
      options: search.trim()
        ? g.options.filter((o) =>
            o.label.toLowerCase().includes(search.toLowerCase()),
          )
        : g.options,
    }))
    .filter((g) => g.options.length > 0);

  const loading = typesLoading || scopesLoading;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-9 h-auto"
        >
          <span className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selectedLabels.length === 0 && (
              <span className="text-muted-foreground">Select scopes...</span>
            )}
            {selectedLabels.map((s, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-xs"
                style={{ borderColor: s.color, color: s.color }}
              >
                {s.label}
              </Badge>
            ))}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <div className="relative border-b">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search scopes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 border-0 focus-visible:ring-0 text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
          <ScrollArea className="max-h-64">
            {loading && filteredGroups.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading scopes...
              </div>
            )}
            <CommandEmpty>No scopes found.</CommandEmpty>
            {filteredGroups.map((group, groupIdx) => {
              const currentInGroup = group.options.filter((o) =>
                selectedSet.has(o.value),
              ).length;
              const atMax =
                group.max_assignments !== null &&
                currentInGroup >= group.max_assignments;

              return (
                <div key={group.type_id}>
                  {groupIdx > 0 && <CommandSeparator />}
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5">
                        <ScopeIcon
                          name={group.icon}
                          color={group.color}
                          className="h-3.5 w-3.5"
                        />
                        <span>{group.label}</span>
                        {group.max_assignments !== null && (
                          <span className="text-muted-foreground ml-auto text-[10px]">
                            {currentInGroup}/{group.max_assignments}
                          </span>
                        )}
                      </span>
                    }
                  >
                    {group.options.map((option) => {
                      const isSelected = selectedSet.has(option.value);
                      const disabled = !isSelected && atMax;

                      return (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          disabled={disabled}
                          onSelect={() => handleToggle(option.value, group)}
                          className={cn(
                            "flex items-center gap-2",
                            disabled && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <span className="truncate">{option.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </div>
              );
            })}
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
