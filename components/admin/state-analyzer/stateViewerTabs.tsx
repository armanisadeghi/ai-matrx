"use client";

import React, { useState } from "react";
import type { TabDefinition } from "@/components/official/FullScreenOverlay";
import type { RootState } from "@/lib/redux/store";
import GenericSliceViewer from "./sliceViewers/GenericSliceViewer";
import { featureSchemas } from "@/lib/redux/dynamic/featureSchema";
import { moduleSchemas } from "@/lib/redux/dynamic/moduleSchema";
import AgentDefinitionSliceViewer from "./sliceViewers/agent-definitions/AgentDefinitionSliceViewer";
import AgentDefinitionSliceViewerShadcn from "./sliceViewers/agent-definitions/AgentDefinitionSliceViewerShadcn";
import ExecutionInstanceInspector from "./execution-inspector/ExecutionInstanceInspector";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import InstanceUIStateSliceViewer from "./sliceViewers/InstanceUIStateSliceViewer";

export const TAB_INDEX_ID = "__tab_index__" as const;

const TabNavigationContext = React.createContext<
  ((tabId: string) => void) | null
>(null);

export function useTabNavigation() {
  return React.useContext(TabNavigationContext);
}

export { TabNavigationContext };

/** Default selected tab in `StateViewerWindow` — must match the first tab below. */
export const STATE_VIEWER_DEFAULT_TAB_ID = TAB_INDEX_ID;

function TabIndex({
  tabs,
  onSelectTab,
}: {
  tabs: { id: string; label: string }[];
  onSelectTab: (tabId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const sorted = [...tabs]
    .filter((t) => t.id !== TAB_INDEX_ID)
    .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));

  const filtered = sorted.filter((t) => {
    const label = t.label?.toLowerCase() ?? "";
    return label.includes(search.toLowerCase());
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground shrink-0">
          All Tabs ({sorted.length})
        </h2>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tabs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0.5 p-2">
          {filtered.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                "text-left px-3 py-1.5 rounded-md text-sm transition-colors truncate",
                "hover:bg-primary/10 text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full text-xs text-muted-foreground py-4 text-center">
              No tabs match &quot;{search}&quot;
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Slice keys that are explicitly covered by a dedicated tab in contentTabs. */
const REGISTERED_SLICE_KEYS = new Set<string>([
  "agentDefinition",
  "conversations",
  "variables",
  "instanceUserInput",
  "instanceUIState",
  "activeRequests",
  "messages",
  "instanceResources",
  "agentShortcut",
  "agentConsumers",
  "appContext",
  "instanceModelOverrides",
  "instanceContext",
  "instanceClientTools",
  "overlays",
  "overlayData",
  "voicePad",
  "windowManager",
  "urlSync",
  "canvas",
  "artifacts",
  "htmlPages",
  "textDiff",
  "noteVersions",
  "user",
  "userPreferences",
  "sms",
  "theme",
  "entities",
  "entityFields",
  "layout",
  "form",
  "testRoutes",
  "flashcardChat",
  "globalCache",
  "ui",
  "conversationList",
  "messageActions",
  "socketResponse",
  "socketTasks",
  "componentDefinitions",
  "appBuilder",
  "appletBuilder",
  "containerBuilder",
  "fieldBuilder",
  "customAppRuntime",
  "customAppletRuntime",
  "broker",
  "contextMenuCache",
  "agentCache",
  "promptExecution",
  "actionCache",
  "dbFunctionNode",
  "workflows",
  "workflowNodes",
  "messaging",
  "adminPreferences",
  "entitySystem",
  "agentSettings",
  "modelRegistry",
  "mcp",
  "adminDebug",
  "conversationList",
  "apiConfig",
]);

function OrphanSlicesViewer({
  state,
  registeredKeys,
}: {
  state: RootState;
  registeredKeys: Set<string>;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const orphanKeys = Object.keys(state).filter(
    (key) => !registeredKeys.has(key),
  );

  const filtered = orphanKeys.filter((k) =>
    k.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedState = selected
    ? (state as Record<string, unknown>)[selected]
    : null;

  return (
    <div className="h-full flex gap-2 p-2 overflow-hidden">
      <div className="w-56 shrink-0 flex flex-col gap-1 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter slices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
        <p className="text-xs text-muted-foreground px-1">
          {orphanKeys.length} unregistered slice
          {orphanKeys.length !== 1 ? "s" : ""}
          {search && ` · ${filtered.length} shown`}
        </p>
        <ScrollArea className="flex-1 border border-border rounded-md">
          <div className="p-1 space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-2 text-center">
                {orphanKeys.length === 0
                  ? "No orphaned slices found"
                  : `No match for "${search}"`}
              </p>
            )}
            {filtered.map((key) => (
              <button
                key={key}
                onClick={() => setSelected(key)}
                className={cn(
                  "w-full text-left px-2 py-1 rounded text-xs transition-colors truncate",
                  selected === key
                    ? "bg-primary/20 text-primary font-medium"
                    : "hover:bg-primary/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <GenericSliceViewer sliceKey={selected} state={selectedState} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
            Select a slice to inspect its state
          </div>
        )}
      </div>
    </div>
  );
}

export function getStateViewerTabs(
  completeState: RootState,
  onSelectTab?: (tabId: string) => void,
): TabDefinition[] {
  const contentTabs: TabDefinition[] = [
    {
      id: "_2_agentDefinition",
      label: "_2_Agent Definition",
      content: (
        <AgentDefinitionSliceViewerShadcn
          state={completeState.agentDefinition}
        />
      ),
    },
    {
      id: "_agentDefinition",
      label: "_Agent Definition",
      content: (
        <AgentDefinitionSliceViewer state={completeState.agentDefinition} />
      ),
    },
    {
      id: "executionInspector",
      label: "Execution Inspector",
      content: <ExecutionInstanceInspector />,
    },

    {
      id: "adminDebug",
      label: "Admin Debug",
      content: (
        <GenericSliceViewer
          sliceKey="adminDebug"
          state={completeState.adminDebug}
        />
      ),
    },
    {
      id: "conversationList",
      label: "Conversation List",
      content: (
        <GenericSliceViewer
          sliceKey="conversationList"
          state={completeState.conversationList}
        />
      ),
    },
    {
      id: "apiConfig",
      label: "API Config",
      content: (
        <GenericSliceViewer
          sliceKey="apiConfig"
          state={completeState.apiConfig}
        />
      ),
    },
    {
      id: "agentDefinition",
      label: "Agent Definition",
      content: (
        <GenericSliceViewer
          sliceKey="agentDefinition"
          state={completeState.agentDefinition}
        />
      ),
    },
    {
      id: "conversations",
      label: "Conversations",
      content: (
        <GenericSliceViewer
          sliceKey="conversations"
          state={completeState.conversations}
        />
      ),
    },
    {
      id: "instanceVariableValues",
      label: "Instance Variable Values",
      content: (
        <GenericSliceViewer
          sliceKey="instanceVariableValues"
          state={completeState.instanceVariableValues}
        />
      ),
    },
    {
      id: "instanceUserInput",
      label: "Instance User Input",
      content: (
        <GenericSliceViewer
          sliceKey="instanceUserInput"
          state={completeState.instanceUserInput}
        />
      ),
    },
    {
      id: "customInstanceUIState",
      label: "Custom Instance UI State",
      content: <InstanceUIStateSliceViewer />,
    },
    {
      id: "instanceUIState",
      label: "Instance UI State",
      content: (
        <GenericSliceViewer
          sliceKey="instanceUIState"
          state={completeState.instanceUIState}
        />
      ),
    },

    {
      id: "activeRequests",
      label: "Active Requests",
      content: (
        <GenericSliceViewer
          sliceKey="activeRequests"
          state={completeState.activeRequests}
        />
      ),
    },
    {
      id: "messages",
      label: "Messages",
      content: (
        <GenericSliceViewer
          sliceKey="messages"
          state={completeState.messages}
        />
      ),
    },

    {
      id: "instanceResources",
      label: "Instance Resources",
      content: (
        <GenericSliceViewer
          sliceKey="instanceResources"
          state={completeState.instanceResources}
        />
      ),
    },

    {
      id: "agentShortcut",
      label: "Agent Shortcuts",
      content: (
        <GenericSliceViewer
          sliceKey="agentShortcut"
          state={completeState.agentShortcut}
        />
      ),
    },
    {
      id: "agentConsumers",
      label: "Agent Consumers",
      content: (
        <GenericSliceViewer
          sliceKey="agentConsumers"
          state={completeState.agentConsumers}
        />
      ),
    },
    {
      id: "appContext",
      label: "App Context",
      content: (
        <GenericSliceViewer
          sliceKey="appContext"
          state={completeState.appContext}
        />
      ),
    },

    {
      id: "instanceModelOverrides",
      label: "Instance Model Overrides",
      content: (
        <GenericSliceViewer
          sliceKey="instanceModelOverrides"
          state={completeState.instanceModelOverrides}
        />
      ),
    },

    {
      id: "instanceContext",
      label: "Instance Context",
      content: (
        <GenericSliceViewer
          sliceKey="instanceContext"
          state={completeState.instanceContext}
        />
      ),
    },

    {
      id: "instanceClientTools",
      label: "Instance Client Tools",
      content: (
        <GenericSliceViewer
          sliceKey="instanceClientTools"
          state={completeState.instanceClientTools}
        />
      ),
    },

    {
      id: "overlays",
      label: "Overlays",
      content: (
        <GenericSliceViewer
          sliceKey="overlays"
          state={completeState.overlays}
        />
      ),
    },
    {
      id: "overlayData",
      label: "Overlay Data",
      content: (
        <GenericSliceViewer
          sliceKey="overlayData"
          state={completeState.overlayData}
        />
      ),
    },
    {
      id: "voicePad",
      label: "Voice Pad",
      content: (
        <GenericSliceViewer
          sliceKey="voicePad"
          state={completeState.voicePad}
        />
      ),
    },
    {
      id: "windowManager",
      label: "Window Manager",
      content: (
        <GenericSliceViewer
          sliceKey="windowManager"
          state={completeState.windowManager}
        />
      ),
    },
    {
      id: "urlSync",
      label: "URL Sync",
      content: (
        <GenericSliceViewer sliceKey="urlSync" state={completeState.urlSync} />
      ),
    },
    {
      id: "canvas",
      label: "Canvas",
      content: (
        <GenericSliceViewer sliceKey="canvas" state={completeState.canvas} />
      ),
    },
    {
      id: "artifacts",
      label: "Artifacts",
      content: (
        <GenericSliceViewer
          sliceKey="artifacts"
          state={completeState.artifacts}
        />
      ),
    },
    {
      id: "htmlPages",
      label: "HTML Pages",
      content: (
        <GenericSliceViewer
          sliceKey="htmlPages"
          state={completeState.htmlPages}
        />
      ),
    },
    {
      id: "textDiff",
      label: "Text Diff",
      content: (
        <GenericSliceViewer
          sliceKey="textDiff"
          state={completeState.textDiff}
        />
      ),
    },
    {
      id: "noteVersions",
      label: "Note Versions",
      content: (
        <GenericSliceViewer
          sliceKey="noteVersions"
          state={completeState.noteVersions}
        />
      ),
    },
    {
      id: "user",
      label: "User",
      content: (
        <GenericSliceViewer
          sliceKey="userProfile"
          state={completeState.userProfile}
        />
      ),
    },
    {
      id: "userPreferences",
      label: "User Preferences",
      content: (
        <GenericSliceViewer
          sliceKey="userPreferences"
          state={completeState.userPreferences}
        />
      ),
    },
    {
      id: "sms",
      label: "SMS",
      content: <GenericSliceViewer sliceKey="sms" state={completeState.sms} />,
    },
    {
      id: "theme",
      label: "Theme",
      content: (
        <GenericSliceViewer sliceKey="theme" state={completeState.theme} />
      ),
    },

    ...Object.keys(featureSchemas).map((key) => ({
      id: `feature-${key}`,
      label: `Feature: ${key}`,
      content: (
        <GenericSliceViewer
          sliceKey={key}
          state={completeState[key as keyof RootState]}
        />
      ),
    })),

    ...Object.keys(moduleSchemas).map((key) => ({
      id: `module-${key}`,
      label: `Module: ${key}`,
      content: (
        <GenericSliceViewer
          sliceKey={key}
          state={completeState[key as keyof RootState]}
        />
      ),
    })),

    {
      id: "cloudFiles",
      label: "Cloud Files",
      content: (
        <GenericSliceViewer
          sliceKey="cloudFiles"
          state={completeState.cloudFiles}
        />
      ),
    },
    {
      id: "layout",
      label: "Layout",
      content: (
        <GenericSliceViewer sliceKey="layout" state={completeState.layout} />
      ),
    },
    {
      id: "flashcardChat",
      label: "Flashcard Chat",
      content: (
        <GenericSliceViewer
          sliceKey="flashcardChat"
          state={completeState.flashcardChat}
        />
      ),
    },
    {
      id: "ui",
      label: "UI",
      content: <GenericSliceViewer sliceKey="ui" state={completeState.ui} />,
    },
    {
      id: "messageActions",
      label: "Message Actions",
      content: (
        <GenericSliceViewer
          sliceKey="messageActions"
          state={completeState.messageActions}
        />
      ),
    },
    {
      id: "socketResponse",
      label: "Stream Response",
      content: (
        <GenericSliceViewer
          sliceKey="socketResponse"
          state={completeState.socketResponse}
        />
      ),
    },
    {
      id: "socketTasks",
      label: "Socket Tasks",
      content: (
        <GenericSliceViewer
          sliceKey="socketTasks"
          state={completeState.socketTasks}
        />
      ),
    },
    {
      id: "componentDefinitions",
      label: "Component Definitions",
      content: (
        <GenericSliceViewer
          sliceKey="componentDefinitions"
          state={completeState.componentDefinitions}
        />
      ),
    },
    {
      id: "appBuilder",
      label: "App Builder",
      content: (
        <GenericSliceViewer
          sliceKey="appBuilder"
          state={completeState.appBuilder}
        />
      ),
    },
    {
      id: "appletBuilder",
      label: "Applet Builder",
      content: (
        <GenericSliceViewer
          sliceKey="appletBuilder"
          state={completeState.appletBuilder}
        />
      ),
    },
    {
      id: "containerBuilder",
      label: "Container Builder",
      content: (
        <GenericSliceViewer
          sliceKey="containerBuilder"
          state={completeState.containerBuilder}
        />
      ),
    },
    {
      id: "fieldBuilder",
      label: "Field Builder",
      content: (
        <GenericSliceViewer
          sliceKey="fieldBuilder"
          state={completeState.fieldBuilder}
        />
      ),
    },
    {
      id: "customAppRuntime",
      label: "Custom App Runtime",
      content: (
        <GenericSliceViewer
          sliceKey="customAppRuntime"
          state={completeState.customAppRuntime}
        />
      ),
    },
    {
      id: "broker",
      label: "Broker",
      content: (
        <GenericSliceViewer sliceKey="broker" state={completeState.broker} />
      ),
    },
    {
      id: "contextMenuCache",
      label: "Context Menu Cache",
      content: (
        <GenericSliceViewer
          sliceKey="contextMenuCache"
          state={completeState.contextMenuCache}
        />
      ),
    },
    {
      id: "agentCache",
      label: "Agent Cache",
      content: (
        <GenericSliceViewer
          sliceKey="agentCache"
          state={completeState.agentCache}
        />
      ),
    },
    {
      id: "promptExecution",
      label: "Prompt Execution",
      content: (
        <GenericSliceViewer
          sliceKey="promptExecution"
          state={completeState.promptExecution}
        />
      ),
    },
    {
      id: "actionCache",
      label: "Action Cache",
      content: (
        <GenericSliceViewer
          sliceKey="actionCache"
          state={completeState.actionCache}
        />
      ),
    },
    {
      id: "dbFunctionNode",
      label: "DB Function Node",
      content: (
        <GenericSliceViewer
          sliceKey="dbFunctionNode"
          state={completeState.dbFunctionNode}
        />
      ),
    },
    {
      id: "workflows",
      label: "Workflows",
      content: (
        <GenericSliceViewer
          sliceKey="workflows"
          state={completeState.workflows}
        />
      ),
    },
    {
      id: "workflowNodes",
      label: "Workflow Nodes",
      content: (
        <GenericSliceViewer
          sliceKey="workflowNodes"
          state={completeState.workflowNodes}
        />
      ),
    },
    {
      id: "messaging",
      label: "Messaging",
      content: (
        <GenericSliceViewer
          sliceKey="messaging"
          state={completeState.messaging}
        />
      ),
    },
    {
      id: "adminPreferences",
      label: "Admin Preferences",
      content: (
        <GenericSliceViewer
          sliceKey="adminPreferences"
          state={completeState.adminPreferences}
        />
      ),
    },
    {
      id: "agentSettings",
      label: "Agent Settings",
      content: (
        <GenericSliceViewer
          sliceKey="agentSettings"
          state={completeState.agentSettings}
        />
      ),
    },
    {
      id: "modelRegistry",
      label: "Model Registry",
      content: (
        <GenericSliceViewer
          sliceKey="modelRegistry"
          state={completeState.modelRegistry}
        />
      ),
    },

    {
      id: "mcp",
      label: "MCP",
      content: <GenericSliceViewer sliceKey="mcp" state={completeState.mcp} />,
    },
  ];

  // Build the complete set of registered keys: static + feature/module schema keys
  const allRegisteredKeys = new Set<string>([
    ...REGISTERED_SLICE_KEYS,
    ...Object.keys(featureSchemas),
    ...Object.keys(moduleSchemas),
  ]);

  const hasOrphans = Object.keys(completeState).some(
    (key) => !allRegisteredKeys.has(key),
  );

  if (hasOrphans) {
    contentTabs.push({
      id: "__orphan_slices__",
      label: "⚠ Orphaned Slices",
      content: (
        <OrphanSlicesViewer
          state={completeState}
          registeredKeys={allRegisteredKeys}
        />
      ),
    });
  }

  const tabIndex: TabDefinition = {
    id: TAB_INDEX_ID,
    label: "Tab Index",
    content: (
      <TabIndex tabs={contentTabs} onSelectTab={onSelectTab ?? (() => {})} />
    ),
  };

  return [tabIndex, ...contentTabs];
}
