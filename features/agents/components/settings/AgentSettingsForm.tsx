"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAllAgentsArray,
} from "@/features/agents/redux/agent-definition/selectors";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Undo,
  Save,
  Copy,
  Activity,
  Globe,
  Star,
  Archive,
  Network,
  Layers,
} from "lucide-react";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import { useState, useEffect, useMemo } from "react";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import { selectModelNameById } from "@/features/ai-models/redux/modelRegistrySlice";

interface AgentSettingsFormProps {
  agentId: string;
}

export function AgentSettingsForm({ agentId }: AgentSettingsFormProps) {
  const dispatch = useAppDispatch();
  const agent = useAppSelector((state) => selectAgentById(state, agentId));
  const modelId = agent?.modelId || "";
  const allAgents = useAppSelector(selectAllAgentsArray);

  const [draft, setDraft] = useState<Partial<AgentDefinition>>({});
  const [tagsInput, setTagsInput] = useState("");
  const modelName = useAppSelector((state) =>
    selectModelNameById(state, modelId),
  );

  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    allAgents.forEach((a) => {
      if (a.category) cats.add(a.category);
    });
    return Array.from(cats).sort();
  }, [allAgents]);

  useEffect(() => {
    if (agent) {
      setDraft(agent);
      setTagsInput(agent.tags ? agent.tags.join(", ") : "");
    }
  }, [agent]);

  const isDirty = useMemo(() => {
    if (!agent) return false;
    for (const key of Object.keys(draft) as Array<keyof AgentDefinition>) {
      if (key === "tags") continue; // Handled separately
      if (draft[key] !== agent[key]) return true;
    }
    const currentTags = agent.tags || [];
    const draftTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (JSON.stringify(draftTags) !== JSON.stringify(currentTags)) return true;

    return false;
  }, [agent, draft, tagsInput]);

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Agent data not loaded
      </div>
    );
  }

  const handleUpdate = (field: keyof AgentDefinition, value: any) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Diff and dispatch
    for (const key of Object.keys(draft) as Array<keyof AgentDefinition>) {
      if (key === "tags") continue;
      if (draft[key] !== agent[key]) {
        dispatch(
          saveAgentField({ agentId, field: key, value: draft[key] as any }),
        );
      }
    }
    // Save tags
    const draftTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const currentTags = agent.tags || [];
    if (JSON.stringify(draftTags) !== JSON.stringify(currentTags)) {
      dispatch(
        saveAgentField({ agentId, field: "tags", value: draftTags as any }),
      );
    }
  };

  const handleCancel = () => {
    setDraft(agent);
    setTagsInput(agent.tags ? agent.tags.join(", ") : "");
  };

  // Ownership string
  let ownership = "Unknown";
  if (agent.agentType === "builtin") {
    ownership = "System";
  } else if (agent.isOwner) {
    ownership = "Mine";
  } else {
    ownership = "Shared";
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Top sticky static action bar (for saving state) */}
      <div className="flex items-center justify-between p-2 border-b bg-muted/40 shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          {isDirty ? "Unsaved changes..." : "All changes saved"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={!isDirty}
            onClick={handleCancel}
            title="Discard Changes"
            className="h-7 w-7"
          >
            <Undo className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!isDirty}
            onClick={handleSave}
            title="Save Changes"
            className="h-7 w-7"
          >
            <Save
              className={isDirty ? "w-3.5 h-3.5 text-primary" : "w-3.5 h-3.5"}
            />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 p-3 max-w-4xl mx-auto text-sm">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-semibold">Name</Label>
              <VoiceTextarea
                value={draft.name || ""}
                onChange={(e) => handleUpdate("name", e.target.value)}
                placeholder="Agent Name"
                className="bg-background/50 focus-visible:ring-primary/20 resize-none min-h-[40px]"
                minHeight={40}
                maxHeight={40}
                appendTranscript={false}
              />
            </div>

            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-semibold">Description</Label>
              <VoiceTextarea
                value={draft.description || ""}
                onChange={(e) => handleUpdate("description", e.target.value)}
                placeholder="Detailed description of this agent's capabilities..."
                className="bg-background/50 focus-visible:ring-primary/20"
                autoGrow={true}
                minHeight={100}
                appendTranscript={true}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-semibold">Category</Label>
              <Input
                list={`categories-${agentId}`}
                value={draft.category || ""}
                onChange={(e) => handleUpdate("category", e.target.value)}
                placeholder="e.g. Utilities"
                className="bg-background/50 focus-visible:ring-primary/20"
              />
              <datalist id={`categories-${agentId}`}>
                {uniqueCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-semibold">
                Tags{" "}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (comma separated)
                </span>
              </Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="tag1, tag2..."
                className="bg-background/50 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          {/* RAG retrieval boost — controls how heavily this agent's
              extracted content ranks against raw extracts in RAG search.
              Per-job overrides live on the page-extraction job builder. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 flex flex-col">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                Default RAG boost
                <span className="text-xs font-normal text-muted-foreground">
                  retrieval ranking
                </span>
              </Label>
              <Input
                type="number"
                step={5}
                min={-50}
                max={100}
                value={
                  draft.defaultRagBoost ?? agent.defaultRagBoost ?? 0
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  // Treat empty as 0 — server has a NOT NULL default 0,
                  // and "no boost" is the natural zero state.
                  if (raw === "") {
                    handleUpdate("defaultRagBoost", 0);
                    return;
                  }
                  const parsed = Math.round(Number.parseInt(raw, 10));
                  if (Number.isFinite(parsed)) {
                    handleUpdate("defaultRagBoost", parsed);
                  }
                }}
                placeholder="0"
                className="bg-background/50 focus-visible:ring-primary/20 font-mono"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Multiplier applied to this agent's extracted content in
                RAG search. <span className="font-medium">0</span> = no
                boost (default). <span className="font-medium">10–25</span>{" "}
                = lift over raw extracts.{" "}
                <span className="font-medium">50+</span> = pin near top.
                Negative values demote. Page-extraction jobs can override
                per-run.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="flex flex-col lg:col-span-8">
              {/* Read-Only Info Space Block */}
              <div className="flex flex-col gap-6 p-5 bg-card/40 backdrop-blur-sm border border-border/60 rounded-xl shadow-sm relative overflow-hidden h-full group hover:border-primary/30 transition-all duration-300">
                {/* Color splash */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground/70 uppercase tracking-widest text-[10px] font-bold">
                      ID
                    </span>
                    <div className="flex items-center gap-1.5 bg-background/60 rounded-md pl-2.5 pr-1 py-1 border border-border/50 max-w-fit">
                      <span className="font-mono text-foreground/80 text-[11px] tracking-tight">
                        {agent.id}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 rounded hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all ml-1"
                        onClick={() => navigator.clipboard.writeText(agent.id)}
                        title="Copy ID"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground/70 uppercase tracking-widest text-[10px] font-bold">
                      Model
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 truncate max-w-fit">
                      {modelName || modelId || "Default Selection"}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground/70 uppercase tracking-widest text-[10px] font-bold">
                      Ownership
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 max-w-fit">
                      {ownership}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground/70 uppercase tracking-widest text-[10px] font-bold">
                      Type
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1.5 rounded-md text-xs font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 max-w-fit">
                      {agent.agentType === "builtin"
                        ? "System"
                        : "User Generated"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:col-span-4">
              <div className="p-5 rounded-xl bg-card/40 backdrop-blur-sm border border-border/60 shadow-sm flex flex-col justify-center gap-5 h-full relative overflow-hidden group hover:border-primary/30 transition-all duration-300">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500/50 via-primary/50 to-purple-500/50 opacity-70"></div>

                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-500">
                      <Activity className="w-4 h-4" />
                    </div>
                    <Label
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() => handleUpdate("isActive", !draft.isActive)}
                    >
                      Active
                    </Label>
                  </div>
                  <Switch
                    checked={draft.isActive ?? false}
                    onCheckedChange={(c) => handleUpdate("isActive", c)}
                  />
                </div>

                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
                      <Globe className="w-4 h-4" />
                    </div>
                    <Label
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() => handleUpdate("isPublic", !draft.isPublic)}
                    >
                      Public
                    </Label>
                  </div>
                  <Switch
                    checked={draft.isPublic ?? false}
                    onCheckedChange={(c) => handleUpdate("isPublic", c)}
                  />
                </div>

                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500">
                      <Star className="w-4 h-4" />
                    </div>
                    <Label
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() =>
                        handleUpdate("isFavorite", !draft.isFavorite)
                      }
                    >
                      Favorite
                    </Label>
                  </div>
                  <Switch
                    checked={draft.isFavorite ?? false}
                    onCheckedChange={(c) => handleUpdate("isFavorite", c)}
                  />
                </div>

                <div className="flex items-center justify-between pl-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-zinc-500/10 text-zinc-500">
                      <Archive className="w-4 h-4" />
                    </div>
                    <Label
                      className="font-medium text-foreground cursor-pointer"
                      onClick={() =>
                        handleUpdate("isArchived", !draft.isArchived)
                      }
                    >
                      Archived
                    </Label>
                  </div>
                  <Switch
                    checked={draft.isArchived ?? false}
                    onCheckedChange={(c) => handleUpdate("isArchived", c)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Clickable Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className="flex flex-col items-center justify-center bg-card/40 backdrop-blur-sm border border-border/60 rounded-xl py-6 transition-all hover:bg-card/70 hover:border-primary/50 hover:shadow-md cursor-pointer group relative overflow-hidden"
              onClick={() =>
                dispatch(
                  openOverlay({
                    overlayId: "agentAdvancedEditorWindow",
                    data: {
                      initialAgentId: agent.id,
                      initialTab: "messages",
                      tabs: null,
                    },
                  }),
                )
              }
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-blue-500/20 transition-colors"></div>
              <span className="text-muted-foreground/80 uppercase tracking-wider text-[11px] font-bold mb-2 group-hover:text-primary transition-colors">
                Messages
              </span>
              <span className="font-mono font-bold text-3xl text-foreground/90">
                {agent.messages?.length || 0}
              </span>
            </div>

            <div
              className="flex flex-col items-center justify-center bg-card/40 backdrop-blur-sm border border-border/60 rounded-xl py-6 transition-all hover:bg-card/70 hover:border-primary/50 hover:shadow-md cursor-pointer group relative overflow-hidden"
              onClick={() =>
                dispatch(
                  openOverlay({
                    overlayId: "agentAdvancedEditorWindow",
                    data: {
                      initialAgentId: agent.id,
                      initialTab: "variables",
                      tabs: null,
                    },
                  }),
                )
              }
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-500/20 transition-colors"></div>
              <span className="text-muted-foreground/80 uppercase tracking-wider text-[11px] font-bold mb-2 group-hover:text-primary transition-colors">
                Variables
              </span>
              <span className="font-mono font-bold text-3xl text-foreground/90">
                {agent.variableDefinitions?.length || 0}
              </span>
            </div>

            <div
              className="flex flex-col items-center justify-center bg-card/40 backdrop-blur-sm border border-border/60 rounded-xl py-6 transition-all hover:bg-card/70 hover:border-primary/50 hover:shadow-md cursor-pointer group relative overflow-hidden"
              onClick={() =>
                dispatch(
                  openOverlay({
                    overlayId: "agentAdvancedEditorWindow",
                    data: {
                      initialAgentId: agent.id,
                      initialTab: "tools",
                      tabs: null,
                    },
                  }),
                )
              }
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/20 transition-colors"></div>
              <span className="text-muted-foreground/80 uppercase tracking-wider text-[11px] font-bold mb-2 group-hover:text-primary transition-colors">
                Tools
              </span>
              <span className="font-mono font-bold text-3xl text-foreground/90">
                {(agent.tools?.length || 0) + (agent.customTools?.length || 0)}
              </span>
            </div>
          </div>

          <div className="space-y-4 pt-4 pb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-pink-500/10 text-pink-500 border border-pink-500/20">
                <Network className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-semibold text-foreground/90 text-base tracking-tight">
                  Hierarchy Scopes
                </h3>
                <p className="text-xs text-muted-foreground">
                  Bind this agent to organizational structures to restrict
                  visibility or functionality context.
                </p>
              </div>
            </div>

            <div className="relative group rounded-xl bg-card/40 backdrop-blur-sm border border-border/60 p-5 shadow-sm overflow-hidden transition-all duration-300 hover:border-pink-500/30 hover:shadow-md">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500/40 via-purple-500/40 to-blue-500/40 opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="pt-1">
                <HierarchyCascade
                  levels={["organization", "scope", "project", "task"]}
                  value={{
                    ...EMPTY_SELECTION,
                    organizationId: draft.organizationId || null,
                    projectId: draft.projectId || null,
                    taskId: draft.taskId || null,
                  }}
                  onChange={(sel) => {
                    handleUpdate("organizationId", sel.organizationId);
                    handleUpdate("projectId", sel.projectId);
                    handleUpdate("taskId", sel.taskId);
                  }}
                  layout="vertical"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
