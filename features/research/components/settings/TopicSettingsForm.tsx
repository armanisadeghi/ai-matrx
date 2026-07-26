"use client";

// TopicSettingsForm — THE one topic-settings form (research-project
// decoupling, 2026-07-21). Consolidates the previously duplicated forms in
// `settings/TopicSettingsPage.tsx` and `overview/TopicSettingsPanel.tsx` into
// a single shared component; both surfaces render this.
//
// Project relationship: the OPTIONAL canonical `research_topic → project`
// association edge. Loaded via `getTopicProjectLinks`, saved via
// `setTopicProject` (associationsService.setTargets under the hood) — never a
// `project_id` column write. "No project" is a fully valid state.

import { useState, useEffect, useMemo } from "react";
import { Loader2, Save, FolderPlus, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { AutonomySelector } from "../init/AutonomySelector";
import { StatusBadge } from "../shared/StatusBadge";
import {
  updateTopic,
  setTopicProject,
  getTopicProjectLinks,
} from "../../service";
import { ProjectFormSheet } from "@/features/projects/components/ProjectFormSheet";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateNavTree } from "@/features/agent-context/redux/hierarchySlice";
import { QuotaSettingsSection } from "../overview/QuotaSettingsSection";
import type {
  ResearchTopic,
  AutonomyLevel,
  SearchProvider,
  TopicStatus,
  TopicQuotaFields,
} from "../../types";
import { searchProviderFromDb, topicStatusFromDb } from "../../types";

const TOPIC_STATUSES: { value: TopicStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "searching", label: "Searching" },
  { value: "scraping", label: "Reading" },
  { value: "curating", label: "Curating" },
  { value: "analyzing", label: "Analyzing" },
  { value: "complete", label: "Complete" },
];

const SEARCH_PROVIDERS: { value: SearchProvider; label: string }[] = [
  { value: "brave", label: "Brave Search" },
  { value: "google", label: "Google" },
];

const NO_PROJECT_VALUE = "__none__";

interface ProjectOption {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  isPersonalOrg: boolean;
}

export interface TopicSettingsFormProps {
  topic: ResearchTopic;
  /** Called after a successful save (refresh your topic read). */
  onSaved: () => void;
  /** Rendered as a Cancel button when provided (dialog/drawer surfaces). */
  onCancel?: () => void;
}

export function TopicSettingsForm({
  topic,
  onSaved,
  onCancel,
}: TopicSettingsFormProps) {
  const dispatch = useAppDispatch();
  const { orgs } = useNavTree();

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const out: ProjectOption[] = [];
    for (const org of orgs) {
      const isPersonalOrg = org.is_personal === true;
      for (const p of org.projects) {
        out.push({
          id: p.id,
          name: p.name,
          orgId: org.id,
          orgName: org.name,
          isPersonalOrg,
        });
      }
    }
    return out.sort((a, b) => {
      if (a.isPersonalOrg !== b.isPersonalOrg) return a.isPersonalOrg ? -1 : 1;
      if (a.orgName !== b.orgName) return a.orgName.localeCompare(b.orgName);
      return a.name.localeCompare(b.name);
    });
  }, [orgs]);

  const groupedProjects = useMemo(() => {
    const groups = new Map<
      string,
      { orgName: string; isPersonalOrg: boolean; projects: ProjectOption[] }
    >();
    for (const p of projectOptions) {
      const existing = groups.get(p.orgId);
      if (existing) existing.projects.push(p);
      else {
        groups.set(p.orgId, {
          orgName: p.orgName,
          isPersonalOrg: p.isPersonalOrg,
          projects: [p],
        });
      }
    }
    return Array.from(groups.entries()).map(([orgId, value]) => ({
      orgId,
      ...value,
    }));
  }, [projectOptions]);

  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description ?? "");
  const [toneProfile, setToneProfile] = useState(topic.tone_profile ?? "");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(
    topic.autonomy_level,
  );
  const [searchProvider, setSearchProvider] = useState<SearchProvider>(() =>
    searchProviderFromDb(topic.default_search_provider),
  );
  const [status, setStatus] = useState<TopicStatus>(() =>
    topicStatusFromDb(topic.status),
  );
  const [goodScrapeThreshold, setGoodScrapeThreshold] = useState(
    topic.good_scrape_threshold,
  );
  const [quotas, setQuotas] = useState<TopicQuotaFields>({
    max_keywords: topic.max_keywords,
    scrapes_per_keyword: topic.scrapes_per_keyword,
    analyses_per_keyword: topic.analyses_per_keyword,
    max_keyword_syntheses: topic.max_keyword_syntheses,
    max_topic_syntheses: topic.max_topic_syntheses,
    max_documents: topic.max_documents,
    max_tag_consolidations: topic.max_tag_consolidations,
    max_auto_tag_calls: topic.max_auto_tag_calls,
  });

  // Association-backed project link. null = no project (valid), undefined =
  // still loading the edge.
  const [savedProjectId, setSavedProjectId] = useState<
    string | null | undefined
  >(undefined);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const links = await getTopicProjectLinks([topic.id]);
        if (cancelled) return;
        const pid = links[topic.id] ?? null;
        setSavedProjectId(pid);
        setSelectedProjectId(pid);
      } catch (err) {
        if (cancelled) return;
        // Loud but non-blocking: the rest of the settings stay editable.
        toast.error(
          `Could not load this topic's project link: ${(err as Error).message}`,
        );
        setSavedProjectId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic.id]);

  const projectChanged =
    savedProjectId !== undefined && selectedProjectId !== savedProjectId;

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Topic name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTopic(topic.id, {
        name: name.trim(),
        description: description.trim() || null,
        tone_profile: toneProfile.trim() || null,
        autonomy_level: autonomyLevel,
        default_search_provider: searchProvider,
        status,
        good_scrape_threshold: goodScrapeThreshold,
        scrapes_per_keyword: quotas.scrapes_per_keyword,
        max_keywords: quotas.max_keywords,
        analyses_per_keyword: quotas.analyses_per_keyword,
        max_keyword_syntheses: quotas.max_keyword_syntheses,
        max_topic_syntheses: quotas.max_topic_syntheses,
        max_documents: quotas.max_documents,
        max_tag_consolidations: quotas.max_tag_consolidations,
        max_auto_tag_calls: quotas.max_auto_tag_calls,
      });
      if (projectChanged) {
        try {
          await setTopicProject(topic.id, selectedProjectId);
          setSavedProjectId(selectedProjectId);
        } catch (linkErr) {
          // The topic settings saved; only the optional project edge failed.
          // Loud + retryable — never roll back the topic save.
          toast.error(
            `Settings saved, but moving the topic to the project failed: ${(linkErr as Error).message}. Retry from Settings.`,
          );
        }
      }
      toast.success("Settings saved.");
      onSaved();
    } catch (err) {
      setError((err as Error).message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const selectedProjectMissing =
    projectOptions.length > 0 &&
    selectedProjectId != null &&
    !projectOptions.some((p) => p.id === selectedProjectId);

  return (
    <div className="space-y-6">
      {/* Project — optional association */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Project <span className="font-normal normal-case">(optional)</span>
          </h2>
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
          >
            <FolderPlus className="h-3 w-3" />
            New project
          </button>
        </div>
        {savedProjectId === undefined ? (
          <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading project link…
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Select
              value={selectedProjectId ?? NO_PROJECT_VALUE}
              onValueChange={(v) =>
                setSelectedProjectId(v === NO_PROJECT_VALUE ? null : v)
              }
              disabled={saving}
            >
              <SelectTrigger
                className="h-9 w-full rounded-lg"
                style={{ fontSize: "16px" }}
              >
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                {selectedProjectMissing && selectedProjectId && (
                  <SelectItem value={selectedProjectId}>
                    Current project (unavailable)
                  </SelectItem>
                )}
                {groupedProjects.map((group) => (
                  <SelectGroup key={group.orgId}>
                    <SelectLabel className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.isPersonalOrg && <User className="h-3 w-3" />}
                      {group.orgName}
                    </SelectLabel>
                    {group.projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {selectedProjectId && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                aria-label="Clear project"
                onClick={() => setSelectedProjectId(null)}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        {projectChanged && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {selectedProjectId
              ? "This topic's project link will change on save."
              : "This topic's project link will be removed on save."}
          </p>
        )}
      </section>

      {/* Basic Info */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          Basic Info
        </h2>

        <div className="space-y-2">
          <Label htmlFor="topic-name">Topic Name</Label>
          <ProInput
            id="topic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Brand Research"
            disabled={saving}
            wrapperClassName="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="topic-description">Description</Label>
          <ProTextarea
            id="topic-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this research covers..."
            autoGrow
            minHeight={80}
            maxHeight={200}
            disabled={saving}
            wrapperClassName="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <div className="flex items-center gap-3">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as TopicStatus)}
              disabled={saving}
            >
              <SelectTrigger className="w-40" style={{ fontSize: "16px" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOPIC_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StatusBadge status={status} />
          </div>
        </div>
      </section>

      {/* Voice & Lens */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          Voice &amp; Lens
        </h2>
        <div className="space-y-2">
          <Label htmlFor="topic-tone">Tone profile</Label>
          <p className="text-xs text-muted-foreground">
            The brand voice, audience, and framing for everything this topic
            produces — injected into every output (report, podcast, blog,
            slides, SEO) so the whole bundle reads as one author.
          </p>
          <ProTextarea
            id="topic-tone"
            value={toneProfile}
            onChange={(e) => setToneProfile(e.target.value)}
            placeholder="Describe the voice, audience, and framing for this topic's outputs…"
            autoGrow
            minHeight={100}
            maxHeight={240}
            disabled={saving}
            wrapperClassName="w-full"
          />
        </div>
      </section>

      {/* Autonomy */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          Automation Level
        </h2>
        <AutonomySelector value={autonomyLevel} onChange={setAutonomyLevel} />
      </section>

      {/* Search & Read */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          Search & Read
        </h2>

        <div className="space-y-2">
          <Label>Search Provider</Label>
          <Select
            value={searchProvider}
            onValueChange={(v) => setSearchProvider(v as SearchProvider)}
            disabled={saving}
          >
            <SelectTrigger className="w-48" style={{ fontSize: "16px" }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEARCH_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="scrape-threshold">Good Read Threshold</Label>
          <p className="text-xs text-muted-foreground">
            Minimum characters to consider a read successful.
          </p>
          <Input
            id="scrape-threshold"
            type="number"
            min={100}
            max={50000}
            step={100}
            value={goodScrapeThreshold}
            onChange={(e) => setGoodScrapeThreshold(Number(e.target.value))}
            style={{ fontSize: "16px" }}
            disabled={saving}
          />
        </div>
      </section>

      {/* Pipeline limits / quota ladder */}
      <QuotaSettingsSection
        values={quotas}
        onChange={(partial) => setQuotas((q) => ({ ...q, ...partial }))}
        disabled={saving}
      />

      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="gap-2 min-h-[44px]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>

      <ProjectFormSheet
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        skipRedirect
        onSuccess={(project) => {
          dispatch(invalidateNavTree());
          setSelectedProjectId(project.id);
        }}
      />
    </div>
  );
}
