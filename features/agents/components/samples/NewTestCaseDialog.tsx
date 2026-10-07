"use client";

/**
 * NewTestCaseDialog — type a test case by hand: a name, one box per declared
 * variable, the human's own text, and the answer to compare against. Writes
 * through createAgentSample (the borrow button's insert, minus a source run).
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
  createAgentSample,
  type AgentContractHead,
} from "@/features/agents/samples/service";

import { ProTextarea } from "@/components/official/ProTextarea";
export interface NewTestCaseDialogProps {
  agentId: string;
  head: AgentContractHead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
}

export function NewTestCaseDialog({
  agentId,
  head,
  open,
  onOpenChange,
  onCreated,
}: NewTestCaseDialogProps) {
  const [label, setLabel] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [userInput, setUserInput] = useState("");
  const [referenceOutput, setReferenceOutput] = useState("");
  const [saving, setSaving] = useState(false);
  const declarations = head?.variableDeclarations ?? [];

  async function save() {
    setSaving(true);
    try {
      await createAgentSample({
        agentId,
        label,
        variables: values,
        userInput,
        referenceOutput,
        head,
      });
      toast.success("Test case saved as a candidate.");
      setLabel("");
      setValues({});
      setUserInput("");
      setReferenceOutput("");
      onOpenChange(false);
      await onCreated();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New test case</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            aria-label="Name"
            placeholder="Name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          {declarations.map((declaration) => (
            <label key={declaration.name} className="block space-y-1">
              <span className="type-meta text-muted-foreground">
                {declaration.label ?? declaration.name}
              </span>
              <ProTextarea
                aria-label={declaration.label ?? declaration.name}
                data-variable={declaration.name}
                rows={2}
                value={values[declaration.name] ?? ""}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [declaration.name]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <label className="block space-y-1">
            <span className="type-meta text-muted-foreground">Typed text</span>
            <ProTextarea
              aria-label="Typed text"
              rows={2}
              value={userInput}
              onChange={(event) => setUserInput(event.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="type-meta text-muted-foreground">Answer</span>
            <ProTextarea
              aria-label="Answer"
              rows={3}
              value={referenceOutput}
              onChange={(event) => setReferenceOutput(event.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !label.trim()} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
