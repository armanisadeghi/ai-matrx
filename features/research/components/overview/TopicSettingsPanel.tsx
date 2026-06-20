"use client";

import { useState, useEffect, useMemo } from "react";
import { Loader2, Save, FolderPlus, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { AutonomySelector } from "../init/AutonomySelector";
import { StatusBadge } from "../shared/StatusBadge";
import { updateTopic } from "../../service";
import { ProjectFormSheet } from "@/features/projects/components/ProjectFormSheet";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { isPersonalPseudoOrgId } from "@/features/agent-context/redux/hierarchySlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateNavTree } from "@/features/agent-context/redux/hierarchySlice";
import type {
  ResearchTopic,
  AutonomyLevel,
  SearchProvider,
  TopicStatus,
  TopicQuotaFields,
} from "../../types";
import {
  autonomyLevelFromDb,
  searchProviderFromDb,
  topicStatusFromDb,
} from "../../types";
import { QuotaSettingsSection } from "./QuotaSettingsSection";

interface TopicSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topic: ResearchTopic;
  onSaved: () => void;
}

const TOPIC_STATUSES: { value: TopicStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "searching", label: "Searching" },
  { value: "scraping", label: "Scraping" },
  { value: "curating", label: "Curating" },
  { value: "analyzing", label: "Analyzing" },
  { value: "complete", label: "Complete" },
];

const SEARCH_PROVIDERS: { value: SearchProvider; label: string }[] = [
  { value: "brave", label: "Brave Search" },
  { value: "google", label: "Google" },
];

interface ProjectOption {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  isPersonalOrg: boolean;
}

export function TopicSettingsPanel({
  open,
  onOpenChange,
  topic,
  onSaved,
}: TopicSettingsPanelProps) {
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const { orgs } = useNavTree();

  const projectOptions = useMemo<ProjectOption[]>(() => {
    const out: ProjectOption[] = [];
    for (const org of orgs) {
      const isPersonalOrg =
        org.is_personal === true || isPersonalPseudoOrgId(org.id);
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
      if (existing) {
        existing.projects.push(p);
      } else {
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
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(() =>
    autonomyLevelFromDb(topic.autonomy_level),
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
  const [scrapesPerKeyword, setScrapesPerKeyword] = useState(
    topic.scrapes_per_keyword,
  );
  const [quotas, setQuotas] = useState<TopicQuotaFields>({
    max_keywords: topic.max_keywords,
    scrapes_per_keyword: topic.scrapes_per_keyword,
    analyses_per_keyword: topic.analyses_per_keyword,
    max_keyword_syntheses: topic.max_keyword_syntheses,
    max_project_syntheses: topic.max_project_syntheses,
    max_documents: topic.max_documents,
    max_tag_consolidations: topic.max_tag_consolidations,
    max_auto_tag_calls: topic.max_auto_tag_calls,
  });
  const [selectedProjectId, setSelectedProjectId] = useState(topic.project_id);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(topic.name);
      setDescription(topic.description ?? "");
      setAutonomyLevel(autonomyLevelFromDb(topic.autonomy_level));
      setSearchProvider(searchProviderFromDb(topic.default_search_provider));
      setStatus(topicStatusFromDb(topic.status));
      setGoodScrapeThreshold(topic.good_scrape_threshold);
      setScrapesPerKeyword(topic.scrapes_per_keyword);
      setQuotas({
        max_keywords: topic.max_keywords,
        scrapes_per_keyword: topic.scrapes_per_keyword,
        analyses_per_keyword: topic.analyses_per_keyword,
        max_keyword_syntheses: topic.max_keyword_syntheses,
        max_project_syntheses: topic.max_project_syntheses,
        max_documents: topic.max_documents,
        max_tag_consolidations: topic.max_tag_consolidations,
        max_auto_tag_calls: topic.max_auto_tag_calls,
      });
      setSelectedProjectId(topic.project_id);
      setError(null);
    }
  }, [open, topic]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Topic name is required.");
      return;
    }
    if (!selectedProjectId) {
      setError("Please select a project.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTopic(topic.id, {
        name: name.trim(),
        description: description.trim() || null,
        autonomy_level: autonomyLevel,
        default_search_provider: searchProvider,
        status,
        good_scrape_threshold: goodScrapeThreshold,
        scrapes_per_keyword: quotas.scrapes_per_keyword ?? scrapesPerKeyword,
        project_id: selectedProjectId,
        max_keywords: quotas.max_keywords,
        analyses_per_keyword: quotas.analyses_per_keyword,
        max_keyword_syntheses: quotas.max_keyword_syntheses,
        max_project_syntheses: quotas.max_project_syntheses,
        max_documents: quotas.max_documents,
        max_tag_consolidations: quotas.max_tag_consolidations,
        max_auto_tag_calls: quotas.max_auto_tag_calls,
      });
      onSaved();
      onOpenChange(false);
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

  const content = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-5 pt-4">
        {/* Project */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Project
            </span>
            <button
              type="button"
              onClick={() => setNewProjectOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
            >
              <FolderPlus className="h-3 w-3" />
              New project
            </button>
          </div>
          <Select
            value={selectedProjectId ?? undefined}
            onValueChange={(v) => setSelectedProjectId(v)}
            disabled={saving}
          >
            <SelectTrigger
              className="h-9 w-full rounded-lg"
              style={{ fontSize: "16px" }}
            >
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
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
              {projectOptions.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No projects yet
                </div>
              )}
            </SelectContent>
          </Select>
          {selectedProjectId !== topic.project_id && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              This topic will be moved to a different project on save.
            </p>
          )}
        </section>

        {/* Basic Info */}
        <section className="space-y-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Basic Info
          </span>

          <div className="space-y-1.5">
            <label
              htmlFor="topic-name"
              className="text-xs font-medium text-muted-foreground"
            >
              Name
            </label>
            <ProInput
              id="topic-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Brand Profile"
              className="h-9 rounded-lg"
              wrapperClassName="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="topic-description"
              className="text-xs font-medium text-muted-foreground"
            >
              Description
            </label>
            <ProTextarea
              id="topic-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this topic about?"
              autoGrow
              minHeight={110}
              maxHeight={240}
              className="rounded-lg leading-relaxed"
              wrapperClassName="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <div className="flex items-center gap-2.5">
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as TopicStatus)}
              >
                <SelectTrigger
                  className="h-9 w-44 rounded-lg"
                  style={{ fontSize: "16px" }}
                >
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

        {/* Autonomy */}
        <section className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Automation
          </span>
          <AutonomySelector value={autonomyLevel} onChange={setAutonomyLevel} />
        </section>

        {/* Search & Scrape Settings */}
        <section className="space-y-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Search & Scrape
          </span>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Provider
            </label>
            <Select
              value={searchProvider}
              onValueChange={(v) => setSearchProvider(v as SearchProvider)}
            >
              <SelectTrigger
                className="h-9 w-44 rounded-lg"
                style={{ fontSize: "16px" }}
              >
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

          <div className="space-y-1.5">
            <label
              htmlFor="scrape-threshold"
              className="text-xs font-medium text-muted-foreground"
            >
              Good content threshold (chars)
            </label>
            <Input
              id="scrape-threshold"
              type="number"
              min={100}
              max={50000}
              step={100}
              value={goodScrapeThreshold}
              onChange={(e) => setGoodScrapeThreshold(Number(e.target.value))}
              className="h-9 rounded-lg"
              style={{ fontSize: "16px" }}
            />
            <p className="text-[11px] leading-snug text-muted-foreground/80">
              Below this character count, a scrape is classified as
              &quot;thin&quot;.
            </p>
          </div>
        </section>

        {/* Pipeline limits / quota ladder */}
        <QuotaSettingsSection
          values={quotas}
          onChange={(partial) => {
            setQuotas((q) => ({ ...q, ...partial }));
            if (partial.scrapes_per_keyword != null) {
              setScrapesPerKeyword(partial.scrapes_per_keyword);
            }
          }}
          disabled={saving}
        />

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 bg-muted/30 px-5 py-3">
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim() || !selectedProjectId}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );

  const newProjectSheet = (
    <ProjectFormSheet
      open={newProjectOpen}
      onOpenChange={setNewProjectOpen}
      skipRedirect
      onSuccess={(project) => {
        dispatch(invalidateNavTree());
        setSelectedProjectId(project.id);
      }}
    />
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="flex h-[90dvh] flex-col">
            <DrawerHeader className="shrink-0 border-b border-border/60 px-5 pb-3 pt-2 text-left">
              <DrawerTitle className="text-base font-semibold">
                Topic Settings
              </DrawerTitle>
            </DrawerHeader>
            {content}
          </DrawerContent>
        </Drawer>
        {newProjectSheet}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 py-3">
            <DialogTitle className="text-base font-semibold">
              Topic Settings
            </DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
      {newProjectSheet}
    </>
  );
}
