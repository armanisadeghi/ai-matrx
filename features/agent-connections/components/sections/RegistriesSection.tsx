"use client";

import React, { useMemo, useState } from "react";
import {
  Library,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { Github } from "@/components/icons/brand-icons";
import { cn } from "@/lib/utils";
import { SectionToolbar } from "../SectionToolbar";
import { GroupSection } from "../GroupSection";
import { ListRow } from "../ListRow";
import { SectionFooter } from "../SectionFooter";

interface KnownRegistry {
  id: string;
  slug: string;
  name: string;
  description: string;
  source: string;
  isOfficial: boolean;
  itemCount?: number;
}

/**
 * Seed list — once `skl_registries` exists in the DB, this becomes the default
 * row set for the system bootstrap. Until then, this surfaces the curated
 * sources we plan to support so the UI shape is locked in.
 */
const SEED_REGISTRIES: KnownRegistry[] = [
  {
    id: "vercel-plugin",
    slug: "vercel-plugin",
    name: "Vercel Plugin",
    description:
      "Agents, skills, hooks, and MCP servers for Next.js + Vercel platform development.",
    source: "github.com/vercel/vercel-plugin",
    isOfficial: true,
  },
  {
    id: "anthropic-skills",
    slug: "anthropic-skills",
    name: "Anthropic Skills",
    description:
      "Reference skills published by Anthropic — PDF, XLSX, DOCX, PPTX, frontend UI design, and more.",
    source: "github.com/anthropics/skills",
    isOfficial: true,
  },
  {
    id: "claude-code-cookbook",
    slug: "claude-code-cookbook",
    name: "Claude Code Cookbook",
    description:
      "Community recipes — sub-agents and slash commands for common engineering workflows.",
    source: "github.com/anthropics/claude-code",
    isOfficial: true,
  },
];

export function RegistriesSection() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SEED_REGISTRIES;
    return SEED_REGISTRIES.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q),
    );
  }, [search]);

  const official = filtered.filter((r) => r.isOfficial);
  const community = filtered.filter((r) => !r.isOfficial);

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        generateLabel="Add Registry"
      />

      <div
        className={cn(
          "mx-4 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10",
          "px-3 py-2 text-xs text-foreground/80 flex items-start gap-2",
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          Roadmap preview — once the{" "}
          <code className="px-1 py-0.5 rounded bg-background/60 font-mono">
            skl_registries
          </code>{" "}
          / <code className="px-1 py-0.5 rounded bg-background/60 font-mono">
            skl_registry_items
          </code>{" "}
          tables ship, the seeds below become the default rows and a sync engine
          will populate items per registry.
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin pt-2">
        {official.length > 0 && (
          <GroupSection label="Official" count={official.length}>
            {official.map((r) => (
              <RegistryRow key={r.id} registry={r} />
            ))}
          </GroupSection>
        )}
        {community.length > 0 && (
          <GroupSection label="Community" count={community.length}>
            {community.map((r) => (
              <RegistryRow key={r.id} registry={r} />
            ))}
          </GroupSection>
        )}
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No registries match your search.
          </div>
        )}
      </div>

      <SectionFooter
        description="External sources of skills, agents, hooks, and MCP servers. Connect a GitHub repo and we'll keep your catalog in sync."
        learnMoreLabel="Learn more about registries"
        learnMoreHref="#"
      />
    </div>
  );
}

function RegistryRow({ registry }: { registry: KnownRegistry }) {
  return (
    <ListRow
      icon={Library}
      title={registry.name}
      subtitle={`${registry.source} — ${registry.description}`}
      status={
        registry.isOfficial
          ? { label: "Official", tone: "running" }
          : { label: "Community", tone: "default" }
      }
    />
  );
}

export default RegistriesSection;
