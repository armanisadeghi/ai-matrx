"use client";

/**
 * Side-by-side attachment chip styles — same fake resources, three renderers.
 */

import { type ComponentType } from "react";
import {
  Globe,
  StickyNote,
  CheckSquare,
  Image as ImageIcon,
  Music,
  FileText,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import { SmartAgentResourceChips } from "@/features/agents/components/inputs/resources/SmartAgentResourceChips";
import type { DemoAttachmentSpec } from "./userMessageChipsDemoData";
import { ResourceAttachmentTile } from "./ResourceAttachmentTile";

const COMPARISON_ICONS: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  webpage: Globe,
  note: StickyNote,
  task: CheckSquare,
  youtube: Youtube,
  "image-legacy": ImageIcon,
  "audio-legacy": Music,
  "doc-legacy": FileText,
};

/** Production sent-message styling from AgentUserMessage AttachmentChip. */
function SentMessageChip({ spec }: { spec: DemoAttachmentSpec }) {
  if (spec.id === "image-legacy") {
    return (
      <FileResourceChip
        fileId="00000000-0000-0000-0000-000000000000"
        size="xs"
        nameOverride={spec.title}
      />
    );
  }

  const Icon = COMPARISON_ICONS[spec.id] ?? FileText;
  return (
    <ResourceAttachmentTile
      typeLabel={spec.label}
      title={spec.title}
      icon={Icon}
      themeKey={spec.id}
    />
  );
}

/** Old cx-chat / public-chat thumbnail tiles. */
function ThumbnailTile({ spec }: { spec: DemoAttachmentSpec }) {
  const Icon = COMPARISON_ICONS[spec.id] ?? FileText;
  const isImage = spec.id === "image-legacy";

  return (
    <div className="relative rounded-lg overflow-hidden border border-border shrink-0">
      {isImage ? (
        <div
          className="h-10 w-10 bg-gradient-to-br from-blue-100 to-indigo-200 dark:from-blue-950/60 dark:to-indigo-900/40 flex items-center justify-center"
          title={spec.title}
        >
          <ImageIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
      ) : (
        <div className="h-10 w-12 flex flex-col items-center justify-center bg-muted py-1">
          <Icon className="h-6 w-6 text-muted-foreground mb-1" />
          <span className="text-[8px] text-muted-foreground text-center truncate w-full px-1">
            {spec.title}
          </span>
        </div>
      )}
    </div>
  );
}

function ComparisonColumn({
  title,
  source,
  badge,
  children,
}: {
  title: string;
  source: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="mb-2 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {badge ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground font-mono">{source}</p>
      </div>
      <div className="bg-muted border border-border rounded-lg px-2 py-2 flex-1">
        <div className="space-y-1.5">
          {children}
          <p className="text-xs text-foreground whitespace-pre-wrap pt-1">
            Can you review these attachments and summarize next steps?
          </p>
        </div>
      </div>
    </div>
  );
}

interface UserMessageAttachmentStyleComparisonProps {
  specs: DemoAttachmentSpec[];
  inputChipsConversationId: string;
}

export function UserMessageAttachmentStyleComparison({
  specs,
  inputChipsConversationId,
}: UserMessageAttachmentStyleComparisonProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
          Side-by-side: attachment styles
        </h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-3xl">
          Same six fake resources in each column. Input bar and sent messages
          both use <code className="text-[10px]">ResourceAttachmentTile</code>{" "}
          (file attachments with a <code className="text-[10px]">file_id</code>{" "}
          still use <code className="text-[10px]">FileResourceChip</code>).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ComparisonColumn
          title="Sent message (today)"
          source="AgentUserMessage → AttachmentChip"
          badge="production"
        >
          <div className="flex flex-wrap gap-1.5">
            {specs.map((spec) => (
              <SentMessageChip key={spec.id} spec={spec} />
            ))}
          </div>
        </ComparisonColumn>

        <ComparisonColumn
          title="Input bar"
          source="SmartAgentResourceChips → ResourceAttachmentTile"
          badge="production"
        >
          <div className="-mx-2 px-2">
            <SmartAgentResourceChips
              conversationId={inputChipsConversationId}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Hover for previews. Remove via corner ✕. Image/audio with{" "}
            <code className="text-[10px]">file_id</code> use FileResourceChip.
          </p>
        </ComparisonColumn>

        <ComparisonColumn
          title="Old chat tiles"
          source="cx-conversation → AttachedResourcesDisplay"
          badge="legacy"
        >
          <div className="flex flex-wrap gap-2">
            {specs.map((spec) => (
              <ThumbnailTile key={spec.id} spec={spec} />
            ))}
          </div>
        </ComparisonColumn>
      </div>
    </section>
  );
}
