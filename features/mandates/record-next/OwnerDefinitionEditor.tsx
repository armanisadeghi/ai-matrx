"use client";

// features/mandates/record-next/OwnerDefinitionEditor.tsx
//
// THE OWNER'S EDIT of a soft mandate's name, description and output — on the
// level-aware record only (the protected workspace's Output section has no
// editor at all). Rendered ONLY when `GET /mandates/{key}/definition-rights`
// says `can_edit`; otherwise it is absent (never a disabled pencil). The goal
// and the described inputs are edited in their own sections, through the same
// server gate.

import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { Section } from "@/features/mandates/workspace/Section";
import { OutputKindPicker } from "@/features/mandates/authoring/OutputKindPicker";
import { outputConstraintsOf } from "@/features/mandates/workspace/definition-output";
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";
import {
  fetchDefinitionRights,
  patchOwnerDefinition,
  type MandateDefinitionRights,
} from "./owner-service";

/** What this viewer may do to the definition. `null` while unknown or when
 * the read failed — every affordance stays absent until the server says yes. */
export function useDefinitionRights(
  mandateKey: string | null,
): MandateDefinitionRights | null {
  const dispatch = useAppDispatch();
  const [rights, setRights] = useState<MandateDefinitionRights | null>(null);
  useEffect(() => {
    if (!mandateKey) return;
    let live = true;
    setRights(null);
    fetchDefinitionRights(dispatch, mandateKey)
      .then((answer) => {
        if (live) setRights(answer);
      })
      .catch((error: unknown) => {
        // Absent, never dead: no edit affordance — and said loudly for us.
        console.error("[mandates] definition rights could not be read", mandateKey, error);
      });
    return () => {
      live = false;
    };
  }, [dispatch, mandateKey]);
  return rights;
}

export function OwnerDefinitionEditor({
  data,
  onChanged,
  organizationId = null,
}: {
  data: MandateWorkspaceData;
  onChanged: () => void;
  /** Organization seat: the route organization the write happens in. */
  organizationId?: string | null;
}) {
  const dispatch = useAppDispatch();
  const mandate = data.mandate;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [outputKind, setOutputKind] = useState<string | null>(null);
  const [constraints, setConstraints] = useState("");

  const open = () => {
    setLabel(mandate.label ?? "");
    setDescription(mandate.description ?? "");
    setOutputKind(mandate.output_kind ?? null);
    setConstraints(outputConstraintsOf(mandate) ?? "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchOwnerDefinition(dispatch, mandate.mandate_key, {
        label,
        description,
        outputKind,
        outputConstraints: constraints,
      }, organizationId);
      toast.success("Mandate updated.");
      setEditing(false);
      onChanged();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "The change was not saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      title="Name and output"
      actions={
        editing ? null : (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={open}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-3" data-testid="owner-definition-editor">
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="owner-mandate-label">Name</label>
            <Input
              id="owner-mandate-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="text-base sm:text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Description</label>
            <ProTextarea
              aria-label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this job is for, in a sentence"
              className="min-h-16 text-sm"
              minHeight={64}
              autoFocus={false}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Output format</label>
            <OutputKindPicker value={outputKind} onSelect={setOutputKind} disabled={saving} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Output constraints</label>
            <ProTextarea
              aria-label="Output constraints"
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              placeholder="For example: five bullet points, plain language"
              className="min-h-16 text-sm"
              minHeight={64}
              autoFocus={false}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-7 gap-1 text-[12px]" disabled={saving || !label.trim()} onClick={() => void save()}>
              <Check className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          You own this mandate, so you can rename it and change what it hands back.
        </p>
      )}
    </Section>
  );
}
