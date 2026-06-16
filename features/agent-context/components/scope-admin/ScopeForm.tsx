"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createScope,
  updateScope,
  selectScopesByType,
} from "../../redux/scope/scopesSlice";
import type { ScopeType, Scope } from "../../redux/scope/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE_VALUE = "__none__";

export interface ScopeFormProps {
  organizationId: string;
  scopeType: ScopeType;
  /** Edit an existing scope, or null to create a new one. */
  editingScope: Scope | null;
  /** Pre-select a parent when creating (the inline cascade). */
  parentScopeId?: string;
  /** Called after a successful save. */
  onDone: () => void;
  onCancel: () => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The shared create/edit body for a single Scope. Owns name/description/parent
 * state and writes via the canonical `createScope`/`updateScope` thunks. Hosted
 * by both `ScopeFormSheet` (floating panel) and `ScopeEditWindow` (window panel) so
 * the two surfaces never fork field/validation/write logic.
 */
export function ScopeForm({
  organizationId,
  scopeType,
  editingScope,
  parentScopeId,
  onDone,
  onCancel,
  autoFocus = true,
  className,
}: ScopeFormProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedParent, setSelectedParent] = useState<string>(NONE_VALUE);

  const existingScopes = useAppSelector((state) =>
    selectScopesByType(state, scopeType.id),
  );

  useEffect(() => {
    if (editingScope) {
      setName(editingScope.name);
      setDescription(editingScope.description);
      setSelectedParent(editingScope.parent_scope_id ?? NONE_VALUE);
    } else {
      setName("");
      setDescription("");
      setSelectedParent(parentScopeId ?? NONE_VALUE);
    }
  }, [editingScope, parentScopeId]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editingScope) {
        await dispatch(
          updateScope({
            scope_id: editingScope.id,
            name: name.trim(),
            description: description.trim(),
          }),
        );
      } else {
        await dispatch(
          createScope({
            org_id: organizationId,
            type_id: scopeType.id,
            name: name.trim(),
            description: description.trim(),
            parent_scope_id:
              selectedParent === NONE_VALUE ? undefined : selectedParent,
          }),
        );
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editingScope;
  const parentOptions = existingScopes.filter((s) => s.id !== editingScope?.id);
  const parentName = parentScopeId
    ? existingScopes.find((s) => s.id === parentScopeId)?.name
    : undefined;

  return (
    <div className={className}>
      <div className="space-y-5">
        {parentName && !isEdit && (
          <div className="px-3 py-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
            Creating under:{" "}
            <span className="font-medium text-foreground">{parentName}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Engineering, West Coast, Q1 2025..."
            className="text-base"
            style={{ fontSize: "16px" }}
            autoFocus={autoFocus}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this scope..."
            rows={3}
            className="text-base resize-none"
            style={{ fontSize: "16px" }}
          />
        </div>

        {!isEdit && parentOptions.length > 0 && !parentScopeId && (
          <div className="space-y-1.5">
            <Label className="text-xs">Parent (optional nesting)</Label>
            <Select value={selectedParent} onValueChange={setSelectedParent}>
              <SelectTrigger>
                <SelectValue placeholder="None (top level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None (top level)</SelectItem>
                {parentOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : `Create ${scopeType.label_singular}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
