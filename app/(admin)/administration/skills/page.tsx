"use client";

/**
 * Admin Skills Registry — system + public + user-owned skills in one
 * curation surface. Reuses the same components the agent-connections
 * panel uses (SkillsBrowser / SkillDetailEditor / SkillIngestPanel /
 * SkillCategoryTreeEditor); the admin context shows the "System skill"
 * toggle on the editor.
 */

import React, { useMemo, useState } from "react";
import {
  Brain,
  FolderTree,
  Globe2,
  Lightbulb,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAllSkills } from "@/features/skills/redux/skillsSelectors";
import { SkillsBrowser } from "@/features/skills/components/SkillsBrowser";
import { SkillDetailEditor } from "@/features/skills/components/SkillDetailEditor";
import { SkillIngestPanel } from "@/features/skills/components/SkillIngestPanel";
import { SkillCategoryTreeEditor } from "@/features/skills/components/SkillCategoryTreeEditor";

type Mode = "list" | "detail" | "create" | "ingest" | "categories";

export default function SkillsAdminPage() {
  const allSkills = useAppSelector(selectAllSkills);
  const [mode, setMode] = useState<Mode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let system = 0;
    let pub = 0;
    let personal = 0;
    for (const s of allSkills) {
      if (s.isSystem) system += 1;
      else if (s.isPublic) pub += 1;
      else personal += 1;
    }
    return { total: allSkills.length, system, public: pub, personal };
  }, [allSkills]);

  const goList = () => {
    setMode("list");
    setSelectedId(null);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Agent Skills Registry
              </h1>
              <p className="text-sm text-muted-foreground">
                Curate every skill on the platform — promote to system,
                edit metadata, or soft-delete.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {mode === "list" && (
          <>
            <div className="px-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
              <StatCard
                icon={<Lightbulb className="h-4 w-4" />}
                label="Total skills"
                value={stats.total}
              />
              <StatCard
                icon={<ShieldCheck className="h-4 w-4" />}
                label="System"
                value={stats.system}
                tone="info"
              />
              <StatCard
                icon={<Globe2 className="h-4 w-4" />}
                label="Public"
                value={stats.public}
              />
              <StatCard
                icon={<UserRound className="h-4 w-4" />}
                label="Personal"
                value={stats.personal}
              />
            </div>

            <div className="px-4 pt-3 flex items-center gap-2">
              <Badge variant="outline" className="font-normal">
                Admin scope — every skill is visible
              </Badge>
              <button
                type="button"
                onClick={() => setMode("ingest")}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm border border-border bg-background hover:bg-accent transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Filesystem ingest
              </button>
              <button
                type="button"
                onClick={() => setMode("categories")}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm border border-border bg-background hover:bg-accent transition-colors"
              >
                <FolderTree className="h-3.5 w-3.5" />
                Categories
              </button>
            </div>

            <div className="flex-1 overflow-hidden mt-3 border-t border-border/60">
              <SkillsBrowser
                onSelect={(id) => {
                  setSelectedId(id);
                  setMode("detail");
                }}
                onNew={() => setMode("create")}
                onIngest={() => setMode("ingest")}
                onCategories={() => setMode("categories")}
              />
            </div>
          </>
        )}

        {mode === "detail" && selectedId && (
          <SkillDetailEditor skillId={selectedId} onBack={goList} />
        )}

        {mode === "create" && (
          <SkillDetailEditor skillId="" isNew onBack={goList} />
        )}

        {mode === "ingest" && <SkillIngestPanel onBack={goList} />}

        {mode === "categories" && <SkillCategoryTreeEditor onBack={goList} />}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "info";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div
          className={
            tone === "info"
              ? "text-2xl font-bold text-sky-500 tabular-nums"
              : "text-2xl font-bold tabular-nums"
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
