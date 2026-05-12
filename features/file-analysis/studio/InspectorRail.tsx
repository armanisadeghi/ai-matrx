/**
 * features/file-analysis/studio/InspectorRail.tsx
 *
 * Right rail of the studio. Tabs: Annotations / Detectors / Findings /
 * Outline / Redact / Search. Each panel reads its own data; the rail just
 * does tab selection + layout.
 */

"use client";

import {
  Atom,
  FileSearch,
  Layers,
  ListTree,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnnotationsPanel } from "./panels/AnnotationsPanel";
import { DetectorsPanel } from "./panels/DetectorsPanel";
import { FindingsPanel } from "./panels/FindingsPanel";
import { OutlinePanel } from "./panels/OutlinePanel";
import { RedactPanel } from "./panels/RedactPanel";
import { SearchPanel } from "./panels/SearchPanel";

export type StudioInspectorTab =
  | "annotations"
  | "detectors"
  | "findings"
  | "outline"
  | "redact"
  | "search";

export interface InspectorRailProps {
  fileId: string;
  activeTab: StudioInspectorTab;
  onTabChange: (tab: StudioInspectorTab) => void;
  selectedPageId: string | null;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
  selectedAnnotationId: string | null;
  onSelectAnnotation: (annotationId: string | null) => void;
}

const TABS: { id: StudioInspectorTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "annotations", label: "Annotations", icon: Sparkles },
  { id: "detectors", label: "Detectors", icon: Atom },
  { id: "findings", label: "Findings", icon: ListTree },
  { id: "outline", label: "Outline", icon: Layers },
  { id: "redact", label: "Redact", icon: Shield },
  { id: "search", label: "Search", icon: FileSearch },
];

export function InspectorRail({
  fileId,
  activeTab,
  onTabChange,
  selectedPageId,
  onJumpToPage,
  selectedAnnotationId,
  onSelectAnnotation,
}: InspectorRailProps) {
  return (
    <div className="flex h-full w-full flex-col bg-card/40">
      {/* Tab strip */}
      <div className="flex shrink-0 items-center gap-0 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => onTabChange(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-r border-border px-2 py-2 text-[10px] font-medium uppercase tracking-wider transition-colors last:border-r-0",
              activeTab === t.id
                ? "bg-background text-foreground"
                : "bg-card/40 text-muted-foreground hover:bg-accent/40",
            )}
            title={t.label}
          >
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Panel body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "annotations" ? (
          <AnnotationsPanel
            fileId={fileId}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={onSelectAnnotation}
            onJumpToPage={onJumpToPage}
          />
        ) : activeTab === "detectors" ? (
          <DetectorsPanel fileId={fileId} onJumpToPage={onJumpToPage} />
        ) : activeTab === "findings" ? (
          <FindingsPanel fileId={fileId} onJumpToPage={onJumpToPage} />
        ) : activeTab === "outline" ? (
          <OutlinePanel fileId={fileId} onJumpToPage={onJumpToPage} />
        ) : activeTab === "redact" ? (
          <RedactPanel fileId={fileId} />
        ) : (
          <SearchPanel fileId={fileId} onJumpToPage={onJumpToPage} />
        )}
      </div>
    </div>
  );
}
