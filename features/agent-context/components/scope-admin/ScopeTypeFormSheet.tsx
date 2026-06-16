"use client";

import { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  createScopeType,
  updateScopeType,
} from "../../redux/scope/scopeTypesSlice";
import type { ScopeType } from "../../redux/scope/types";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
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
import { Badge } from "@/components/ui/badge";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
import { TailwindColorPicker } from "@/components/ui/TailwindColorPicker";

interface ScopeTypeFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  existingTypes: ScopeType[];
  editingType: ScopeType | null;
}

const NONE_VALUE = "__none__";

export function ScopeTypeFormSheet({
  open,
  onOpenChange,
  organizationId,
  existingTypes,
  editingType,
}: ScopeTypeFormSheetProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);

  const [labelSingular, setLabelSingular] = useState("");
  const [labelPlural, setLabelPlural] = useState("");
  const [icon, setIcon] = useState("Folder");
  const [color, setColor] = useState("blue");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [maxAssignments, setMaxAssignments] = useState("");
  const [parentTypeId, setParentTypeId] = useState<string>(NONE_VALUE);
  const [variableKeyInput, setVariableKeyInput] = useState("");
  const [variableKeys, setVariableKeys] = useState<string[]>([]);

  useEffect(() => {
    if (editingType) {
      setLabelSingular(editingType.label_singular);
      setLabelPlural(editingType.label_plural);
      setIcon(editingType.icon);
      setColor(editingType.color || "blue");
      setDescription(editingType.description);
      setSortOrder(editingType.sort_order);
      setMaxAssignments(
        editingType.max_assignments_per_entity?.toString() ?? "",
      );
      setParentTypeId(editingType.parent_type_id ?? NONE_VALUE);
      setVariableKeys(editingType.default_variable_keys ?? []);
    } else {
      setLabelSingular("");
      setLabelPlural("");
      setIcon("Folder");
      setColor("blue");
      setDescription("");
      setSortOrder(existingTypes.length);
      setMaxAssignments("");
      setParentTypeId(NONE_VALUE);
      setVariableKeys([]);
    }
  }, [editingType, open, existingTypes.length]);

  const handleSingularChange = (val: string) => {
    setLabelSingular(val);
    if (!editingType && !labelPlural) {
      const plural = val.endsWith("s")
        ? val + "es"
        : val.endsWith("y")
          ? val.slice(0, -1) + "ies"
          : val + "s";
      setLabelPlural(plural);
    }
  };

  const addVariableKey = () => {
    const key = variableKeyInput
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (key && !variableKeys.includes(key)) {
      setVariableKeys([...variableKeys, key]);
    }
    setVariableKeyInput("");
  };

  const removeVariableKey = (key: string) => {
    setVariableKeys(variableKeys.filter((k) => k !== key));
  };

  const handleSubmit = async () => {
    if (!labelSingular.trim() || !labelPlural.trim()) return;
    setSaving(true);
    try {
      if (editingType) {
        await dispatch(
          updateScopeType({
            type_id: editingType.id,
            label_singular: labelSingular.trim(),
            label_plural: labelPlural.trim(),
            icon,
            description: description.trim(),
            sort_order: sortOrder,
            max_assignments: maxAssignments
              ? parseInt(maxAssignments, 10)
              : undefined,
          }),
        );
      } else {
        await dispatch(
          createScopeType({
            org_id: organizationId,
            label_singular: labelSingular.trim(),
            label_plural: labelPlural.trim(),
            icon,
            description: description.trim(),
            sort_order: sortOrder,
            max_assignments: maxAssignments
              ? parseInt(maxAssignments, 10)
              : undefined,
            parent_type_id:
              parentTypeId === NONE_VALUE ? undefined : parentTypeId,
            default_variable_keys: variableKeys,
          }),
        );
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!editingType;
  const canSave =
    labelSingular.trim().length > 0 && labelPlural.trim().length > 0;

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Scope Type" : "New Scope Type"}
      expandButtonLabel="Scope type"
      dismissDisabled={saving}
      position="right"
      defaultSize={34}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Singular Label</Label>
            <Input
              value={labelSingular}
              onChange={(e) => handleSingularChange(e.target.value)}
              placeholder="Department"
              className="text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Plural Label</Label>
            <Input
              value={labelPlural}
              onChange={(e) => setLabelPlural(e.target.value)}
              placeholder="Departments"
              className="text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this scope type represents..."
            rows={2}
            className="text-base resize-none"
            style={{ fontSize: "16px" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Icon</Label>
            <IconInputWithValidation
              value={icon}
              onChange={setIcon}
              showLucideLink={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <TailwindColorPicker
              selectedColor={color}
              onColorChange={setColor}
              size="sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Sort Order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              min={0}
              className="text-base"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max Assignments</Label>
            <Input
              type="number"
              value={maxAssignments}
              onChange={(e) => setMaxAssignments(e.target.value)}
              placeholder="Unlimited"
              min={1}
              className="text-base"
              style={{ fontSize: "16px" }}
            />
            <p className="text-[10px] text-muted-foreground">
              Leave blank for unlimited
            </p>
          </div>
        </div>

        {!isEdit && existingTypes.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Parent Type (optional)</Label>
            <Select value={parentTypeId} onValueChange={setParentTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>None</SelectItem>
                {existingTypes
                  .filter((t) => t.id !== editingType?.id)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label_singular}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Default Variable Keys</Label>
          <div className="flex gap-2">
            <Input
              value={variableKeyInput}
              onChange={(e) => setVariableKeyInput(e.target.value)}
              placeholder="e.g. budget_code"
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), addVariableKey())
              }
              className="text-base flex-1"
              style={{ fontSize: "16px" }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addVariableKey}
            >
              Add
            </Button>
          </div>
          {variableKeys.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {variableKeys.map((key) => (
                <Badge
                  key={key}
                  variant="secondary"
                  className="text-xs gap-1 pl-2 pr-1"
                >
                  <code className="font-mono">{key}</code>
                  <button
                    type="button"
                    onClick={() => removeVariableKey(key)}
                    className="hover:bg-muted-foreground/10 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Context variable keys auto-created when this scope type is assigned
          </p>
        </div>

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!canSave || saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Type"}
          </Button>
        </div>
      </div>
    </MatrxDynamicPanelHost>
  );
}
