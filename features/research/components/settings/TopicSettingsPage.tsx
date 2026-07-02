"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AutonomySelector } from "../init/AutonomySelector";
import { StatusBadge } from "../shared/StatusBadge";
import { updateTopic } from "../../service";
import { ProjectFormSheet } from "@/features/projects/components/ProjectFormSheet";
import { HierarchyCascade } from "@/features/agent-context/components/hierarchy-selection/HierarchyCascade";
import { EMPTY_SELECTION } from "@/features/agent-context/components/hierarchy-selection/types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateNavTree } from "@/features/agent-context/redux/hierarchySlice";
import { useTopicContext } from "../../context/ResearchContext";
import type { AutonomyLevel, SearchProvider, TopicStatus } from "../../types";
import {
  autonomyLevelFromDb,
  searchProviderFromDb,
  topicStatusFromDb,
} from "../../types";

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

export default function TopicSettingsPage() {
  const { topic, refresh } = useTopicContext();
  const dispatch = useAppDispatch();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toneProfile, setToneProfile] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("manual");
  const [searchProvider, setSearchProvider] = useState<SearchProvider>("brave");
  const [status, setStatus] = useState<TopicStatus>("draft");
  const [goodScrapeThreshold, setGoodScrapeThreshold] = useState(500);
  const [scrapesPerKeyword, setScrapesPerKeyword] = useState(5);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Populate from topic once loaded
  useEffect(() => {
    if (!topic) return;
    setName(topic.name);
    setDescription(topic.description ?? "");
    setToneProfile(topic.tone_profile ?? "");
    setAutonomyLevel(autonomyLevelFromDb(topic.autonomy_level));
    setSearchProvider(searchProviderFromDb(topic.default_search_provider));
    setStatus(topicStatusFromDb(topic.status));
    setGoodScrapeThreshold(topic.good_scrape_threshold);
    setScrapesPerKeyword(topic.scrapes_per_keyword);
    setSelectedProjectId(topic.project_id);
  }, [topic]);

  const handleSave = async () => {
    if (!topic) return;
    if (!name.trim()) {
      toast.error("Topic name is required.");
      return;
    }
    if (!selectedProjectId) {
      toast.error("Please select a project.");
      return;
    }
    setSaving(true);
    try {
      await updateTopic(topic.id, {
        name: name.trim(),
        description: description.trim() || null,
        tone_profile: toneProfile.trim() || null,
        autonomy_level: autonomyLevel,
        default_search_provider: searchProvider,
        status,
        good_scrape_threshold: goodScrapeThreshold,
        scrapes_per_keyword: scrapesPerKeyword,
        project_id: selectedProjectId,
      });
      toast.success("Settings saved.");
      refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!topic) {
    return (
      <div className="flex items-center justify-center min-h-[40dvh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const projectChanged = selectedProjectId !== topic.project_id;

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 space-y-6">
      <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/80">Settings</span>
      </div>

      {/* Project */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          Project
        </h2>
        <div className="space-y-2">
          <Label>Move to Project</Label>
          <HierarchyCascade
            levels={["organization", "scope", "project"]}
            value={{
              ...EMPTY_SELECTION,
              projectId: selectedProjectId,
            }}
            onChange={(sel) =>
              setSelectedProjectId(sel.projectId ?? selectedProjectId)
            }
            layout="vertical"
            disabled={saving}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-primary px-1"
            onClick={() => setNewProjectOpen(true)}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            Create new project
          </Button>
          {projectChanged && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              This topic will be moved to a different project on save.
            </p>
          )}
        </div>
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
              <SelectTrigger className="w-40">
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
            slides, SEO) so the whole bundle reads as one author. e.g.{" "}
            <span className="italic">
              &ldquo;Skeptical, data-driven, for senior engineers. Plain
              English, no hype. Always lead with the evidence.&rdquo;
            </span>
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

      {/* Search & Scrape */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
          Search & Scrape
        </h2>

        <div className="space-y-2">
          <Label>Search Provider</Label>
          <Select
            value={searchProvider}
            onValueChange={(v) => setSearchProvider(v as SearchProvider)}
            disabled={saving}
          >
            <SelectTrigger className="w-48">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="scrapes-per-kw">Scrapes per Keyword</Label>
            <p className="text-xs text-muted-foreground">
              How many sources to scrape per keyword search.
            </p>
            <Input
              id="scrapes-per-kw"
              type="number"
              min={1}
              max={50}
              value={scrapesPerKeyword}
              onChange={(e) => setScrapesPerKeyword(Number(e.target.value))}
              style={{ fontSize: "16px" }}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scrape-threshold">Good Scrape Threshold</Label>
            <p className="text-xs text-muted-foreground">
              Minimum characters to consider a scrape successful.
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
        </div>
      </section>

      {/* Save */}
      <div className="flex justify-end pt-2 border-t border-border">
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
