"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import type { AgentTab } from "@/features/agents/redux/agent-consumers/slice";
import {
  DISPLAY_MODE_OPTIONS,
  getTemplateForDisplayMode,
} from "../sample-code/templates";
import { getDefaultImportsForNewApps } from "../utils/allowed-imports";
import {
  generateSlugCandidates,
  validateSlugsInBatch,
} from "../services/slug-service";
import type { AppDisplayMode, CreateAgentAppInput } from "../types";

interface CreateAgentAppFormProps {
  onSubmit: (input: CreateAgentAppInput) => Promise<void> | void;
  onCancel?: () => void;
  busy?: boolean;
  /** Preselect a specific agent when the form opens. */
  defaultAgentId?: string | null;
  /** Optional default name (e.g. inherited from the preset agent). */
  defaultName?: string;
  /** Tab the agent picker opens on. Admin/system surfaces pass `"system"`. */
  agentInitialTab?: AgentTab;
  /** ADMIN variant: blend system agents into the picker's "All" tab. */
  agentIncludeSystemInAll?: boolean;
}

export function CreateAgentAppForm({
  onSubmit,
  onCancel,
  busy = false,
  defaultAgentId = null,
  defaultName = "",
  agentInitialTab,
  agentIncludeSystemInAll = false,
}: CreateAgentAppFormProps) {
  const [agentId, setAgentId] = useState<string | null>(defaultAgentId);
  const [name, setName] = useState(defaultName);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [displayMode, setDisplayMode] = useState<AppDisplayMode>("form");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () =>
      Boolean(
        agentId &&
          name.trim() &&
          slug.trim() &&
          slugStatus === "available" &&
          !submitting &&
          !busy,
      ),
    [agentId, name, slug, slugStatus, submitting, busy],
  );

  const handleSuggestSlug = useCallback(async () => {
    if (!name.trim()) return;
    setSlugStatus("checking");
    try {
      const candidates = generateSlugCandidates(name);
      const { available } = await validateSlugsInBatch(candidates);
      if (available.length > 0) {
        setSlug(available[0]);
        setSlugStatus("available");
      } else {
        setSlug(candidates[candidates.length - 1]);
        setSlugStatus("taken");
      }
    } catch {
      setSlugStatus("invalid");
    }
  }, [name]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!agentId || !name.trim() || !slug.trim()) return;
      setSubmitting(true);
      setError(null);
      try {
        await onSubmit({
          agent_id: agentId,
          slug,
          name: name.trim(),
          tagline: tagline.trim() || undefined,
          description: description.trim() || undefined,
          component_code: getTemplateForDisplayMode(displayMode),
          component_language: "tsx",
          allowed_imports: getDefaultImportsForNewApps(),
          layout_config: { displayMode },
          variable_schema: [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create app");
      } finally {
        setSubmitting(false);
      }
    },
    [agentId, name, slug, tagline, description, displayMode, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-app-agent">Agent</Label>
        {/* THE canonical agent picker — search, Mine/Shared/All/System tabs
            with counts, sort, favorites, category + tag filters. Never a
            bespoke list + text box. */}
        <AgentListInlinePicker
          consumerId="create-agent-app-agent"
          onSelect={setAgentId}
          activeAgentId={agentId}
          initialTab={agentInitialTab}
          includeSystemInAll={agentIncludeSystemInAll}
          autoFocusSearch={false}
          className="h-80 rounded-md border border-border bg-card"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-app-name">Name</Label>
        <Input
          id="agent-app-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Agent App"
          className="text-[16px]"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-app-tagline">Tagline</Label>
        <Input
          id="agent-app-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="One-line pitch"
          className="text-[16px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-app-description">Description</Label>
        <Textarea
          id="agent-app-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this app do?"
          className="text-[16px] min-h-20"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-app-mode">Display mode</Label>
        <Select
          value={displayMode}
          onValueChange={(v) => setDisplayMode(v as AppDisplayMode)}
        >
          <SelectTrigger id="agent-app-mode">
            <SelectValue placeholder="Select a mode" />
          </SelectTrigger>
          <SelectContent>
            {DISPLAY_MODE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-app-slug">Slug</Label>
        <div className="flex gap-2">
          <Input
            id="agent-app-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugStatus("idle");
            }}
            placeholder="my-agent-app"
            className="text-[16px]"
            required
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSuggestSlug}
            disabled={!name.trim()}
          >
            Suggest
          </Button>
        </div>
        {slugStatus === "checking" && (
          <span className="text-xs text-muted-foreground">Checking…</span>
        )}
        {slugStatus === "available" && (
          <span className="text-xs text-primary">Slug is available.</span>
        )}
        {slugStatus === "taken" && (
          <span className="text-xs text-destructive">
            That slug is taken — try another.
          </span>
        )}
        {slugStatus === "invalid" && (
          <span className="text-xs text-destructive">
            Could not validate slug — please try again.
          </span>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!canSubmit}>
          {submitting || busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating…
            </>
          ) : (
            "Create App"
          )}
        </Button>
      </div>
    </form>
  );
}
