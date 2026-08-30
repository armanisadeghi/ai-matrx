"use client";

import { useState } from "react";
import { Plus, X, Pencil, AlertCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectVariableDefaults } from "@/lib/redux/slices/agent-settings/selectors";
import {
  addVariable,
  updateVariable,
  removeVariable,
} from "@/lib/redux/slices/agent-settings/agentSettingsSlice";
import type { AgentVariable } from "@/lib/redux/slices/agent-settings/types";

interface VariableFormState {
  name: string;
  defaultValue: string;
  required: boolean;
  helpText: string;
}

const emptyForm = (): VariableFormState => ({
  name: "",
  defaultValue: "",
  required: false,
  helpText: "",
});

interface VariableDefaultsEditorProps {
  agentId: string;
  /** Optional: message/system content to check if a variable is actually referenced */
  usedVariableNames?: Set<string>;
}

export function VariableDefaultsEditor({
  agentId,
  usedVariableNames,
}: VariableDefaultsEditorProps) {
  const dispatch = useAppDispatch();
  const variables = useAppSelector((state) =>
    selectVariableDefaults(state, agentId),
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form, setForm] = useState<VariableFormState>(emptyForm());

  const openAdd = () => {
    setModalMode("add");
    setEditingName(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  };

  const openEdit = (variable: AgentVariable) => {
    setModalMode("edit");
    setEditingName(variable.name);
    setForm({
      name: variable.name,
      defaultValue: variable.defaultValue,
      required: variable.required ?? false,
      helpText: variable.helpText ?? "",
    });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) return;

    const variable: AgentVariable = {
      name: trimmedName,
      defaultValue: form.defaultValue,
      required: form.required || undefined,
      helpText: form.helpText.trim() || undefined,
    };

    if (modalMode === "add") {
      dispatch(addVariable({ agentId, variable }));
    } else if (editingName) {
      dispatch(
        updateVariable({
          agentId,
          name: editingName,
          updates: variable,
        }),
      );
    }

    setIsModalOpen(false);
  };

  const handleRemove = (name: string) => {
    dispatch(removeVariable({ agentId, name }));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Variables
        </Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={openAdd}
          title="Add variable"
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {variables.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic">
          No variables defined
        </p>
      ) : (
        <div className="space-y-0.5">
          {variables.map((variable) => {
            const isUnused =
              usedVariableNames && !usedVariableNames.has(variable.name);

            return (
              <div
                key={variable.name}
                className="flex items-center gap-1.5 py-0.5 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <code className="text-xs font-mono text-foreground">
                      {`{{${variable.name}}}`}
                    </code>
                    {isUnused && (
                      <AlertCircle
                        className="w-3 h-3 text-amber-500 shrink-0"
                        aria-label="Variable is not used in any message"
                      />
                    )}
                  </div>
                  {variable.defaultValue && (
                    <p className="text-[10px] text-muted-foreground truncate max-w-40">
                      {variable.defaultValue}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => openEdit(variable)}
                    className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(variable.name)}
                    className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {modalMode === "add" ? "Add Variable" : "Edit Variable"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Variable Name</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value.replace(/\s/g, "_"),
                  }))
                }
                placeholder="my_variable"
                className="text-xs h-7 font-mono"
                disabled={modalMode === "edit"}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Default Value</Label>
              <Input
                value={form.defaultValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, defaultValue: e.target.value }))
                }
                placeholder="Default text…"
                className="text-xs h-7"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Help Text (optional)</Label>
              <Input
                value={form.helpText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, helpText: e.target.value }))
                }
                placeholder="Shown to users as a hint"
                className="text-xs h-7"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!form.name.trim()}
              className="text-xs"
            >
              {modalMode === "add" ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
