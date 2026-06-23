"use client";

/**
 * AgentVariableEditor
 *
 * Redux-only editor for a single variable definition. The variable MUST
 * already exist in the store — the caller (Panel/Modal/Manager) is
 * responsible for creating it before mounting this editor.
 *
 * Every field change dispatches directly to Redux. No controlled-mode,
 * no local mirror of the variable's state, no drafting.
 *
 * The component configuration (input type, options, picklist binding, number
 * settings) is delegated to the shared, Redux-free
 * {@link CustomComponentConfigurator} — the same control used to author Context
 * Items, so the two surfaces never drift.
 */

import React, { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Loader2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import {
  sanitizeVariableName,
  shouldShowSanitizationPreview,
  variableValueToDisplay,
} from "@/features/agents/utils/variable-utils";
import type {
  VariableCustomComponent,
  VariableComponentType,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import { VariableInputComponent } from "@/features/agents/components/inputs/input-components/VariableInputComponent";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/slice";
import {
  buildCustomComponent,
  extractEffectiveValues,
} from "@/features/agents/utils/variable-customcomponent";
import type { ContextItemBinding } from "@/features/agents/types/agent-definition.types";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import {
  AGENT_BUILDER_CONTEXT_MENU_PROPS,
  buildAgentBuilderContextData,
} from "@/features/agents/agent-context/buildAgentBuilderContextData";
import { useAgentBuilderSurfaceScope } from "@/features/agents/hooks/useAgentBuilderSurfaceScope";
import { createList } from "@/features/user-lists/service";
import { CustomComponentConfigurator } from "./CustomComponentConfigurator";
import { ContextItemBindingEditor } from "./ContextItemBindingEditor";

// ─── Props ───────────────────────────────────────────────────────────────────

interface AgentVariableEditorProps {
  agentId: string;
  /** Current saved name of the variable. Changes when user renames. */
  variableName: string;
  /**
   * Names of OTHER variables (not this one). Used for duplicate detection.
   * Caller excludes the current variable's name.
   */
  existingNames?: string[];
  /**
   * Called after a successful rename. Parent should update whatever state
   * it uses to track the current selection (e.g. `variableName` it passes in).
   */
  onRenamed?: (newName: string) => void;
  readonly?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentVariableEditor({
  agentId,
  variableName,
  existingNames = [],
  onRenamed,
  readonly,
}: AgentVariableEditorProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const rawVariables = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );
  const variables: VariableDefinition[] = rawVariables ?? [];
  const variable = variables.find((v) => v.name === variableName);
  const helpTextRef = useRef<HTMLTextAreaElement>(null);
  const buildAgentScope = useAgentBuilderSurfaceScope(agentId);

  // Name buffer — local draft for editing; resets when the variable changes.
  const [nameDraft, setNameDraft] = useState(variableName);
  const [isConvertingPicklist, setIsConvertingPicklist] = useState(false);
  useEffect(() => {
    setNameDraft(variableName);
  }, [variableName]);

  if (!variable) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Variable not found.
      </p>
    );
  }

  const cc = variable.customComponent;
  const componentType: VariableComponentType = cc?.type ?? "textarea";
  const effective = extractEffectiveValues(cc);
  const isPicklistBound = !!effective.picklist?.listId;

  const sanitizedDraft = nameDraft.trim()
    ? sanitizeVariableName(nameDraft)
    : "";
  const showSanitizationPreview = shouldShowSanitizationPreview(nameDraft);
  const isDuplicate =
    !!sanitizedDraft &&
    sanitizedDraft !== variableName &&
    existingNames.includes(sanitizedDraft);

  // ── Dispatch helpers ──────────────────────────────────────────────────────

  const dispatchVariables = (next: VariableDefinition[]) => {
    dispatch(
      setAgentVariableDefinitions({
        id: agentId,
        variableDefinitions: next,
      }),
    );
  };

  const updateVariable = (patch: Partial<VariableDefinition>) => {
    dispatchVariables(
      variables.map((v) => (v.name === variableName ? { ...v, ...patch } : v)),
    );
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameBlur = () => {
    const sanitized = nameDraft.trim() ? sanitizeVariableName(nameDraft) : "";
    if (!sanitized) {
      setNameDraft(variableName);
      return;
    }
    if (sanitized === variableName) {
      setNameDraft(variableName);
      return;
    }
    if (existingNames.includes(sanitized)) return; // keep draft; dup border shows
    dispatchVariables(
      variables.map((v) =>
        v.name === variableName ? { ...v, name: sanitized } : v,
      ),
    );
    onRenamed?.(sanitized);
  };

  const handleDefaultValueChange = (v: unknown) =>
    updateVariable({ defaultValue: v });

  const handleRequiredChange = (v: boolean) =>
    updateVariable({ required: v || undefined });

  const handleHelpTextChange = (v: string) =>
    updateVariable({ helpText: v || undefined });

  const handleCustomComponentChange = (
    next: VariableCustomComponent | undefined,
  ) => updateVariable({ customComponent: next });

  const handleBindingChange = (next: ContextItemBinding | undefined) =>
    updateVariable({ binding: next });

  const isBound = !!variable.binding?.itemKey;
  const staticOptions = effective.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  const canConvertOptionsToPicklist =
    !readonly && !isPicklistBound && staticOptions.length > 0;

  const getHelpTextApplicationScope = () => {
    const el = helpTextRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selectedText =
      start !== end && el
        ? el.value.slice(Math.min(start, end), Math.max(start, end))
        : "";
    const contextMenuData = buildAgentBuilderContextData({
      agentScope: buildAgentScope(),
      fieldContent: el?.value ?? variable.helpText ?? "",
      focusedField: "variable_help_text",
    });

    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData: {
        ...contextMenuData,
        variable_name: variable.name,
        variable_help_text: variable.helpText ?? "",
        variable_default_value: variable.defaultValue ?? null,
        variable_required: !!variable.required,
        variable_custom_component: variable.customComponent ?? null,
        variable_binding: variable.binding ?? null,
        variable_json: JSON.stringify(variable),
        editable_target: {
          kind: "agent_variable",
          agentId,
          variableName: variable.name,
          field: "helpText",
        },
      },
    });
  };

  const handleConvertOptionsToPicklist = async () => {
    if (!userId) {
      toast.error("Sign in before creating a picklist.");
      return;
    }
    if (staticOptions.length === 0) return;

    setIsConvertingPicklist(true);
    try {
      const listName = `${variable.name.replace(/_/g, " ")} options`;
      const created = await createList({
        p_list_name: listName,
        p_description: `Created from agent variable "${variable.name}".`,
        p_user_id: userId,
        p_is_public: false,
        p_public_read: true,
        p_items: staticOptions.map((option) => ({
          Label: option,
          Description: option,
        })),
      });
      const createdRecord = Array.isArray(created) ? created[0] : created;
      const listId =
        typeof createdRecord === "string"
          ? createdRecord
          : (createdRecord as { list_id?: string; id?: string } | null)
              ?.list_id ??
            (createdRecord as { id?: string } | null)?.id;

      if (!listId) {
        throw new Error("The picklist was created, but no list id was returned.");
      }

      const nextCustomComponent = buildCustomComponent({
        type: componentType,
        options: [],
        allowOther: effective.allowOther,
        toggleValues: effective.toggleValues,
        min: effective.min,
        max: effective.max,
        step: effective.step,
        picklist: { listId },
      });

      updateVariable({
        customComponent: nextCustomComponent,
        defaultValue: "",
      });
      toast.success("Picklist created and linked to this variable.", {
        description: "Each option was copied as both the label and injected text.",
      });
    } catch (error) {
      toast.error("Could not convert options to a picklist.", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsConvertingPicklist(false);
    }
  };

  // ── Preview custom-component (for the default-value input at the bottom) ──
  const previewCc: VariableCustomComponent | undefined = buildCustomComponent({
    type: componentType,
    options: effective.options,
    allowOther: effective.allowOther,
    toggleValues: effective.toggleValues,
    min: effective.min,
    max: effective.max,
    step: effective.step,
    picklist: effective.picklist,
  });

  const defaultValueStr = String(variable.defaultValue ?? "");

  return (
    <div className="space-y-3">
      {/* ── Name ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Name</Label>
        <Input
          placeholder="e.g. city_name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          disabled={readonly}
          className={isDuplicate ? "border-destructive" : ""}
          style={{ fontSize: "16px" }}
        />
        {showSanitizationPreview && !readonly && (
          <div className="px-3 py-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <span className="text-blue-600 dark:text-blue-400">
              Will be saved as:{" "}
            </span>
            <span className="font-mono text-blue-800 dark:text-blue-300">
              {sanitizedDraft}
            </span>
          </div>
        )}
        {isDuplicate && (
          <p className="text-xs text-destructive">
            A variable with this name already exists.
          </p>
        )}
        {!isDuplicate &&
          sanitizedDraft &&
          sanitizedDraft !== variableName &&
          !readonly && (
            <p className="text-xs text-muted-foreground">
              Rename will apply when you click away.
            </p>
          )}
      </div>

      {/* ── Help Text ────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Help Text</Label>
        <ProTextarea
          ref={helpTextRef}
          surfaceName={AGENT_BUILDER_CONTEXT_MENU_PROPS.surfaceName}
          getApplicationScope={getHelpTextApplicationScope}
          enableHelpWithThis
          autoGrow
          placeholder="Optional — shown to users as a hint"
          value={variable.helpText ?? ""}
          onChange={(e) => handleHelpTextChange(e.target.value)}
          disabled={readonly}
          minHeight={48}
          maxHeight={160}
          className="text-base leading-relaxed"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* ── Required ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/50 rounded-lg border border-border">
        <Label className="text-sm font-medium cursor-pointer">Required</Label>
        <Switch
          checked={!!variable.required}
          onCheckedChange={handleRequiredChange}
          disabled={readonly}
        />
      </div>

      {/* ── Context-item binding ─────────────────────────────────────────── */}
      <ContextItemBindingEditor
        binding={variable.binding}
        onChange={handleBindingChange}
        readonly={readonly}
      />

      {/* ── Component configuration ───────────────────────────────────────
          A bound variable INHERITS its input from the context item, so the
          local configurator is replaced by an inheritance note. */}
      {isBound ? (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          Input type and options are <span className="font-medium">inherited from the
          bound context item</span>. At run time this variable is auto-filled from the
          active scope and hidden from the user; the default below applies only when no
          scope value is available.
        </div>
      ) : (
        <CustomComponentConfigurator
          value={variable.customComponent}
          onChange={handleCustomComponentChange}
          readonly={readonly}
        />
      )}

      {canConvertOptionsToPicklist && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="min-w-0">
            <Label className="text-sm font-medium">
              Convert options to picklist
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create a reusable picklist from these {staticOptions.length} options
              and link this variable to it. Each option is copied as both the
              public label and the injected text so you can refine it in Lists.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center"
            onClick={handleConvertOptionsToPicklist}
            disabled={isConvertingPicklist}
          >
            {isConvertingPicklist ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="h-4 w-4" />
            )}
            Convert to picklist
          </Button>
        </div>
      )}

      {/* ── Default Value ─────────────────────────────────────────────── */}
      <div className="space-y-1.5 p-3 bg-muted/30 rounded-lg border border-border">
        <Label className="text-sm font-medium">Default Value</Label>
        <p className="text-xs text-muted-foreground">
          Pre-fills this variable at run time. Leave blank for no default.
        </p>
        {readonly ? (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {variableValueToDisplay(variable.defaultValue) || (
              <span className="text-muted-foreground italic">None</span>
            )}
          </p>
        ) : componentType === "textarea" && !isPicklistBound ? (
          <Textarea
            autoGrow
            value={defaultValueStr}
            onChange={(e) => handleDefaultValueChange(e.target.value)}
            placeholder="Leave empty or type a default…"
            minHeight={48}
            maxHeight={160}
          />
        ) : (
          <VariableInputComponent
            value={isPicklistBound ? variable.defaultValue : defaultValueStr}
            onChange={handleDefaultValueChange}
            variableName={variableName || "variable"}
            customComponent={previewCc}
            hideLabel
            compact
          />
        )}
      </div>
    </div>
  );
}
