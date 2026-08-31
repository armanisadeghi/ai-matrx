"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/styles/themes/utils";
import IconInputWithValidation from "@/components/official/icons/IconInputWithValidation.dynamic";
import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";
import { ProTextarea } from "@/components/official/ProTextarea";
import { StoredModelOverridesField } from "@/features/agents/components/run-controls/StoredModelOverridesField";
import type { RunConfigOverridesWords } from "@/features/agents/components/run-controls/RunConfigOverrides";

/** The stored blob, or null when it is absent / not an object. */
const asJsonObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Bottom-of-page Advanced fold. Covers every `agx_shortcut` column
 * that didn't earn a place in the main Settings section — the rare,
 * power-user knobs the user shouldn't see by default but mustn't lose.
 *
 *   • Active                       (boolean)
 *   • Internal description         (text)
 *   • Icon name                    (lucide)
 *   • Keyboard shortcut            (text)
 *   • Sort order                   (int)
 *   • Default user input           (text)
 *   • Response density             (enum)
 *   • Bypass gate seconds          (int, only when the gate is enabled)
 *   • Model & settings             (jsonb `llm_overrides`, edited through THE
 *                                   canonical model picker + settings panel —
 *                                   never a JSON textarea)
 *   • Default variables            (jsonb, behind the raw-JSON fold)
 *   • Context overrides            (jsonb, behind the raw-JSON fold)
 *   • JSON extraction              (jsonb, behind the raw-JSON fold)
 *
 * 🚨 RAW JSON IS NEVER THE PRIMARY EDITOR (Arman, 2026-08-31): *"users are not
 * expected to enter objects and we should, at no time, force them to do such a
 * thing."* The model — the one of the four that has a canonical control — gets
 * that control. The three that do not are kept, functional and unlosable,
 * behind a fold that says out loud what they are and that they are not
 * required.
 */

export type AdvancedFields = Pick<
  AgentShortcut,
  | "isActive"
  | "description"
  | "iconName"
  | "keyboardShortcut"
  | "sortOrder"
  | "defaultUserInput"
  | "responseDensity"
  | "autoRun"
  | "showPreExecutionGate"
  | "bypassGateSeconds"
  | "defaultVariables"
  | "contextOverrides"
  | "llmOverrides"
  | "jsonExtraction"
>;

/**
 * THE FOLD'S OWN WORDS — every user-visible string in here that names the thing
 * being edited, in ONE place.
 *
 * 🚨 The mechanic is fixed; the vocabulary is the host domain's. This fold is
 * mounted by the Gen-A shortcut editor AND by the one binding UI's OPTIONS
 * drawer, and the word "shortcut" (or "the surface") on a mandate screen is the
 * exact leak Arman rejected B1's first ship for. Same prop pattern the shared
 * binding row and the AI-map tab already use — `SurfaceVariableBinding
 * .sourceLabels`, `BindingSuggestionsTab.words`: a wording PROP at a second call
 * site, never a second component. Every default below is the shortcut wording
 * verbatim, so the shortcut editor passes nothing and is unchanged.
 */
export interface AdvancedSectionWords {
  heading: string;
  hint: string;
  activeTitle: string;
  activeHint: string;
  descriptionPlaceholder: string;
  iconHint: string;
  iconPlaceholder: string;
  contextOverridesHint: string;
  llmOverridesHint: string;
  jsonExtractionHint: string;
}

export const SHORTCUT_ADVANCED_WORDS: AdvancedSectionWords = {
  heading: "Advanced",
  hint: "Power-user knobs you rarely need to touch.",
  activeTitle: "Active",
  activeHint: "Inactive shortcuts are hidden from menus but kept in the DB.",
  descriptionPlaceholder: "What this shortcut does",
  iconHint: "Pick from the curated gallery or enter a Lucide icon name.",
  iconPlaceholder: "e.g. Sparkles, Flame, svg:icons/Home",
  contextOverridesHint:
    "Per-key values that override what the surface ships into context policies.",
  llmOverridesHint:
    'Override LLM parameters for this shortcut. Example: { "temperature": 0.2, "max_output_tokens": 1500 }',
  jsonExtractionHint:
    "Streaming JSON extraction config. NULL = off. See JsonExtractionConfig.",
};

export function AdvancedSection({
  value,
  onChange,
  disabled,
  omit,
  words,
  showLucideSources = true,
  overridesInstanceKey,
  overridesWords,
  overridesTitle,
}: {
  value: AdvancedFields;
  onChange: <K extends keyof AdvancedFields>(
    field: K,
    next: AdvancedFields[K],
  ) => void;
  disabled?: boolean;
  /**
   * Fields this host does NOT store, hidden rather than shown dead. A control
   * whose value goes nowhere is the defect this prop exists to prevent — the
   * one binding UI's OPTIONS drawer stores a job's presentation and not the
   * job's own description, so it omits that one field instead of offering an
   * edit that would be silently dropped. The shortcut editor omits nothing.
   */
  omit?: readonly (keyof AdvancedFields)[];
  /** This host's nouns. Omit any key to keep the shortcut wording. */
  words?: Partial<AdvancedSectionWords>;
  /**
   * May the icon field send the person OUT to Lucide — the "Search Lucide"
   * site frame and the `lucide.dev` anchor?
   *
   * 🚨 A no-code surface says NO. Our user is a Subject Matter Expert who has
   * never heard of an icon library; an outbound developer site is a dead end
   * dressed as help. The in-app curated gallery lists every bundled Lucide
   * name, registry icon and `svg:…` asset, so nothing is lost by refusing —
   * the picker still picks. The shortcut editor is a builder surface and keeps
   * the default.
   */
  showLucideSources?: boolean;
  /**
   * A stable id naming the RECORD being edited (`shortcut-<id>`,
   * `mandate-<id>`, …). It keys the scratch override draft that
   * `StoredModelOverridesField` uses to drive the canonical settings panel, so
   * two editors open at once never share one.
   */
  overridesInstanceKey: string;
  /** The overrides panel's own words, in the host's domain. */
  overridesWords?: Partial<RunConfigOverridesWords>;
  /** Heading for the model field. Hosts with a second settings surface on the
   * same screen must name this one distinctly. */
  overridesTitle?: string;
}) {
  const w = { ...SHORTCUT_ADVANCED_WORDS, ...words };
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const hidden = (field: keyof AdvancedFields) => omit?.includes(field) ?? false;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 py-1.5 text-sm font-semibold text-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", !open && "-rotate-90")}
        />
        {w.heading}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          {w.hint}
        </span>
      </button>

      {open && (
        <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-4">
          {!hidden("isActive") && (
            <ToggleRow
              title={w.activeTitle}
              hint={w.activeHint}
              checked={value.isActive}
              onChange={(v) => onChange("isActive", v)}
              disabled={disabled}
            />
          )}

          {!hidden("description") && (
            <FieldRow
              title="Internal description"
              hint="Notes for admins. Not shown to end users."
            >
              <ProTextarea
                value={value.description ?? ""}
                onChange={(e) => onChange("description", e.target.value || null)}
                rows={2}
                placeholder={w.descriptionPlaceholder}
                disabled={disabled}
                className="text-sm resize-none"
                style={{ fontSize: "16px" }}
              />
            </FieldRow>
          )}

          <FieldRow title="Icon" hint={w.iconHint}>
            <IconInputWithValidation
              value={value.iconName ?? ""}
              onChange={(next) => onChange("iconName", next || null)}
              placeholder={w.iconPlaceholder}
              disabled={disabled}
              showLucideLink={showLucideSources}
              showCuratedIconGallery
            />
          </FieldRow>

          <FieldRow title="Keyboard shortcut" hint="e.g. Cmd+Shift+K">
            <Input
              value={value.keyboardShortcut ?? ""}
              onChange={(e) =>
                onChange("keyboardShortcut", e.target.value || null)
              }
              placeholder="None"
              disabled={disabled}
              className="h-9 text-sm"
              style={{ fontSize: "16px" }}
            />
          </FieldRow>

          <FieldRow title="Sort order" hint="Lower numbers appear first.">
            <Input
              type="number"
              value={value.sortOrder}
              onChange={(e) =>
                onChange("sortOrder", Number(e.target.value) || 0)
              }
              disabled={disabled}
              className="h-9 text-sm w-32"
            />
          </FieldRow>

          <FieldRow
            title="Default user input"
            hint="Pre-fills the user message box on launch."
          >
            <ProTextarea
              value={value.defaultUserInput ?? ""}
              onChange={(e) =>
                onChange("defaultUserInput", e.target.value || null)
              }
              rows={2}
              placeholder="Hello"
              disabled={disabled}
              className="text-sm resize-none"
              style={{ fontSize: "16px" }}
            />
          </FieldRow>

          <FieldRow
            title="Response density"
            hint="Visual density of the result UI."
          >
            <Select
              value={value.responseDensity}
              onValueChange={(v) =>
                onChange("responseDensity", v as "comfortable" | "compact")
              }
              disabled={disabled}
            >
              <SelectTrigger className="h-9 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          {value.autoRun && value.showPreExecutionGate && (
            <FieldRow
              title="Bypass gate after"
              hint="Auto-confirm the pre-execution gate after N seconds."
            >
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={value.bypassGateSeconds}
                  onChange={(e) =>
                    onChange("bypassGateSeconds", Number(e.target.value) || 0)
                  }
                  disabled={disabled}
                  className="h-9 text-sm w-20"
                />
                <span className="text-xs text-muted-foreground">seconds</span>
              </div>
            </FieldRow>
          )}

          {/* 🚨 THE MODEL IS CHOSEN, NOT TYPED (Arman, 2026-08-31;
              VISION-RECONCILIATION B15/B16). This was a raw monospace textarea
              you entered `{"model": "…", "temperature": 0.2}` into — and on the
              one binding UI it was the ONLY way to pick a model at all. It is
              now the canonical model picker plus the canonical settings panel,
              both mounted unchanged. */}
          <StoredModelOverridesField
            instanceKey={`${overridesInstanceKey}-llm`}
            value={asJsonObject(value.llmOverrides)}
            onChange={(next) =>
              onChange("llmOverrides", next as AgentShortcut["llmOverrides"])
            }
            hint={w.llmOverridesHint}
            title={overridesTitle}
            words={overridesWords}
            disabled={disabled}
          />

          {/* 🚨 RAW JSON IS A DEVELOPER'S BACK DOOR, NEVER THE PRIMARY EDITOR.
              Three fields still have no control of their own, and the honest
              thing is to say so rather than to present typing an object as the
              normal way to answer a question. They stay fully functional —
              nothing stored is lost — behind a fold that names what they are
              and what is missing. The model settings, which DO have a control,
              are above and are not repeated here. */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setRawOpen((v) => !v)}
              className="flex w-full items-center gap-2 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  !rawOpen && "-rotate-90",
                )}
              />
              Raw JSON — for developers
              <span className="ml-1 text-[11px] font-normal text-muted-foreground/80">
                Three settings that do not have a control yet. Nothing here is
                required.
              </span>
            </button>

            {rawOpen && (
              <div className="space-y-1 rounded-lg border border-dashed border-border bg-background/60 px-3">
                <JsonFieldRow
                  title="Default variables"
                  hint={`Pre-filled values for the agent variables — overrides each variable's built-in default. Example: { "language": "en" }`}
                  value={value.defaultVariables}
                  onChange={(v) =>
                    onChange(
                      "defaultVariables",
                      v as AgentShortcut["defaultVariables"],
                    )
                  }
                  disabled={disabled}
                  placeholder="{}"
                />

                <JsonFieldRow
                  title="Context overrides"
                  hint={w.contextOverridesHint}
                  value={value.contextOverrides}
                  onChange={(v) =>
                    onChange(
                      "contextOverrides",
                      v as AgentShortcut["contextOverrides"],
                    )
                  }
                  disabled={disabled}
                  placeholder="{}"
                />

                <JsonFieldRow
                  title="JSON extraction"
                  hint={w.jsonExtractionHint}
                  value={value.jsonExtraction}
                  onChange={(v) =>
                    onChange(
                      "jsonExtraction",
                      v as AgentShortcut["jsonExtraction"],
                    )
                  }
                  disabled={disabled}
                  placeholder="null"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Local primitives
// ─────────────────────────────────────────────────────────────────────────

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
          {hint}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}

function FieldRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2.5 space-y-1.5">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Free-form JSON editor. Parses on every change so the parent only ever
 * gets a valid value; invalid input shows an inline error and the parent
 * keeps the last good value.
 */
function JsonFieldRow({
  title,
  hint,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  title: string;
  hint: string;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const initial = value == null ? "" : JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Sync local draft when the parent reset / loaded a new value.
  useEffect(() => {
    setDraft(value == null ? "" : JSON.stringify(value, null, 2));
    setError(null);
  }, [value]);

  const onTextChange = (next: string) => {
    setDraft(next);
    const trimmed = next.trim();
    if (trimmed === "") {
      setError(null);
      onChange(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <FieldRow title={title} hint={hint}>
      <Textarea
        value={draft}
        onChange={(e) => onTextChange(e.target.value)}
        rows={4}
        placeholder={placeholder}
        disabled={disabled}
        className="text-xs font-mono resize-y"
        style={{ fontSize: "13px" }}
      />
      {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
    </FieldRow>
  );
}
