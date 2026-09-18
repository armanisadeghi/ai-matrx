"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  Loader2,
  RefreshCw,
  Waypoints,
  Wrench,
} from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  applyOwnedAgentToolDelta,
  fetchAgentExecutionFull,
  isAvailableToolModel,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectAgentReadyForCustomExecution,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  fetchModelById,
  selectModelById,
  selectModelDetailError,
  selectModelFullyLoaded,
} from "@/features/ai-models/redux/modelRegistrySlice";
import {
  resolveModelControls,
  supportsTools,
} from "@/features/agents/hooks/useModelControls";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import {
  selectAllTools,
  selectToolsError,
  selectToolsStatus,
} from "@/features/agents/redux/tools/tools.selectors";

/** The authenticated AI Dream MCP resource server, not the outbound MCP catalog. */
const AI_DREAM_MCP_URL = "https://server.app.matrxserver.com/api/mcp";

/**
 * Lets a person add the currently registered Google dispatcher to one of their
 * agents. The selected Google account remains an inspection choice: no account
 * identifier is persisted on an agent by this component.
 */
export function GoogleAgentToolsSection() {
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);

  return (
    <GoogleAgentToolsSectionContent
      key={`${userId ?? "anonymous"}:${organizationId ?? "no-organization"}`}
    />
  );
}

function GoogleAgentToolsSectionContent() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const tools = useAppSelector(selectAllTools);
  const toolsStatus = useAppSelector(selectToolsStatus);
  const toolsError = useAppSelector(selectToolsError);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentLoadAttempt, setAgentLoadAttempt] = useState(0);
  const [agentLoadError, setAgentLoadError] = useState<string | null>(null);
  const [agentUnavailable, setAgentUnavailable] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const googleMarketingTool = tools.find(
    (tool) => tool.name === "google_marketing",
  );
  const googleWorkspaceTool = tools.find(
    (tool) => tool.name === "google_workspace",
  );
  const selectedAgent = useAppSelector((state) =>
    selectedAgentId ? selectAgentById(state, selectedAgentId) : undefined,
  );
  const agentReady = useAppSelector((state) =>
    selectedAgentId
      ? selectAgentReadyForCustomExecution(state, selectedAgentId)
      : false,
  );
  const modelId = selectedAgent?.modelId ?? null;
  const model = useAppSelector((state) =>
    modelId ? selectModelById(state, modelId) : undefined,
  );
  const modelReady = useAppSelector((state) =>
    selectModelFullyLoaded(state, modelId),
  );
  const modelError = useAppSelector((state) =>
    modelId ? selectModelDetailError(state, modelId) : null,
  );
  const modelControls =
    modelId && isAvailableToolModel(model)
      ? resolveModelControls([model], modelId).normalizedControls
      : null;
  const modelSupportsTools = supportsTools(modelControls);
  const hasGoogleMarketing = Boolean(
    googleMarketingTool &&
    selectedAgent?.tools?.includes(googleMarketingTool.id),
  );
  const hasGoogleWorkspace = Boolean(
    googleWorkspaceTool &&
    selectedAgent?.tools?.includes(googleWorkspaceTool.id),
  );

  useEffect(() => {
    void dispatch(fetchAvailableTools());
  }, [dispatch]);

  useEffect(() => {
    if (!selectedAgentId) return;
    let current = true;
    const selectedId = selectedAgentId;
    void dispatch(fetchAgentExecutionFull(selectedId))
      .unwrap()
      .then(() => {
        if (
          current &&
          !selectAgentReadyForCustomExecution(store.getState(), selectedId)
        ) {
          setAgentUnavailable(true);
        }
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setAgentLoadError(
          extractErrorMessage(
            cause,
            "This agent could not be loaded. Try another agent.",
          ),
        );
      });
    return () => {
      current = false;
    };
  }, [agentLoadAttempt, dispatch, selectedAgentId, store]);

  useEffect(() => {
    if (!modelId || modelReady) return;
    void dispatch(fetchModelById(modelId));
  }, [dispatch, modelId, modelReady]);

  async function applyToolChange(toolId: string, shouldAdd: boolean) {
    if (!selectedAgentId) return;
    setAssignmentError(null);
    setSaving(true);
    try {
      await dispatch(
        applyOwnedAgentToolDelta({
          agentId: selectedAgentId,
          addToolIds: shouldAdd ? [toolId] : [],
          removeToolIds: shouldAdd ? [] : [toolId],
        }),
      ).unwrap();
      toast.success(
        shouldAdd
          ? "Google tool added to this agent."
          : "Google tool removed from this agent.",
      );
    } catch (cause) {
      setAssignmentError(
        extractErrorMessage(
          cause,
          "The Google tool could not be updated. Try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function copyMcpUrl() {
    void navigator.clipboard
      .writeText(AI_DREAM_MCP_URL)
      .then(() => toast.success("AI Dream MCP server URL copied."))
      .catch(() => toast.error("Could not copy the server URL."));
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Waypoints className="h-4 w-4 text-primary" /> Use Google with
            agents
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add read access to one of your AI Matrx agents. Google accounts are
            checked at each call; choosing an account above does not bind it to
            an agent.
          </p>
        </div>
      </div>

      {toolsStatus === "loading" || toolsStatus === "idle" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking available agent
          tools…
        </p>
      ) : toolsStatus === "failed" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive">
          <span>{toolsError ?? "Agent tools could not be loaded."}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void dispatch(fetchAvailableTools())}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : !googleMarketingTool ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Google data access is being prepared. This assignment is available
          when the registered Google marketing tool is active.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Read Google marketing data
            </Badge>
            <span className="text-xs text-muted-foreground">
              Read-only: Search Console, Analytics, Tag Manager and YouTube
              for your sites and channels.
            </span>
          </div>

          <AgentListInlinePicker
            consumerId="google-workspace-agent-tool-picker"
            onSelect={(agentId) => {
              setSelectedAgentId(agentId);
              setAgentLoadError(null);
              setAgentUnavailable(false);
              setAssignmentError(null);
            }}
            activeAgentId={selectedAgentId}
            initialTab="mine"
            visibleTabs={["mine"]}
            autoFocusSearch={false}
            className="h-72 rounded-lg border border-border bg-background"
          />

          {selectedAgentId ? (
            <AgentToolAssignment
              agentName={selectedAgent?.name ?? "Selected agent"}
              loading={!agentReady && !agentLoadError && !agentUnavailable}
              loadError={agentLoadError}
              agentUnavailable={agentUnavailable}
              modelAssigned={modelId !== null}
              modelReady={modelReady}
              modelAvailable={isAvailableToolModel(model)}
              modelSupportsTools={modelSupportsTools}
              modelError={modelError}
              saving={saving}
              assignmentError={assignmentError}
              hasGoogleMarketing={hasGoogleMarketing}
              hasGoogleWorkspace={hasGoogleWorkspace}
              onToggleGoogleMarketing={() =>
                void applyToolChange(
                  googleMarketingTool.id,
                  !hasGoogleMarketing,
                )
              }
              onRetryLoad={() => {
                setAgentLoadError(null);
                setAgentUnavailable(false);
                setAgentLoadAttempt((attempt) => attempt + 1);
              }}
              onRetryModel={() => {
                if (modelId) void dispatch(fetchModelById(modelId));
              }}
              onToggleGoogleWorkspace={
                googleWorkspaceTool
                  ? () =>
                      void applyToolChange(
                        googleWorkspaceTool.id,
                        !hasGoogleWorkspace,
                      )
                  : undefined
              }
            />
          ) : null}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">
          Use Google from your MCP app
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the AI Dream MCP server in your MCP app, then Sign in with AI
          Matrx when it asks. No token is copied or stored here.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="max-w-full overflow-x-auto rounded bg-muted px-2 py-1 text-xs text-foreground">
            {AI_DREAM_MCP_URL}
          </code>
          <Button size="sm" variant="outline" onClick={copyMcpUrl}>
            <Clipboard className="mr-1.5 h-3.5 w-3.5" /> Copy server URL
          </Button>
        </div>
      </div>
    </section>
  );
}

function AgentToolAssignment({
  agentName,
  loading,
  loadError,
  agentUnavailable,
  modelAssigned,
  modelReady,
  modelAvailable,
  modelSupportsTools,
  modelError,
  saving,
  assignmentError,
  hasGoogleMarketing,
  hasGoogleWorkspace,
  onToggleGoogleMarketing,
  onToggleGoogleWorkspace,
  onRetryLoad,
  onRetryModel,
}: {
  agentName: string;
  loading: boolean;
  loadError: string | null;
  agentUnavailable: boolean;
  modelAssigned: boolean;
  modelReady: boolean;
  modelAvailable: boolean;
  modelSupportsTools: boolean;
  modelError: string | null;
  saving: boolean;
  assignmentError: string | null;
  hasGoogleMarketing: boolean;
  hasGoogleWorkspace: boolean;
  onToggleGoogleMarketing: () => void;
  onToggleGoogleWorkspace?: () => void;
  onRetryLoad: () => void;
  onRetryModel: () => void;
}) {
  if (loading)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading {agentName}…
      </p>
    );
  if (loadError)
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <span>{loadError}</span>
        <Button size="sm" variant="outline" onClick={onRetryLoad}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  if (agentUnavailable)
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        <span>This agent is unavailable. Choose another agent or retry.</span>
        <Button size="sm" variant="outline" onClick={onRetryLoad}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );

  const additionBlocker = !modelAssigned
    ? "This agent has no model selected for new tool assignments."
    : modelError
      ? modelError
      : !modelReady
        ? "Checking whether this agent's model supports tools…"
        : !modelAvailable
          ? "This agent's model is unavailable for new tool assignments."
          : !modelSupportsTools
            ? "This agent's model does not support tools. Choose a tool-capable model before adding Google access."
            : null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{agentName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read-only: Search Console, Analytics, Tag Manager and YouTube for
            your sites and channels.
          </p>
          {additionBlocker ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              {!modelReady ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {additionBlocker}
              {modelError || (!modelAvailable && modelReady) ? (
                <Button
                  size="sm"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={onRetryModel}
                >
                  Retry model check
                </Button>
              ) : null}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant={hasGoogleMarketing ? "outline" : "default"}
          disabled={
            saving || (!hasGoogleMarketing && additionBlocker !== null)
          }
          onClick={onToggleGoogleMarketing}
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : hasGoogleMarketing ? (
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          ) : null}
          {hasGoogleMarketing
            ? "Remove Google marketing access"
            : "Add Google marketing access"}
        </Button>
      </div>
      {onToggleGoogleWorkspace ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Google Workspace editing
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Create and edit selected Docs and Sheets; prepare email.
            </p>
          </div>
          <Button
            size="sm"
            variant={hasGoogleWorkspace ? "outline" : "secondary"}
            disabled={
              saving || (!hasGoogleWorkspace && additionBlocker !== null)
            }
            onClick={onToggleGoogleWorkspace}
          >
            {hasGoogleWorkspace
              ? "Remove editing access"
              : "Add editing access"}
          </Button>
        </div>
      ) : null}
      {assignmentError ? (
        <p className="mt-3 text-sm text-destructive">{assignmentError}</p>
      ) : null}
    </div>
  );
}
