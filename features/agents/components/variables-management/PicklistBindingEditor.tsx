"use client";

import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAccessibleLists,
  getPicklistForSelection,
} from "@/features/user-lists/service";
import type { UserList } from "@/features/user-lists/types";
import type { PicklistBinding } from "@/features/agents/types/agent-definition.types";

interface PicklistBindingEditorProps {
  binding: PicklistBinding | undefined;
  onChange: (binding: PicklistBinding | undefined) => void;
  /**
   * When true, an "Other" option appears in the rendered input that lets the user type a
   * free-text value. The envelope is replaced by that plain string for that selection — so
   * the user is never forced to lie when the list doesn't cover what they need.
   */
  allowOther: boolean;
  onAllowOtherChange: (allowOther: boolean) => void;
  readonly?: boolean;
}

const ALL_GROUPS = "__all__";

/**
 * Builder control for binding a variable to a user picklist. The author selects a list,
 * optional group, and single/multi. At run time the consumer sees only labels — the secret
 * item `description` is resolved on the server. Owners author descriptions in the Lists editor.
 */
export function PicklistBindingEditor({
  binding,
  onChange,
  allowOther,
  onAllowOtherChange,
  readonly,
}: PicklistBindingEditorProps) {
  const [lists, setLists] = useState<UserList[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const bound = !!binding?.listId;

  useEffect(() => {
    let cancelled = false;
    getAccessibleLists()
      .then((rows) => {
        if (!cancelled) setLists(rows);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load group names for the bound list (label-only RPC — never touches description).
  useEffect(() => {
    if (!binding?.listId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    getPicklistForSelection(binding.listId)
      .then((data) => {
        if (cancelled) return;
        const keys = Object.keys(data?.items_grouped ?? {}).filter(
          (k) => k !== "Ungrouped",
        );
        setGroups(keys);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [binding?.listId]);

  const toggleBound = (on: boolean) => {
    if (!on) {
      onChange(undefined);
      return;
    }
    // Default to the first accessible list, if any.
    const first = lists[0];
    onChange({ listId: first?.id ?? "" });
  };

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium cursor-pointer">
            Bind to a picklist
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Users pick a label; the item&rsquo;s hidden description is injected on
            the server.
          </p>
        </div>
        <Switch
          checked={bound}
          onCheckedChange={toggleBound}
          disabled={readonly}
        />
      </div>

      {bound && (
        <div className="space-y-2 pt-1.5 border-t border-border">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">List</Label>
            <Select
              value={binding?.listId || ""}
              onValueChange={(v) => onChange({ ...binding!, listId: v })}
              disabled={readonly}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a list…" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.list_name || "Untitled list"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {groups.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Group</Label>
              <Select
                value={binding?.groupName ?? ALL_GROUPS}
                onValueChange={(v) =>
                  onChange({
                    ...binding!,
                    groupName: v === ALL_GROUPS ? undefined : v,
                  })
                }
                disabled={readonly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_GROUPS}>All groups</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <Label className="text-sm cursor-pointer">
              Allow multiple selections
            </Label>
            <Switch
              checked={!!binding?.multiple}
              onCheckedChange={(v) =>
                onChange({ ...binding!, multiple: v || undefined })
              }
              disabled={readonly}
            />
          </div>

          <div className="flex items-start justify-between pt-1 gap-3">
            <div className="min-w-0">
              <Label className="text-sm cursor-pointer">
                Allow &ldquo;Other&rdquo; option
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds an &ldquo;Other&rdquo; choice so the user can type a free-text
                value when nothing in the list fits. The typed text is sent as
                plain text (no description lookup) so they&rsquo;re never forced to
                pick something that isn&rsquo;t right.
              </p>
            </div>
            <Switch
              checked={allowOther}
              onCheckedChange={onAllowOtherChange}
              disabled={readonly}
            />
          </div>
        </div>
      )}
    </div>
  );
}
