"use client";

/**
 * CreateAgentAppFormWrapper — top-level "new app" surface.
 *
 * Combines a searchable agent picker, a "Auto Create" tab (AI-generated UI
 * from a single sentence), and a "Manual" tab (full control). Mirrors the
 * legacy `features/prompt-apps/components/CreatePromptAppFormWrapper.tsx`.
 *
 * The picker drives both tabs: until an agent is selected, both tabs are
 * disabled and a single empty-state message points the user at the picker.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Wrench, MousePointerClick } from "lucide-react";
import { Label } from "@/components/ui/label";
import { CreateAgentAppForm } from "./CreateAgentAppForm";
import { AutoCreateAgentAppForm } from "./AutoCreateAgentAppForm";
import { ShellBasedCreateAgentAppForm } from "./ShellBasedCreateAgentAppForm";
import {
  SearchableAgentSelect,
  type AgentOption,
} from "./SearchableAgentSelect";
import type { CreateAgentAppInput } from "../types";

interface CreateAgentAppFormWrapperProps {
  /**
   * Full agent rows (with `variable_definitions` etc) — required by the
   * AutoCreate flow which feeds a JSON snapshot of the agent to the AI
   * generator.
   */
  agents: any[];
  categories: any[];
  preselectedAgentId?: string | null;
  preselectedAgent?: any;
  onSuccess?: () => void;
}

export function CreateAgentAppFormWrapper({
  agents,
  categories,
  preselectedAgentId,
  preselectedAgent,
  onSuccess,
}: CreateAgentAppFormWrapperProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>("shell");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(
    preselectedAgentId ?? undefined,
  );
  const [selectedAgent, setSelectedAgent] = useState<any>(preselectedAgent);
  const [busy, setBusy] = useState(false);

  // Resolve preselected agent if id was passed without the full row.
  useEffect(() => {
    if (preselectedAgentId && !selectedAgentId) {
      setSelectedAgentId(preselectedAgentId);
    }
    if (preselectedAgent && !selectedAgent) {
      setSelectedAgent(preselectedAgent);
    }
    if (preselectedAgentId && !preselectedAgent && agents.length > 0) {
      const found = agents.find((a) => a.id === preselectedAgentId);
      if (found) setSelectedAgent(found);
    }
  }, [
    preselectedAgentId,
    preselectedAgent,
    agents,
    selectedAgentId,
    selectedAgent,
  ]);

  const agentOptions: AgentOption[] = agents
    .filter((a) => !a?.is_archived)
    .map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? null,
      category: a.category ?? null,
      isPublic: !!a.is_public,
    }));

  const handleAgentChange = (agentId: string) => {
    setSelectedAgentId(agentId);
    const found = agents.find((a) => a.id === agentId);
    setSelectedAgent(found);
  };

  const handleManualSubmit = async (input: CreateAgentAppInput) => {
    setBusy(true);
    try {
      const res = await fetch("/api/agent-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Create failed (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      onSuccess?.();
      router.push(`/agent-apps/${created.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Select Your Agent</Label>
          {selectedAgent && (
            <span className="text-xs text-muted-foreground">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} available
            </span>
          )}
        </div>
        <SearchableAgentSelect
          agents={agentOptions}
          value={selectedAgentId ?? null}
          onChange={handleAgentChange}
          placeholder="Choose the agent to power your app..."
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-center mb-8">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger
              value="shell"
              className="gap-2"
              disabled={!selectedAgentId}
            >
              <Layers className="w-4 h-4" />
              From Shell
            </TabsTrigger>
            <TabsTrigger
              value="auto"
              className="gap-2"
              disabled={!selectedAgentId}
            >
              <MousePointerClick className="w-4 h-4" />
              Auto Create
            </TabsTrigger>
            <TabsTrigger
              value="manual"
              className="gap-2"
              disabled={!selectedAgentId}
            >
              <Wrench className="w-4 h-4" />
              Create Manually
            </TabsTrigger>
          </TabsList>
        </div>

        {!selectedAgentId && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground text-lg">
                Select an agent above to continue
              </p>
              <p className="text-sm text-muted-foreground">
                Your agent will power the AI behind your app
              </p>
            </div>
          </div>
        )}

        {selectedAgentId && (
          <>
            <TabsContent value="shell" className="mt-0">
              <ShellBasedCreateAgentAppForm
                agent={{
                  id: selectedAgentId,
                  name: selectedAgent?.name,
                  description: selectedAgent?.description ?? null,
                }}
                onSuccess={onSuccess}
              />
            </TabsContent>

            <TabsContent value="auto" className="mt-0">
              <AutoCreateAgentAppForm
                agent={selectedAgent}
                agents={agents}
                categories={categories}
                onSuccess={onSuccess}
              />
            </TabsContent>

            <TabsContent value="manual" className="mt-0">
              <CreateAgentAppForm
                agents={agentOptions}
                onSubmit={handleManualSubmit}
                onCancel={() => router.push("/agent-apps")}
                busy={busy}
                defaultAgentId={selectedAgentId}
                defaultName={selectedAgent?.name ?? ""}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
