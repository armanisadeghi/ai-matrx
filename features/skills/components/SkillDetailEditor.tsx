"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Eye,
  Loader2,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { useSkill } from "../hooks/useSkill";
import {
  draftToPatchBody,
  emptySkillDraft,
  skillRowToDraft,
} from "../redux/skillsConverters";
import {
  createSkill,
  deleteSkill,
  patchSkill,
} from "../redux/skillsThunks";
import type { SkillDraft, SkillType } from "../types";
import { SkillProjectAssociations } from "./SkillProjectAssociations";
import { SkillResourcesPanel } from "./SkillResourcesPanel";

interface SkillDetailEditorProps {
  skillId: string;
  onBack: () => void;
  /** Optional override — when present, the form is the create flow. */
  isNew?: boolean;
}

const KNOWN_SKILL_TYPES: SkillType[] = [
  "reference",
  "convention",
  "workflow",
  "task",
  "render_block",
  "mode",
  "agent_behavior",
];

export function SkillDetailEditor({
  skillId,
  onBack,
  isNew = false,
}: SkillDetailEditorProps) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { skill, loading: skillLoading } = useSkill({
    skillRef: isNew ? null : skillId,
  });

  const [draft, setDraft] = useState<SkillDraft>(emptySkillDraft);
  const [changed, setChanged] = useState<Set<keyof SkillDraft>>(new Set());
  const [previewMode, setPreviewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the form when the skill loads. Resets the dirty tracker.
  useEffect(() => {
    if (isNew) {
      setDraft(emptySkillDraft());
      setChanged(new Set());
      return;
    }
    if (skill) {
      setDraft(skillRowToDraft(skill));
      setChanged(new Set());
    }
  }, [isNew, skill]);

  const readOnly = !isNew && (skill?.isSystem ? !isAdmin : false);

  const set = <K extends keyof SkillDraft>(key: K, value: SkillDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setChanged((s) => {
      if (s.has(key)) return s;
      const next = new Set(s);
      next.add(key);
      return next;
    });
  };

  const dirty = isNew || changed.size > 0;

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        if (!draft.skillId.trim() || !draft.label.trim() || !draft.description.trim()) {
          toast.error("skill_id, label, and description are required.");
          return;
        }
        const result = await dispatch(createSkill({ draft }));
        if (createSkill.fulfilled.match(result)) {
          toast.success(`Created “${result.payload.label}”.`);
          // Stay on the editor for the new row — but flip to edit mode.
          setChanged(new Set());
          setDraft(skillRowToDraft(result.payload));
          // Tell the parent the new id so it can navigate cleanly.
          onBack();
        }
        return;
      }
      if (!skill) return;

      // Admin promotion: only sent when explicitly toggled.
      const patch = draftToPatchBody(draft, changed);
      // Admin-only fields (is_active toggle, etc) — admins can edit
      // is_active; non-admins only ever soft-delete via the trash button.
      const result = await dispatch(
        patchSkill({ skillId: skill.id, patch }),
      );
      if (patchSkill.fulfilled.match(result)) {
        toast.success(`Saved “${result.payload.label}”.`);
        setChanged(new Set());
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save skill.",
      );
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!skill) return;
    const confirmed = await confirm({
      title: `Delete “${skill.label}”?`,
      description:
        "Deactivates the skill — it will be hidden from your library and from every agent that included it. Can be re-activated by an admin from the registry.",
      confirmLabel: "Delete skill",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await dispatch(deleteSkill({ skillId: skill.id })).unwrap();
      toast.success(`Deleted “${skill.label}”.`);
      onBack();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete skill.",
      );
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isNew && skillLoading && !skill) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading skill…
      </div>
    );
  }

  if (!isNew && !skill) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Header onBack={onBack} title="Skill not found" subtitle={skillId} />
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          That skill is no longer available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header
        onBack={onBack}
        title={isNew ? "New skill" : draft.label || "(unnamed)"}
        subtitle={
          isNew
            ? "Fill the fields and Save to create."
            : `${draft.skillId} · ${draft.skillType}`
        }
        action={
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                type="button"
                onClick={doDelete}
                disabled={readOnly}
                title={
                  readOnly
                    ? "System skill — only admins can modify."
                    : "Delete (soft)"
                }
                className={cn(
                  "inline-flex items-center justify-center h-8 w-8 rounded-md",
                  "text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving || readOnly}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium",
                "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isNew ? "Create" : "Save"}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-4 py-4 space-y-5">
          {readOnly && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              System skill — read-only unless you’re an admin.
            </div>
          )}

          <Field label="skill_id" required>
            <Input
              value={draft.skillId}
              onChange={(e) => set("skillId", e.target.value)}
              placeholder="my-skill-id"
              className="font-mono"
              disabled={!isNew || readOnly}
            />
          </Field>

          <Field label="Label" required>
            <Input
              value={draft.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Display name"
              disabled={readOnly}
            />
          </Field>

          <Field label="Description" required>
            <Textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="One-line summary that drives discovery."
              rows={2}
              disabled={readOnly}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <select
                value={draft.skillType}
                onChange={(e) => set("skillType", e.target.value as SkillType)}
                disabled={readOnly}
                className={cn(
                  "h-9 px-2 text-sm rounded-md w-full",
                  "bg-background border border-border text-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                )}
              >
                {KNOWN_SKILL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {!KNOWN_SKILL_TYPES.includes(draft.skillType) && (
                  <option value={draft.skillType}>{draft.skillType}</option>
                )}
              </select>
            </Field>

            <Field label="Version">
              <Input
                value={draft.version ?? ""}
                onChange={(e) => set("version", e.target.value || null)}
                placeholder="1.0.0"
                disabled={readOnly}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Model preference">
              <Input
                value={draft.modelPreference ?? ""}
                onChange={(e) =>
                  set("modelPreference", e.target.value || null)
                }
                placeholder="claude-opus-4-7"
                disabled={readOnly}
              />
            </Field>
            <Field label="Icon name">
              <Input
                value={draft.iconName ?? ""}
                onChange={(e) => set("iconName", e.target.value || null)}
                placeholder="lightbulb"
                disabled={readOnly}
              />
            </Field>
          </div>

          <Field
            label="Body"
            hint="Markdown. Inlined into the agent's system prompt when included."
          >
            <BodyEditor
              value={draft.body}
              onChange={(v) => set("body", v)}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              disabled={readOnly}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <FieldRow>
              <Switch
                checked={draft.isPublic}
                onCheckedChange={(v) => set("isPublic", Boolean(v))}
                disabled={readOnly}
              />
              <Label className="text-sm">Public — visible to every user</Label>
            </FieldRow>
            <FieldRow>
              <Switch
                checked={draft.disableAutoInvocation}
                onCheckedChange={(v) => set("disableAutoInvocation", Boolean(v))}
                disabled={readOnly}
              />
              <Label className="text-sm">
                Disable auto invocation by trigger patterns
              </Label>
            </FieldRow>
          </div>

          {isAdmin && (
            <FieldRow>
              <Switch
                checked={draft.isSystem}
                onCheckedChange={(v) => set("isSystem", Boolean(v))}
              />
              <Label className="text-sm">
                System skill — visible to every user on every account
              </Label>
            </FieldRow>
          )}

          <ChipListField
            label="Platform targets"
            values={draft.platformTargets}
            onChange={(v) => set("platformTargets", v)}
            placeholder="darwin, win32, web…"
            disabled={readOnly}
          />

          <ChipListField
            label="Trigger patterns"
            values={draft.triggerPatterns}
            onChange={(v) => set("triggerPatterns", v)}
            placeholder="When asked about X…"
            disabled={readOnly}
          />

          {!isNew && skill && (
            <div className="pt-4 border-t border-border/60 space-y-5">
              <SkillProjectAssociations
                skillId={skill.id}
                editable={!readOnly}
              />
              <SkillResourcesPanel
                skillId={skill.id}
                editable={!readOnly}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small layout helpers
// ---------------------------------------------------------------------------

function Header({
  onBack,
  title,
  subtitle,
  action,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/60">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        )}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground truncate">
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate font-mono">
            {subtitle}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
        {required && (
          <Badge
            variant="outline"
            className="h-3.5 px-1 text-[9px] font-normal text-muted-foreground"
          >
            required
          </Badge>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

function ChipListField({
  label,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const commit = () => {
    const v = input.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setInput("");
  };
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-1.5 items-center">
        {values.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            className="gap-1 pr-1 font-normal"
          >
            <span>{v}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
                className="inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                ×
              </button>
            )}
          </Badge>
        ))}
        {!disabled && (
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Backspace" && !input && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={commit}
            placeholder={placeholder}
            className="h-7 w-44 text-xs"
          />
        )}
      </div>
    </Field>
  );
}

function BodyEditor({
  value,
  onChange,
  previewMode,
  setPreviewMode,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  previewMode: boolean;
  setPreviewMode: (b: boolean) => void;
  disabled?: boolean;
}) {
  const lineCount = useMemo(() => value.split("\n").length, [value]);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-muted/30 border-b border-border/60 text-xs text-muted-foreground">
        <span>
          {lineCount} line{lineCount === 1 ? "" : "s"} · markdown
        </span>
        <div className="inline-flex rounded border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setPreviewMode(false)}
            className={cn(
              "px-2 py-0.5 text-[11px] gap-1 inline-flex items-center",
              !previewMode
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent",
            )}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode(true)}
            className={cn(
              "px-2 py-0.5 text-[11px] gap-1 inline-flex items-center",
              previewMode
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent",
            )}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
        </div>
      </div>
      {previewMode ? (
        <pre className="text-xs font-mono whitespace-pre-wrap p-3 max-h-[400px] overflow-y-auto bg-muted/20">
          {value || (
            <span className="text-muted-foreground/60">
              Nothing to preview yet.
            </span>
          )}
        </pre>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          disabled={disabled}
          className="font-mono text-xs border-0 rounded-none focus-visible:ring-0 resize-y"
          placeholder="# My Skill\n\nUse this skill when…"
        />
      )}
    </div>
  );
}
