"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import {
  DEFAULT_AVAILABLE_SCOPES,
  SCOPE_LEVEL_META,
  type ScopeLevel,
} from "../constants";
import type { ContextPolicy } from "@/features/agents/types/agent-api-types";

export interface ContextPolicyMappingEditorProps {
  /**
   * Context policies declared on the agent. Used to populate the right-hand
   * dropdown. If empty, the editor disables its selects and shows a hint.
   */
  contextPolicies: ContextPolicy[];
  /**
   * Current mapping: UI scope key → agent context-policy key.
   */
  contextMappings: Record<string, string> | null;
  onChange: (mappings: Record<string, string> | null) => void;
  compact?: boolean;
}

const STANDARD_SCOPES: string[] = [...DEFAULT_AVAILABLE_SCOPES];

function labelForScope(scope: string): string {
  return SCOPE_LEVEL_META[scope as ScopeLevel]?.label ?? scope;
}

function helpForScope(scope: string): string | null {
  return SCOPE_LEVEL_META[scope as ScopeLevel]?.description ?? null;
}

/**
 * Parity with ScopeMappingEditor but routes scope keys to agent CONTEXT POLICIES
 * instead of variables. Takes precedence over default context-policy values and
 * ad-hoc context at launch.
 */
export function ContextPolicyMappingEditor({
  contextPolicies,
  contextMappings,
  onChange,
  compact = false,
}: ContextPolicyMappingEditorProps) {
  const [newScopeName, setNewScopeName] = useState("");

  const mappings = contextMappings ?? {};
  const hasSlots = contextPolicies.length > 0;
  const customScopes = Array.from(
    new Set(Object.keys(mappings).filter((k) => !STANDARD_SCOPES.includes(k))),
  );

  const setMapping = (scopeName: string, policyKey: string) => {
    const next = { ...mappings };
    if (policyKey && policyKey !== "_none_") {
      next[scopeName] = policyKey;
    } else {
      delete next[scopeName];
    }
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  const toggleStandardScope = (scopeName: string, enabled: boolean) => {
    // Toggling a standard row off only clears its mapping — the row stays
    // visible (it's a standard key); toggling on is a no-op until the user
    // selects a context policy.
    if (!enabled) {
      const next = { ...mappings };
      delete next[scopeName];
      onChange(Object.keys(next).length > 0 ? next : null);
    }
  };

  const addCustomScope = () => {
    const trimmed = newScopeName.trim();
    if (!trimmed) return;
    if (STANDARD_SCOPES.includes(trimmed)) return;
    if (mappings[trimmed] !== undefined) return;
    onChange({ ...mappings, [trimmed]: "" });
    setNewScopeName("");
  };

  const removeCustomScope = (scopeName: string) => {
    const next = { ...mappings };
    delete next[scopeName];
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  const renderSlotSelect = (scopeName: string, isEnabled: boolean) => {
    const currentSlotKey = mappings[scopeName] ?? "";
    const placeholder = hasSlots
      ? "Select context policy..."
      : "Agent has no context policies";

    return (
      <Select
        value={currentSlotKey || "_none_"}
        onValueChange={(v) => setMapping(scopeName, v)}
        disabled={!isEnabled || !hasSlots}
      >
        <SelectTrigger className={compact ? "h-7 text-xs" : "h-8"}>
          <SelectValue>
            {currentSlotKey ? (
              <code className="font-mono text-xs">{currentSlotKey}</code>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">
            <span className="text-muted-foreground italic">None</span>
          </SelectItem>
          {contextPolicies.map((policy) => (
            <SelectItem key={policy.key} value={policy.key}>
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs">{policy.key}</code>
                <span className="text-[10px] text-muted-foreground">
                  {policy.type}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className={compact ? "text-xs" : "text-sm"}>
          Standard Scope Keys
        </Label>
        <div
          className={`border border-border rounded-md ${compact ? "text-xs" : "text-sm"}`}
        >
          {STANDARD_SCOPES.map((scopeName) => {
            const isEnabled = mappings[scopeName] !== undefined;
            const help = helpForScope(scopeName);
            return (
              <div
                key={scopeName}
                className={`flex items-center gap-3 ${compact ? "p-2" : "p-3"} border-b border-border last:border-b-0 ${
                  !isEnabled ? "bg-muted/30" : ""
                }`}
              >
                <Checkbox
                  id={`cs-scope-${scopeName}`}
                  checked={isEnabled}
                  onCheckedChange={(checked) =>
                    toggleStandardScope(scopeName, checked === true)
                  }
                />
                <div
                  className="flex-shrink-0"
                  style={{ width: "130px" }}
                  title={help ?? undefined}
                >
                  <Label
                    htmlFor={`cs-scope-${scopeName}`}
                    className={`font-medium cursor-pointer ${compact ? "text-xs" : "text-sm"} ${
                      !isEnabled ? "text-muted-foreground" : ""
                    }`}
                  >
                    {labelForScope(scopeName)}
                  </Label>
                  <div
                    className={`font-mono text-[10px] text-muted-foreground ${
                      !isEnabled ? "opacity-60" : ""
                    }`}
                  >
                    {scopeName}
                  </div>
                </div>
                <div className="flex-1">
                  {renderSlotSelect(scopeName, true)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {customScopes.length > 0 && (
        <div className="space-y-2">
          <Label className={compact ? "text-xs" : "text-sm"}>
            Custom Scope Keys
          </Label>
          <div
            className={`border border-border rounded-md ${compact ? "text-xs" : "text-sm"}`}
          >
            {customScopes.map((scopeName) => (
              <div
                key={scopeName}
                className={`flex items-center gap-3 ${compact ? "p-2" : "p-3"} border-b border-border last:border-b-0`}
              >
                <div
                  className="flex-shrink-0"
                  style={{ width: "130px" }}
                >
                  <div
                    className={`font-medium font-mono ${compact ? "text-xs" : "text-sm"}`}
                  >
                    {scopeName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    custom
                  </div>
                </div>
                <div className="flex-1">{renderSlotSelect(scopeName, true)}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCustomScope(scopeName)}
                  className={compact ? "h-6 w-6 p-0" : "h-7 w-7 p-0"}
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Enter custom scope key..."
          value={newScopeName}
          onChange={(e) => setNewScopeName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustomScope();
            }
          }}
          className={compact ? "h-8 text-[16px]" : "h-9 text-[16px]"}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCustomScope}
          disabled={!newScopeName.trim()}
          className={compact ? "h-8" : "h-9"}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}
