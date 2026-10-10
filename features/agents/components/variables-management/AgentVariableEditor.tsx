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
 * The component configuration (input type, options, pick list binding, number
 * settings) is delegated to the shared, Redux-free
 * {@link CustomComponentConfigurator} — the same control used to author Context
 * Items, so the two surfaces never drift.
 */

import React, { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { Input } from "@ai-matrx/design-system";
import { SwitchLegacy as Switch } from "@/components/ui/switch";
import { Button } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Loader2, WandSparkles } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  sanitizeVariableName,
  shouldShowSanitizationPreview,
  variableValueToDisplay,
} from "@ai-matrx/chat/agents/utils/variable-utils";
import type {
  VariableCustomComponent,
  VariableComponentType,
  VariableDefinition,
} from "@ai-matrx/chat/agents/types/agent-definition.types";
import { VariableInputComponent } from "@ai-matrx/chat/agents/components/inputs/input-components/VariableInputComponent";
import { useAppSelector, useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectAgentVariableDefinitions } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  setAgentVariableDefinitions,
} from "@/features/agents/redux/agent-builder.slice";
import {
  buildCustomComponent,
  extractEffectiveValues,
} from "@ai-matrx/chat/agents/utils/variable-customcomponent";
import type { VariableBinding } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  contextItemBindingOf,
  isCustomDataBinding,
} from "@ai-matrx/chat/agents/utils/variable-binding";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import {
  AGENT_BUILDER_CONTEXT_MENU_PROPS,
  buildAgentBuilderContextData,
} from "@ai-matrx/chat/agents/agent-context/buildAgentBuilderContextData";
import { useAgentBuilderSurfaceScope } from "@/features/agents/hooks/useAgentBuilderSurfaceScope";
import { createList } from "@/features/data-tables/pick-lists/service";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { CustomComponentConfigurator } from "./CustomComponentConfigurator";
import { ContextItemBindingEditor } from "./ContextItemBindingEditor";
import {
  isAutoAssignValue,
  supportsRandomAssignment,
} from "@ai-matrx/chat/agents/utils/auto-assignment";

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
  const store = useAppStore();
  // See updateVariable: the name a write targets, following a same-event rename.
  const currentName = useRef(variableName);
  useEffect(() => {
    currentName.current = variableName;
  }, [variableName]);
  const userId = useAppSelector(selectUserId);
  const { organizationId, organizationState } = useOrganizationRequired();
  const rawVariables = useAppSelector((state) =>
    selectAgentVariableDefinitions(state, agentId),
  );
  const variables: VariableDefinition[] = rawVariables ?? [];
  const variable = variables.find((v) => v.name === variableName);
  const helpTextRef = useRef<HTMLTextAreaElement>(null);
  const buildAgentScope = useAgentBuilderSurfaceScope(agentId);

  // Name buffer — local draft for editing; resets when the variable changes.
  // The field shows what the person typed ("Normal Text"); the `{{key}}` the
  // messages use (`normal_text`) is derived from it on blur and kept beside it.
  const shownName = variable?.label?.trim() || humanizeIdentifier(variableName) || variableName;
  const [nameDraftState, setNameDraftState] = useState({
    sourceName: variableName,
    value: shownName,
  });
  const nameDraft =
    nameDraftState.sourceName === variableName
      ? nameDraftState.value
      : shownName;
  const setNameDraft = (value: string) =>
    setNameDraftState({ sourceName: variableName, value });
  const [isConvertingPicklist, setIsConvertingPicklist] = useState(false);

  if (!variable) {
    return (
      <p className="type-body text-muted-foreground italic">
        {
          // access-errors: ok — name lookup in the browser-local Redux variable list of the loaded agent, no record read involved
          "Variable not found."
        }
      </p>
    );
  }

  const cc = variable.customComponent;
  const componentType: VariableComponentType = cc?.type ?? "textarea";
  const effective = extractEffectiveValues(cc);
  const isPicklistBound = !!effective.structuredList?.listId;

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

  // EVERY WRITE READS THE STORE, NOT THIS RENDER: a write made in the same
  // event sequence as a rename (blur, then a control's handler, before React
  // re-renders) must target the new name and the renamed list, or it matches
  // nothing and re-dispatches the pre-rename list. `currentName` follows it.
  const updateVariable = (patch: Partial<VariableDefinition>) => {
    const latest =
      selectAgentVariableDefinitions(store.getState(), agentId) ?? [];
    const name = currentName.current;
    dispatchVariables(
      latest.map((v) => (v.name === name ? { ...v, ...patch } : v)),
    );
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameBlur = () => {
    const typed = nameDraft.trim();
    const sanitized = typed ? sanitizeVariableName(typed) : "";
    if (!sanitized) {
      setNameDraft(shownName);
      return;
    }
    // The person's own words are the label; a name typed AS the key — or exactly
    // as the humanizer would say it — needs none (an untouched blur never dirties).
    const label =
      typed !== sanitized && typed !== humanizeIdentifier(sanitized) ? typed : undefined;
    if (sanitized === variableName) {
      if (label !== (variable.label?.trim() || undefined)) updateVariable({ label });
      setNameDraft(label ?? variableName);
      return;
    }
    if (existingNames.includes(sanitized)) return; // keep draft; dup border shows
    const latest =
      selectAgentVariableDefinitions(store.getState(), agentId) ?? [];
    const from = currentName.current;
    dispatchVariables(
      latest.map((v) => (v.name === from ? { ...v, name: sanitized, label } : v)),
    );
    currentName.current = sanitized;
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
  ) =>
    updateVariable({
      customComponent: next,
      ...(isAutoAssignValue(variable.defaultValue) &&
      !supportsRandomAssignment(next)
        ? { defaultValue: "" }
        : {}),
    });

  const handleBindingChange = (next: VariableBinding | undefined) =>
    updateVariable({ binding: next });

  const scopeBinding = contextItemBindingOf(variable.binding);
  const isBound = !!(scopeBinding?.itemKey || scopeBinding?.contextItemId);
  const isDataBound = isCustomDataBinding(variable.binding);
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
        variable_json: variable,
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
      toast.error("Sign in before creating a pick list.");
      return;
    }
    if (!organizationId || organizationState !== "ready") {
      toast.error(
        "Choose an organization before creating a pick list. A list has to live in one.",
      );
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
        p_organization_id: organizationId,
        p_items: staticOptions.map((option) => ({
          Label: option,
          Description: option,
        })),
      });
      const createdRecord = Array.isArray(created) ? created[0] : created;
      const listId =
        typeof createdRecord === "string"
          ? createdRecord
          : ((createdRecord as { list_id?: string; id?: string } | null)
              ?.list_id ?? (createdRecord as { id?: string } | null)?.id);

      if (!listId) {
        throw new Error(
          "The pick list was created, but no list id was returned.",
        );
      }

      const nextCustomComponent = buildCustomComponent({
        type: componentType,
        options: [],
        allowOther: effective.allowOther,
        toggleValues: effective.toggleValues,
        min: effective.min,
        max: effective.max,
        step: effective.step,
        structuredList: { listId },
        randomAssignment: effective.randomAssignment,
      });

      updateVariable({
        customComponent: nextCustomComponent,
        defaultValue: "",
      });
      toast.success("Pick list created and linked to this variable.", {
        description:
          "Each option was copied as both the label and injected text.",
      });
    } catch (error) {
      toast.error("Could not convert options to a pick list.", {
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
    structuredList: effective.structuredList,
    randomAssignment: effective.randomAssignment,
  });

  const defaultValueStr = String(variable.defaultValue ?? "");

  return (
    <div className="min-w-0 space-y-3">
      {/* ── Name ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Name</Label>
        <Input
          placeholder="e.g. City Name"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          disabled={readonly}
          className={isDuplicate ? "border-destructive" : ""}
          style={{ fontSize: "16px" }}
        />
        {/* ONE fixed-height status line. These states appear and vanish as the
            name field blurs; when they changed the layout, the blur (which
            renames) moved every control below by a line between mousedown and
            mouseup, so the click on "Fill automatically" landed on nothing. */}
        {!readonly && (
          <p
            className={cn(
              "h-4 truncate type-secondary leading-4",
              isDuplicate ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {isDuplicate ? (
              "This name is taken"
            ) : sanitizedDraft &&
              (showSanitizationPreview || sanitizedDraft !== variableName) ? (
              <>
                In messages{" "}
                <code className="font-mono text-foreground">{`{{${sanitizedDraft}}}`}</code>
              </>
            ) : (
              ""
            )}
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
      <div className="flex items-center justify-between border-t border-border pt-3">
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
        variableName={variable.name}
      />

      {/* ── Component configuration ───────────────────────────────────────
          A bound variable INHERITS its input from the context item, so the
          local configurator is replaced by an inheritance note. */}
      {isDataBound ? (
        // The person running it sees the value locked, so no input type is configured here.
        <p className="border-t border-border pt-3 type-secondary text-foreground">
          {/* read-gate-exempt: static label for data-bound variables, not an empty view */}
          <span className="font-medium">Filled from your data</span> on every
          run
        </p>
      ) : isBound ? (
        // Input type comes from the bound context item; at run time the value is
        // auto-filled from the active scope and hidden, the default applying only
        // when no scope value exists.
        <p className="border-t border-border pt-3 type-secondary text-foreground">
          <span className="font-medium">Filled from the active scope</span> ·
          input type inherited
        </p>
      ) : (
        <CustomComponentConfigurator
          value={variable.customComponent}
          resourceValue={variable.defaultValue}
          onChange={handleCustomComponentChange}
          readonly={readonly}
          allowAutomaticAssignment
        />
      )}

      {canConvertOptionsToPicklist && (
        <div className="space-y-2 border-t border-border pt-3">
          {/* Each option is copied as both the public label and the injected text, refinable in Lists. */}
          <div className="min-w-0">
            <Label className="text-sm font-medium">
              Convert options to pick list
            </Label>
            <p className="mt-0.5 type-secondary text-muted-foreground">
              {/* read-gate-exempt: options typed into this variable's editor, not rows fetched from a read */}
              Reuse these {staticOptions.length} options as a list
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
            Convert to pick list
          </Button>
        </div>
      )}

      {/* ── Default Value ─────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-1.5 border-t border-border pt-3">
        <Label className="text-sm font-medium">Default Value</Label>
        <p className="type-secondary text-muted-foreground">
          {/* read-gate-exempt: help wording chosen by the variable's own binding; nothing is read */}
          {isDataBound || isBound ? "Used when the filled value is empty" : "Pre-fills it at run time; blank for none"}
        </p>
        {readonly ? (
          <p className="type-body text-foreground whitespace-pre-wrap break-words">
            {variableValueToDisplay(variable.defaultValue) || (
              <span className="text-muted-foreground italic">None</span>
            )}
          </p>
        ) : componentType === "textarea" &&
          !isPicklistBound &&
          !effective.randomAssignment ? (
          <ProTextarea
            autoGrow
            value={defaultValueStr}
            onChange={(e) => handleDefaultValueChange(e.target.value)}
            placeholder="Leave empty or type a default…"
            minHeight={48}
            maxHeight={160}
          />
        ) : (
          <VariableInputComponent
            value={variable.defaultValue}
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
