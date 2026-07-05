"use client";

/**
 * AgentMemoryEditor — body content for a single memory: new-memory form or
 * existing-memory editor. Content-only (WindowPanel slots handle header/
 * footer/sidebar chrome around it).
 */

import { useEffect, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  displayTitleForMemory,
  type AgentMemoryRow,
  type AgentMemoryScope,
} from "../types";
import type { UseAgentMemoriesReturn } from "../hooks/useAgentMemories";

function importanceLabel(value: number): string {
  if (value >= 0.8) return "High";
  if (value >= 0.4) return "Medium";
  return "Low";
}

interface NewMemoryFormProps {
  state: UseAgentMemoriesReturn;
}

export function NewMemoryForm({ state }: NewMemoryFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(0.5);
  const [scope, setScope] = useState<AgentMemoryScope>("user");

  const canSave = title.trim().length > 0 && content.trim().length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-memory-title" className="text-xs">
            Title
          </Label>
          <Input
            id="new-memory-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Preferred coding style"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-memory-content" className="text-xs">
            What should the agent remember?
          </Label>
          <Textarea
            id="new-memory-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write the memory as a clear statement of fact or preference…"
            className="min-h-32 resize-y"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Importance</Label>
            <span className="text-xs text-muted-foreground">
              {importanceLabel(importance)}
            </span>
          </div>
          <Slider
            value={[importance]}
            onValueChange={([v]) => setImportance(v)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Scope</Label>
          <div className="flex gap-2">
            {(["user", "organization"] as AgentMemoryScope[]).map((opt) => (
              <Button
                key={opt}
                type="button"
                size="sm"
                variant={scope === opt ? "default" : "outline"}
                className="h-7 flex-1 text-xs capitalize"
                onClick={() => setScope(opt)}
              >
                {opt === "user" ? "Just me" : "Organization"}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-auto flex justify-end pt-2">
          <Button
            type="button"
            size="sm"
            disabled={!canSave || state.saving}
            onClick={() =>
              void state.createMemory({ title, content, importance, scope })
            }
          >
            {state.saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save memory
          </Button>
        </div>
      </div>
    </div>
  );
}

interface MemoryDetailEditorProps {
  memory: AgentMemoryRow;
  state: UseAgentMemoriesReturn;
}

export function MemoryDetailEditor({ memory, state }: MemoryDetailEditorProps) {
  const [title, setTitle] = useState(() => displayTitleForMemory(memory));
  const [content, setContent] = useState(memory.content);
  const [importance, setImportance] = useState(memory.importance ?? 0.5);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setTitle(displayTitleForMemory(memory));
    setContent(memory.content);
    setImportance(memory.importance ?? 0.5);
  }, [memory.id, memory.content, memory.importance, memory.metadata]);

  const isDirty =
    title !== displayTitleForMemory(memory) ||
    content !== memory.content ||
    importance !== (memory.importance ?? 0.5);
  const isDeleting = state.deletingId === memory.id;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] capitalize">
            {memory.scope}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            Updated {new Date(memory.updated_at).toLocaleDateString()}
          </span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`memory-title-${memory.id}`} className="text-xs">
            Title
          </Label>
          <Input
            id={`memory-title-${memory.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`memory-content-${memory.id}`} className="text-xs">
            Content
          </Label>
          <Textarea
            id={`memory-content-${memory.id}`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-40 resize-y"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Importance</Label>
            <span className="text-xs text-muted-foreground">
              {importanceLabel(importance)}
            </span>
          </div>
          <Slider
            value={[importance]}
            onValueChange={([v]) => setImportance(v)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isDeleting}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            {isDeleting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Delete
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={!isDirty || !content.trim() || state.saving}
            onClick={() =>
              void state.saveMemory(memory.id, { title, content, importance })
            }
          >
            {state.saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save changes
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete this memory?"
        description="The agent will no longer remember this. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        busy={isDeleting}
        onConfirm={async () => {
          await state.deleteMemory(memory.id);
          setConfirmDeleteOpen(false);
        }}
      />
    </div>
  );
}
