"use client";

/**
 * QuicksetPanel — fast, two-column shortcuts into the existing per-conversation
 * run-control state. It deliberately owns no settings state: every control
 * delegates to the same Redux actions/components as its full tab counterpart.
 */

import { useEffect, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { QuickRunModelSelect } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunSettingsQuickControls } from "@/features/agents/components/run-controls/RunSettingsEditor";
import { RunToolPicker } from "./RunToolPicker";
import { RunSkillPicker } from "./RunSkillPicker";
import { SandboxPanel } from "@/features/agents/components/chat/SandboxPanel";
import {
  selectBuilderAdvancedSettings,
  selectShowVariablePanel,
  selectSubmitOnEnter,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  setBuilderAdvancedSettings,
  setShowVariablePanel,
  setSubmitOnEnter,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { selectWorkingDocEnabled } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { setConversationDocumentEnabledThunk } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { setScratchpadGateThunk } from "@/features/agents/redux/execution-system/instance-working-document/scratchpad.thunks";
import { selectInstanceClientTools } from "@/features/agents/redux/execution-system/instance-client-tools/instance-client-tools.selectors";
import {
  selectAgentIdFromInstance,
  selectConversationSandboxBinding,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import {
  selectAgentCustomTools,
  selectAgentMcpServers,
  selectAgentTools,
  selectAgentReadyForCustomExecution,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  selectAllTools,
  selectToolsStatus,
} from "@/features/agents/redux/tools/tools.selectors";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import { fetchAgentExecutionFull } from "@/features/agents/redux/agent-definition/thunks";

interface QuicksetPanelProps {
  conversationId: string;
  isCreator: boolean;
  showCreatorPanel: boolean;
  onToggleCreatorPanel: () => void;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-9 grid-cols-3 items-center gap-3">
      <span className="text-xs text-foreground">{label}</span>
      <div className="col-span-2 min-w-0">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row label={label}>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </Row>
  );
}

function PickerRow({
  label,
  summary,
  children,
}: {
  label: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <Row label={label}>
      <Popover modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full justify-between text-xs font-normal"
          >
            <span className="truncate">{summary}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(30rem,calc(100vw-2rem))] p-0"
        >
          {children}
        </PopoverContent>
      </Popover>
    </Row>
  );
}

function SimpleList({ items, empty }: { items: string[]; empty: string }) {
  return (
    <div className="max-h-64 overflow-y-auto p-2">
      {items.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li
              key={item}
              className="truncate rounded-sm bg-muted/50 px-2 py-1 text-xs text-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function QuicksetPanel({
  conversationId,
  isCreator,
  showCreatorPanel,
  onToggleCreatorPanel,
}: QuicksetPanelProps) {
  const dispatch = useAppDispatch();
  const submitOnEnter = useAppSelector(selectSubmitOnEnter(conversationId));
  const showVariables = useAppSelector(selectShowVariablePanel(conversationId));
  const workingDocument = useAppSelector(selectWorkingDocEnabled(conversationId));
  const scratch = useAppSelector(
    selectWorkingDocEnabled(conversationId, "scratch"),
  );
  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const agentId = useAppSelector(selectAgentIdFromInstance(conversationId));
  const agentToolIds = useAppSelector((state) =>
    agentId ? selectAgentTools(state, agentId) : [],
  );
  const customTools = useAppSelector((state) =>
    agentId ? selectAgentCustomTools(state, agentId) : [],
  );
  const mcpServers = useAppSelector((state) =>
    agentId ? selectAgentMcpServers(state, agentId) : [],
  );
  const toolCatalog = useAppSelector(selectAllTools);
  const toolsStatus = useAppSelector(selectToolsStatus);
  const agentReady = useAppSelector((state) =>
    agentId ? selectAgentReadyForCustomExecution(state, agentId) : true,
  );
  const surfaceTools = useAppSelector(selectInstanceClientTools(conversationId));
  const sandboxBinding = useAppSelector((state) => {
    const conversation = state.conversations.byConversationId[conversationId];
    const surfaceBinding = conversation?.sourceFeature
      ? state.userPreferences.coding.activeAgentSandboxBySurface[
          conversation.sourceFeature
        ]
      : null;
    return (
      selectConversationSandboxBinding(conversationId)(state) ??
      surfaceBinding ??
      null
    );
  });

  // Mirror the full Tools tab so the compact Agent Tools summary is accurate
  // even when Quickset is the first run-controls surface the user opens.
  useEffect(() => {
    if (toolsStatus !== "succeeded" && toolsStatus !== "loading") {
      void dispatch(fetchAvailableTools());
    }
  }, [dispatch, toolsStatus]);

  useEffect(() => {
    if (agentId && !agentReady) {
      void dispatch(fetchAgentExecutionFull(agentId));
    }
  }, [agentId, agentReady, dispatch]);

  const catalogNames = new Map((toolCatalog ?? []).map((tool) => [tool.id, tool.name]));
  const agentTools = [
    ...(Array.isArray(agentToolIds)
      ? agentToolIds.map((id) => catalogNames.get(id) ?? id)
      : []),
    ...(Array.isArray(customTools) ? customTools.map((tool) => tool.name) : []),
    ...(Array.isArray(mcpServers) ? mcpServers : []),
  ];
  const addedTools = settings.addedTools ?? [];
  const addedSkills = settings.addedSkills ?? [];

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 py-3">
      <div className="space-y-1.5">
        <ToggleRow
          label="Submit on Enter"
          checked={submitOnEnter}
          onCheckedChange={(value) =>
            dispatch(setSubmitOnEnter({ conversationId, value }))
          }
        />
        <ToggleRow
          label="Show Creator Panel"
          checked={showCreatorPanel}
          onCheckedChange={onToggleCreatorPanel}
          disabled={!isCreator}
        />
        <ToggleRow
          label="Show Variables"
          checked={showVariables}
          onCheckedChange={(value) =>
            dispatch(setShowVariablePanel({ conversationId, value }))
          }
        />
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Row label="Active Context">
          <span aria-hidden="true" />
        </Row>
        <ToggleRow
          label="Working Document"
          checked={workingDocument}
          onCheckedChange={(enabled) =>
            void dispatch(
              setConversationDocumentEnabledThunk({
                conversationId,
                kind: "working",
                enabled,
              }),
            )
          }
        />
        <ToggleRow
          label="Scratch"
          checked={scratch}
          onCheckedChange={(enabled) =>
            void dispatch(setScratchpadGateThunk({ conversationId, enabled }))
          }
        />
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Row label="Model">
          <QuickRunModelSelect conversationId={conversationId} className="w-full" />
        </Row>
        <PickerRow
          label="Agent Tools"
          summary={`${agentTools.length} configured`}
        >
          <SimpleList items={agentTools} empty="No agent tools configured." />
        </PickerRow>
        <PickerRow
          label="Surface Tools"
          summary={`${surfaceTools.length} available`}
        >
          <SimpleList items={surfaceTools} empty="No surface tools are active." />
        </PickerRow>
        <PickerRow
          label="Add Tools"
          summary={addedTools.length ? `${addedTools.length} added` : "Choose tools"}
        >
          <div className="h-[26rem]">
            <RunToolPicker conversationId={conversationId} />
          </div>
        </PickerRow>
        <ToggleRow
          label="Disable Tool Injection"
          checked={settings.disableToolInjection ?? false}
          onCheckedChange={(value) =>
            dispatch(
              setBuilderAdvancedSettings({
                conversationId,
                changes: { disableToolInjection: value },
              }),
            )
          }
        />
      </div>

      <Separator />

      <PickerRow
        label="Skills"
        summary={`${addedSkills.length} skills`}
      >
        <div className="h-[26rem]">
          <RunSkillPicker conversationId={conversationId} />
        </div>
      </PickerRow>

      <Separator />

      <PickerRow
        label="Agent Sandbox"
        summary={
          sandboxBinding?.name ??
          sandboxBinding?.proxyUrl.match(/\/sandboxes\/([^/]+)/)?.[1] ??
          (sandboxBinding ? sandboxBinding.rowId.slice(0, 8) : "No sandbox bound")
        }
      >
        <SandboxPanel conversationId={conversationId} />
      </PickerRow>

      <Separator />

      <RunSettingsQuickControls conversationId={conversationId} quickset />
    </div>
  );
}
