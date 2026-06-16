"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation";
import { ScopeColorPicker } from "./ScopeColorPicker";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createScopeType,
  fetchScopeTypes,
  selectScopeTypesByOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { fetchScopes } from "@/features/agent-context/redux/scope/scopesSlice";
import {
  createContextItem,
  listScopeTypeItems,
} from "@/features/scope-system/redux/contextItemsSlice";
import { slugifyKey } from "@/features/scope-system/utils/slugify";

type ContextItemDraft = { id: string; display_name: string };

interface AddScopeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}

const NONE_VALUE = "__none__";

const newItemRow = (): ContextItemDraft => ({
  id: Math.random().toString(36).slice(2),
  display_name: "",
});

function pluralize(s: string): string {
  if (!s) return "";
  if (/[sxz]$|[cs]h$/i.test(s)) return s + "es";
  if (/[^aeiou]y$/i.test(s)) return s.slice(0, -1) + "ies";
  return s + "s";
}

export function AddScopeModal({
  open,
  onOpenChange,
  orgId,
}: AddScopeModalProps) {
  const dispatch = useAppDispatch();
  const existingTypes = useAppSelector((s) => selectScopeTypesByOrg(s, orgId));
  const [busy, setBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Basics
  const [labelSingular, setLabelSingular] = useState("");
  const [labelPlural, setLabelPlural] = useState("");
  const [pluralEdited, setPluralEdited] = useState(false);
  const [icon, setIcon] = useState("Folder");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<ContextItemDraft[]>([newItemRow()]);

  // Advanced
  const [color, setColor] = useState("blue");
  const [sortOrder, setSortOrder] = useState(0);
  const [maxAssignments, setMaxAssignments] = useState("");
  const [parentTypeId, setParentTypeId] = useState<string>(NONE_VALUE);
  const [variableKeyInput, setVariableKeyInput] = useState("");
  const [variableKeys, setVariableKeys] = useState<string[]>([]);

  const rowInputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const pendingFocusRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabelSingular("");
    setLabelPlural("");
    setPluralEdited(false);
    setIcon("Folder");
    setDescription("");
    setItems([newItemRow()]);
    setColor("blue");
    setSortOrder(existingTypes.length);
    setMaxAssignments("");
    setParentTypeId(NONE_VALUE);
    setVariableKeyInput("");
    setVariableKeys([]);
    setAdvancedOpen(false);
  }, [open, existingTypes.length]);

  useEffect(() => {
    const target = pendingFocusRowRef.current;
    if (!target) return;
    const el = rowInputsRef.current.get(target);
    if (el) {
      el.focus();
      pendingFocusRowRef.current = null;
    }
  }, [items]);

  function handleSingularChange(v: string) {
    setLabelSingular(v);
    if (!pluralEdited) setLabelPlural(pluralize(v));
  }

  function appendItemRow() {
    const row = newItemRow();
    pendingFocusRowRef.current = row.id;
    setItems((rows) => [...rows, row]);
  }
  function removeItemRow(id: string) {
    setItems((rows) =>
      rows.length === 1 ? rows : rows.filter((r) => r.id !== id),
    );
  }
  function updateItemRow(id: string, value: string) {
    setItems((rows) =>
      rows.map((r) => (r.id === id ? { ...r, display_name: value } : r)),
    );
  }

  function handleItemRowKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = items[index + 1];
      if (next) {
        rowInputsRef.current.get(next.id)?.focus();
      } else {
        appendItemRow();
      }
    }
  }

  function addVariableKey() {
    const key = slugifyKey(variableKeyInput);
    if (key && !variableKeys.includes(key)) {
      setVariableKeys([...variableKeys, key]);
    }
    setVariableKeyInput("");
  }
  function removeVariableKey(key: string) {
    setVariableKeys(variableKeys.filter((k) => k !== key));
  }

  async function handleSave() {
    const trimmedSingular = labelSingular.trim();
    const trimmedPlural = (labelPlural || pluralize(labelSingular)).trim();
    if (!trimmedSingular) {
      toast.error("Give your scope a name");
      return;
    }
    setBusy(true);
    try {
      const primaryItems = items
        .map((f) => f.display_name.trim())
        .filter(Boolean);

      const primaryType = await dispatch(
        createScopeType({
          org_id: orgId,
          label_singular: trimmedSingular,
          label_plural: trimmedPlural || trimmedSingular,
          icon: icon || "Folder",
          color,
          description: description.trim(),
          sort_order: sortOrder,
          max_assignments: maxAssignments
            ? parseInt(maxAssignments, 10)
            : undefined,
          parent_type_id:
            parentTypeId === NONE_VALUE ? undefined : parentTypeId,
          default_variable_keys: variableKeys,
        }),
      ).unwrap();

      for (const display_name of primaryItems) {
        await dispatch(
          createContextItem({
            scope_type_id: primaryType.id,
            key: slugifyKey(display_name) || display_name.toLowerCase(),
            display_name,
          }),
        ).unwrap();
      }

      dispatch(listScopeTypeItems(primaryType.id));
      dispatch(fetchScopes({ org_id: orgId }));
      dispatch(fetchScopeTypes(orgId));

      toast.success(`Created “${trimmedPlural || trimmedSingular}”`);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create scope",
      );
    } finally {
      setBusy(false);
    }
  }

  const canSave = labelSingular.trim().length > 0;
  const parentCandidates = existingTypes;

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title="Add a scope type"
      description="A scope type is a dimension you track — Clients, Products, Teams, anything. Define the context items you want for each one."
      expandButtonLabel="Scope type"
      dismissDisabled={busy}
      position="right"
      defaultSize={38}
    >
      <div className="space-y-5">
        {/* Basics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name (one item)</Label>
            <Input
              autoFocus
              value={labelSingular}
              onChange={(e) => handleSingularChange(e.target.value)}
              placeholder="Client"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name (many)</Label>
            <Input
              value={labelPlural}
              onChange={(e) => {
                setPluralEdited(true);
                setLabelPlural(e.target.value);
              }}
              placeholder="Clients"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div className="space-y-1.5">
            <Label className="text-xs">Icon</Label>
            <IconInputWithValidation
              value={icon}
              onChange={setIcon}
              showLucideLink={false}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <ScopeColorPicker
              value={color}
              onChange={setColor}
              disabled={busy}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <ProTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What goes here?"
            minHeight={64}
            autoGrow
            disabled={busy}
          />
        </div>

        {/* Context items to track */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-xs">
                Context items to track for each {labelSingular || "item"}
              </Label>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                Add a few now or skip — you can add more later from any scope.
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              Press Enter to add another
            </span>
          </div>
          <div className="space-y-1.5">
            {items.map((row, idx) => (
              <div key={row.id} className="flex items-center gap-2">
                <Input
                  ref={(el) => {
                    if (el) rowInputsRef.current.set(row.id, el);
                    else rowInputsRef.current.delete(row.id);
                  }}
                  placeholder={
                    idx === 0
                      ? "e.g. Industry"
                      : idx === 1
                        ? "e.g. Tier"
                        : "Another context item"
                  }
                  value={row.display_name}
                  onChange={(e) => updateItemRow(row.id, e.target.value)}
                  onKeyDown={(e) => handleItemRowKeyDown(e, idx)}
                  disabled={busy}
                  style={{ fontSize: "16px" }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItemRow(row.id)}
                  disabled={busy || items.length === 1}
                  aria-label="Remove context item"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={appendItemRow}
            disabled={busy}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add context item
          </Button>
        </div>

        {/* Advanced disclosure */}
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            disabled={busy}
          >
            {advancedOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Advanced settings
            <span className="text-xs text-muted-foreground font-normal">
              parent, sort order, max, default variables
            </span>
          </button>
        </div>

        {advancedOpen && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Sort order</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) =>
                    setSortOrder(parseInt(e.target.value, 10) || 0)
                  }
                  min={0}
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max assignments</Label>
                <Input
                  type="number"
                  value={maxAssignments}
                  onChange={(e) => setMaxAssignments(e.target.value)}
                  placeholder="Unlimited"
                  min={1}
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave blank for unlimited
                </p>
              </div>
            </div>

            {parentCandidates.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Parent type</Label>
                <Select
                  value={parentTypeId}
                  onValueChange={setParentTypeId}
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {parentCandidates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label_singular}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Default variable keys</Label>
              <div className="flex gap-2">
                <Input
                  value={variableKeyInput}
                  onChange={(e) => setVariableKeyInput(e.target.value)}
                  placeholder="e.g. budget_code"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addVariableKey();
                    }
                  }}
                  style={{ fontSize: "16px" }}
                  disabled={busy}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVariableKey}
                  disabled={busy || !variableKeyInput.trim()}
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
                        aria-label="Remove variable key"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Context variable keys auto-created when this scope is assigned
                to a record.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={!canSave || busy}
          >
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create scope type
          </Button>
        </div>
      </div>
    </MatrxDynamicPanelHost>
  );
}
