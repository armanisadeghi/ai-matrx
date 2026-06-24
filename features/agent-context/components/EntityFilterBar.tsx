"use client";

import { useEffect, useRef } from "react";
import { Filter } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import {
  fetchScopeTypes,
  selectScopeTypesLoading,
} from "../redux/scope/scopeTypesSlice";
import { fetchScopes } from "../redux/scope/scopesSlice";
import { selectScopePickerOptions } from "../redux/scope/selectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/utils/cn";

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "";
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface EntityFilterBarProps {
  orgId: string;
  selectedScopeIds: string[];
  onScopeIdsChange: (ids: string[]) => void;
  matchAll: boolean;
  onMatchAllChange: (v: boolean) => void;
}

export function EntityFilterBar({
  orgId,
  selectedScopeIds,
  onScopeIdsChange,
  matchAll,
  onMatchAllChange,
}: EntityFilterBarProps) {
  const dispatch = useAppDispatch();
  const hasFetched = useRef(false);

  const pickerOptions = useAppSelector((state) =>
    selectScopePickerOptions(state, orgId),
  );
  const loading = useAppSelector(selectScopeTypesLoading);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    dispatch(fetchScopeTypes(orgId));
    dispatch(fetchScopes({ org_id: orgId }));
  }, [dispatch, orgId]);

  const selectedSet = new Set(selectedScopeIds);

  const handleToggle = (scopeId: string) => {
    const next = new Set(selectedSet);
    if (next.has(scopeId)) {
      next.delete(scopeId);
    } else {
      next.add(scopeId);
    }
    onScopeIdsChange(Array.from(next));
  };

  const clearAll = () => onScopeIdsChange([]);

  const hasSelection = selectedScopeIds.length > 0;

  if (loading && pickerOptions.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
        <Filter className="h-4 w-4" />
        Loading filters...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-h-9">
      <div className="flex items-center gap-1.5 shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Button
          variant={matchAll ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onMatchAllChange(true)}
        >
          All
        </Button>
        <Button
          variant={!matchAll ? "default" : "outline"}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onMatchAllChange(false)}
        >
          Any
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <ScrollArea className="flex-1">
        <div className="flex items-center gap-3 pb-1">
          {pickerOptions.map((group) => {
            return (
              <div
                key={group.type_id}
                className="flex items-center gap-1 shrink-0"
              >
                <ScopeIcon
                  name={group.icon}
                  color={group.color}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <div className="flex items-center gap-0.5">
                  {group.options.map((option) => {
                    const isSelected = selectedSet.has(option.value);
                    return (
                      <Badge
                        key={option.value}
                        variant={isSelected ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer text-xs transition-colors select-none",
                          isSelected ? "text-white" : "hover:bg-accent",
                        )}
                        style={
                          isSelected
                            ? {
                                backgroundColor: group.color,
                                borderColor: group.color,
                              }
                            : {
                                borderColor: hexToRgba(group.color, 0.25),
                                color: group.color,
                              }
                        }
                        onClick={() => handleToggle(option.value)}
                      >
                        {option.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {hasSelection && (
        <>
          <Separator orientation="vertical" className="h-5" />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground shrink-0"
            onClick={clearAll}
          >
            Clear ({selectedScopeIds.length})
          </Button>
        </>
      )}
    </div>
  );
}
