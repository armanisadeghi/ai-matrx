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
import { toast } from "@/lib/toast";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";

import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { ConnectionsSkillsDraftSnapshot } from "@/features/surfaces/manifests/connections-skills.manifest";

import { useSkill } from "../hooks/useSkill";
import { selectAllSkills } from "../redux/skillsSelectors";
import {
  draftToPatchBody,
  emptySkillDraft,
  skillRowToDraft,
} from "../redux/skillsConverters";
import { createSkill, deleteSkill, patchSkill } from "../redux/skillsThunks";
import type { SkillDraft, SkillType } from "../types";
import MarkdownStream from "@/components/MarkdownStream";
import { SkillProjectAssociations } from "./SkillProjectAssociations";
import { SkillResourcesPanel } from "./SkillResourcesPanel";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { SessionContextItem } from "@/features/transcript-studio/types";

interface SkillDetailEditorProps {
  skillId: string;
  onBack: () => void;
  /** Optional override — when present, the form is the create flow. */
  isNew?: boolean;
  /**
   * Route that opens ONE skill, for the parent-skill door. Supplied only by
   * surfaces that HAVE such a route (the super-admin console's `?open=`); the
   * entity registry gives `skill` no `hrefFor` on purpose, so everywhere else
   * the parent is previewable but not navigable. See `SkillsBrowser`.
   */
  skillHref?: (skillId: string) => string;
  /**
   * Surface this editor is mounted inside, when that surface declares
   * agent-writable draft targets (`matrx-user/connections-skills`). Supplying
   * it registers the write handlers below; omit it and the editor behaves
   * exactly as before — the super-admin console mount declares no targets.
   */
  surfaceName?: string;
  /**
   * Hands the live draft up to the surface emitter so the `skill_draft_*`
   * read twins reflect the staged form rather than the saved row. Called with
   * null on unmount.
   */
  onDraftSnapshot?: (snapshot: ConnectionsSkillsDraftSnapshot | null) => void;
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
  skillHref,
  surfaceName,
  onDraftSnapshot,
}: SkillDetailEditorProps) {
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { skill, loading: skillLoading } = useSkill({
    skillRef: isNew ? null : skillId,
  });
  // Resolve the parent skill's NAME from the slice the browser already loaded —
  // no second fetch. Absent → the door still renders, on the id.
  const allSkills = useAppSelector(selectAllSkills);

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

  const parentSkill = draft.parentSkillId
    ? (allSkills.find((s) => s.id === draft.parentSkillId) ?? null)
    : null;

  // The metadata fields around Body (skill_id, label, description, type,
  // triggers) so agent actions run on the body text (Clean up, bound agents,
  // etc.) know what skill they're editing rather than seeing bare markdown.
  const skillContextItems = useMemo<SessionContextItem[]>(() => {
    const items: SessionContextItem[] = [
      {
        id: "skill-id",
        key: "skill_id",
        label: "Skill ID",
        value: draft.skillId || "(unset)",
      },
      {
        id: "skill-label",
        key: "skill_label",
        label: "Skill label",
        value: draft.label || "(unset)",
      },
      {
        id: "skill-description",
        key: "skill_description",
        label: "Skill description",
        value: draft.description || "(unset)",
      },
      {
        id: "skill-type",
        key: "skill_type",
        label: "Skill type",
        value: draft.skillType,
      },
    ];
    if (draft.triggerPatterns.length > 0) {
      items.push({
        id: "skill-trigger-patterns",
        key: "skill_trigger_patterns",
        label: "Trigger patterns",
        value: draft.triggerPatterns.join("\n"),
      });
    }
    return items;
  }, [
    draft.skillId,
    draft.label,
    draft.description,
    draft.skillType,
    draft.triggerPatterns,
  ]);

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

  // ── Surface write targets (`matrx-user/connections-skills`) ─────────────
  // The editor is a deep child of SkillsSection's provider, so it registers
  // its own handlers and hands its draft up for the read twins. Every handler
  // stages through the SAME `set()` the inputs' onChange calls — an applied
  // write is a keystroke, not a parallel path, and the user still saves.
  const formUnusable = !isNew && !skill;

  useEffect(() => {
    if (!onDraftSnapshot) return;
    if (formUnusable) {
      onDraftSnapshot(null);
      return;
    }
    onDraftSnapshot({
      skill_draft_label: draft.label,
      skill_draft_description: draft.description,
      skill_draft_type: draft.skillType,
      skill_draft_body: draft.body,
      skill_draft_trigger_patterns: draft.triggerPatterns,
      skill_draft_unsaved_fields: isNew
        ? Object.keys(draft)
        : [...changed].map(String),
      skill_draft_read_only: readOnly,
    });
  }, [draft, changed, isNew, readOnly, formUnusable, onDraftSnapshot]);

  useEffect(
    () => () => onDraftSnapshot?.(null),
    [onDraftSnapshot],
  );

  /** Shared refusal for every target: no usable form, or a form the viewer
   *  cannot save into. Throwing is the contract — the writeback seam turns it
   *  into an error the agent reads. */
  const assertWritable = (target: string) => {
    if (formUnusable) {
      throw new Error(
        `Cannot apply ${target}: no skill is open in the editor. Open a skill from the list (or start a new one) first.`,
      );
    }
    if (readOnly) {
      throw new Error(
        `Cannot apply ${target}: “${draft.label || draft.skillId}” is a system skill and you are not an admin, so the form is read-only. Nothing was staged.`,
      );
    }
  };

  const requireText = (
    target: string,
    value: unknown,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
  ): string => {
    if (typeof value !== "string") {
      throw new Error(
        `${target} expects a plain string, received ${Array.isArray(value) ? "an array" : typeof value}. Send the text itself, not JSON.`,
      );
    }
    if (!allowEmpty && !value.trim()) {
      throw new Error(`${target} cannot be empty.`);
    }
    return value;
  };

  useSurfaceWriteHandlers(surfaceName ?? null, {
    skill_label: (value) => {
      assertWritable("skill_label");
      const next = requireText("skill_label", value);
      if (next !== next.trim()) {
        throw new Error(
          "skill_label must not have leading or trailing whitespace.",
        );
      }
      set("label", next);
    },
    skill_description: (value) => {
      assertWritable("skill_description");
      set("description", requireText("skill_description", value).trim());
    },
    skill_type: (value) => {
      assertWritable("skill_type");
      const next = requireText("skill_type", value);
      if (!KNOWN_SKILL_TYPES.includes(next)) {
        throw new Error(
          `skill_type must be one of ${KNOWN_SKILL_TYPES.join(", ")} — received “${next}”.`,
        );
      }
      set("skillType", next);
    },
    skill_body: (value) => {
      assertWritable("skill_body");
      set("body", requireText("skill_body", value, { allowEmpty: true }));
    },
    skill_trigger_patterns: (value) => {
      assertWritable("skill_trigger_patterns");
      if (!Array.isArray(value)) {
        throw new Error(
          `skill_trigger_patterns expects an array of strings, received ${typeof value}. It replaces the full set — send [] to clear it.`,
        );
      }
      const next = value.map((entry, i) => {
        if (typeof entry !== "string" || !entry.trim()) {
          throw new Error(
            `skill_trigger_patterns[${i}] must be a non-empty string.`,
          );
        }
        return entry.trim();
      });
      if (new Set(next).size !== next.length) {
        throw new Error("skill_trigger_patterns must not contain duplicates.");
      }
      set("triggerPatterns", next);
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        if (
          !draft.skillId.trim() ||
          !draft.label.trim() ||
          !draft.description.trim()
        ) {
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
      const result = await dispatch(patchSkill({ skillId: skill.id, patch }));
      if (patchSkill.fulfilled.match(result)) {
        toast.success(`Saved “${result.payload.label}”.`);
        setChanged(new Set());
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save skill.");
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

      <div className="flex-1 overflow-y-auto scrollbar-thin pb-72">
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

          {/* THE DOOR LAW, corollary 1: a relationship the code can resolve
              must be RENDERED and LINKED. `parent_skill_id` was loaded on
              every skill, carried through the draft, and shown nowhere — the
              editor knew the lineage and said nothing. `parentSkill` is null
              when the slice has not loaded it; EntityRef then shows the
              truncated id rather than an invented name. */}
          {!isNew && draft.parentSkillId && (
            <Field label="Parent skill">
              <div className="flex h-9 items-center">
                <EntityRef
                  token="skill"
                  id={draft.parentSkillId}
                  name={parentSkill?.label ?? null}
                  href={
                    skillHref ? skillHref(draft.parentSkillId) : undefined
                  }
                  alwaysShowActions
                />
              </div>
            </Field>
          )}

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
                onChange={(e) => set("modelPreference", e.target.value || null)}
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
              contextItems={skillContextItems}
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
                onCheckedChange={(v) =>
                  set("disableAutoInvocation", Boolean(v))
                }
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
              <SkillResourcesPanel skillId={skill.id} editable={!readOnly} />
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
          <Badge key={v} variant="secondary" className="gap-1 pr-1 font-normal">
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
  contextItems,
}: {
  value: string;
  onChange: (v: string) => void;
  previewMode: boolean;
  setPreviewMode: (b: boolean) => void;
  disabled?: boolean;
  /** Skill metadata (id, label, description, type, triggers) — passed to
   * every agent action (Clean up, bound agents) run against the body. */
  contextItems: SessionContextItem[];
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
        <div className="p-3">
          {value === "" ? (
            <span className="text-xs text-muted-foreground/60">
              Nothing to preview yet.
            </span>
          ) : (
            <MarkdownStream content={value} />
          )}
        </div>
      ) : (
        <ProTextarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoGrow={true}
          // rows={14}
          disabled={disabled}
          className="font-mono text-xs border-0 rounded-none focus-visible:ring-0 resize-y"
          placeholder="# My Skill\n\nUse this skill when…"
          surfaceName="connections-skills"
          cleanupContextItems={contextItems}
          surfaceContextItems={contextItems}
        />
      )}
    </div>
  );
}
