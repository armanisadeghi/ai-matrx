"use client";

/**
 * Gallery of user-message chip surfaces — context slots + resource attachments.
 * Dev-only preview at /demos/agents/user-message-chips.
 */

import { useEffect, type ComponentType } from "react";
import {
  Globe,
  StickyNote,
  CheckSquare,
  Table2,
  List,
  Database,
  Image as ImageIcon,
  Music,
  FileText,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  initInstanceContext,
  setContextEntry,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { ContextSlotChipStrip } from "@/features/agents/components/context-slots-display/ContextSlotChipStrip";
import { ContextSlotChip } from "@/features/agents/components/context-slots-display/ContextSlotChip";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import { ResourceAttachmentTile } from "./ResourceAttachmentTile";
import {
  DEMO_CONV_MULTI,
  DEMO_CONV_SINGLE,
  DEMO_CONV_INPUT_CHIPS,
  DEMO_COMPARISON_ATTACHMENTS,
  DEMO_INPUT_CHIP_RESOURCES,
  DEMO_LEGACY_ATTACHMENTS,
  DEMO_MULTI_ENTRIES,
  DEMO_SINGLE_ENTRY,
  DEMO_TYPE_ENTRIES,
  type DemoAttachmentSpec,
} from "./userMessageChipsDemoData";
import { UserMessageAttachmentStyleComparison } from "./UserMessageAttachmentStyleComparison";
import { UserMessageHybridTileSamples } from "./UserMessageHybridTileSamples";
import { ResourceEditableToggleSamples } from "./ResourceEditableToggleSamples";
import {
  initInstanceResources,
  addResource,
  setResourcePreview,
} from "@/features/agents/redux/execution-system/instance-resources/instance-resources.slice";
import { initInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

const ATTACHMENT_ICONS: Record<
  string,
  ComponentType<{ className?: string }>
> = {
  webpage: Globe,
  note: StickyNote,
  task: CheckSquare,
  table: Table2,
  list: List,
  data: Database,
  youtube: Youtube,
  "image-legacy": ImageIcon,
  "audio-legacy": Music,
  "doc-legacy": FileText,
};

function seedInputResources(
  dispatch: ReturnType<typeof useAppDispatch>,
  conversationId: string,
) {
  dispatch(initInstanceResources({ conversationId }));
  dispatch(initInstanceUIState({ conversationId, showAttachments: true }));
  for (const resource of DEMO_INPUT_CHIP_RESOURCES) {
    dispatch(
      addResource({
        conversationId,
        resourceId: resource.resourceId,
        blockType: resource.blockType,
        source: resource.source,
      }),
    );
    dispatch(
      setResourcePreview({
        conversationId,
        resourceId: resource.resourceId,
        preview: resource.preview,
      }),
    );
  }
}

function seedContextEntries(
  dispatch: ReturnType<typeof useAppDispatch>,
  conversationId: string,
  entries: typeof DEMO_MULTI_ENTRIES,
) {
  dispatch(initInstanceContext({ conversationId }));
  for (const entry of entries) {
    dispatch(
      setContextEntry({
        conversationId,
        key: entry.key,
        value: entry.value,
        type: entry.type,
        label: entry.label,
        slotMatched: entry.slotMatched,
      }),
    );
  }
}

function DemoBubble({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className="bg-muted border border-border rounded-lg px-2 py-2 max-w-md">
        <div className="space-y-1.5">{children}</div>
      </div>
    </section>
  );
}

function DemoAttachmentChip({ spec }: { spec: DemoAttachmentSpec }) {
  const Icon = ATTACHMENT_ICONS[spec.id] ?? FileText;
  return (
    <div className="space-y-1">
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none",
          "cursor-default",
          spec.chipBg,
          spec.chipBorder,
          spec.iconColor,
        )}
        title={spec.title}
      >
        <Icon className="w-2.5 h-2.5 flex-shrink-0" />
        <span className="max-w-[120px] truncate">{spec.title}</span>
      </button>
      {spec.note ? (
        <p className="text-[10px] text-muted-foreground">{spec.note}</p>
      ) : null}
    </div>
  );
}

export function UserMessageChipsDemo() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    seedContextEntries(dispatch, DEMO_CONV_SINGLE, [DEMO_SINGLE_ENTRY]);
    seedContextEntries(dispatch, DEMO_CONV_MULTI, DEMO_MULTI_ENTRIES);
    seedContextEntries(
      dispatch,
      "demo-user-msg-ctx-types",
      DEMO_TYPE_ENTRIES.map((t) => t.entry),
    );
    seedInputResources(dispatch, DEMO_CONV_INPUT_CHIPS);
  }, [dispatch]);

  return (
    <div className="min-h-dvh bg-textured">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">
            User Message Chips
          </h1>
          <p className="text-sm text-muted-foreground">
            Production tiles in{" "}
            <code className="text-xs">AgentUserMessage</code>,{" "}
            <code className="text-xs">SmartAgentResourceChips</code>, and{" "}
            <code className="text-xs">ContextSlotChipStrip</code> (single +
            group). Style explorations below are kept for future tuning.
          </p>
        </header>

        <ResourceEditableToggleSamples />

        <UserMessageAttachmentStyleComparison
          specs={DEMO_COMPARISON_ATTACHMENTS}
          inputChipsConversationId={DEMO_CONV_INPUT_CHIPS}
        />

        <UserMessageHybridTileSamples specs={DEMO_COMPARISON_ATTACHMENTS} />

        {/* ── Context slots ── */}
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
            Context slots
          </h2>

          <DemoBubble
            title="Single context item"
            description="One slot → full chip with label + preview. Click opens detail sheet."
          >
            <ContextSlotChipStrip
              conversationId={DEMO_CONV_SINGLE}
              agentId={null}
            />
            <p className="text-xs text-foreground whitespace-pre-wrap">
              Can you go ahead and get this working document ready?
            </p>
          </DemoBubble>

          <DemoBubble
            title="Multiple context items"
            description="Two or more → collapsed “Context Items (N)” popover."
          >
            <ContextSlotChipStrip
              conversationId={DEMO_CONV_MULTI}
              agentId={null}
            />
            <p className="text-xs text-foreground whitespace-pre-wrap">
              Here is everything attached — open the popover to browse each
              slot.
            </p>
          </DemoBubble>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                All context types
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                One bubble per{" "}
                <code className="text-[10px]">ContextObjectType</code>. Click
                any chip to inspect the detail sheet renderer for that type.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {DEMO_TYPE_ENTRIES.map(({ type, entry, slot }) => (
                <DemoBubble key={type} title={type} className="max-w-none">
                  <ContextSlotChip
                    conversationId="demo-user-msg-ctx-types"
                    agentId={null}
                    entry={entry}
                    slot={slot}
                  />
                </DemoBubble>
              ))}
            </div>
          </section>
        </div>

        {/* ── Resource attachments ── */}
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
            Resource attachments
          </h2>

          <DemoBubble
            title="FileResourceChip (with file_id)"
            description="Media blocks that carry a cld_files UUID use the rich chip — thumbnail, hover peek, click → FilePreview."
          >
            <div className="flex flex-wrap gap-1">
              <FileResourceChip
                fileId="00000000-0000-0000-0000-000000000000"
                size="xs"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Fake UUID above — shows “Unknown file” fallback until a real file
              is in Redux. Swap in a real{" "}
              <code className="text-[10px]">file_id</code> to test the full
              path.
            </p>
          </DemoBubble>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Legacy block chips
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Notes, tasks, webpages, tables, etc. — per-type pill + modal on
                click. Styled to match{" "}
                <code className="text-[10px]">AttachmentChip</code>.
              </p>
            </div>
            <DemoBubble
              title="All legacy types in one message"
              className="max-w-lg"
            >
              <div className="flex flex-wrap gap-1">
                {DEMO_LEGACY_ATTACHMENTS.map((spec) => (
                  <DemoAttachmentChip key={spec.id} spec={spec} />
                ))}
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap">
                Mixed attachments above a text line — same layout as production.
              </p>
            </DemoBubble>
          </section>
        </div>

        {/* ── Combined ── */}
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-foreground border-b border-border pb-2">
            Combined (production layout)
          </h2>

          <DemoBubble
            title="Context + attachments + text"
            description="Order in AgentUserMessage: context strip → attachment row → message text."
            className="max-w-lg"
          >
            <ContextSlotChipStrip
              conversationId={DEMO_CONV_MULTI}
              agentId={null}
            />
            <div className="flex flex-wrap gap-1.5">
              {DEMO_LEGACY_ATTACHMENTS.slice(0, 3).map((spec) => {
                const Icon = ATTACHMENT_ICONS[spec.id] ?? FileText;
                return (
                  <ResourceAttachmentTile
                    key={spec.id}
                    typeLabel={spec.label}
                    title={spec.title}
                    icon={Icon}
                    themeKey={spec.id}
                  />
                );
              })}
            </div>
            <p className="text-xs text-foreground whitespace-pre-wrap">
              Can you go ahead and get this working document ready with the
              content and then let&apos;s talk about it?
            </p>
          </DemoBubble>
        </div>
      </div>
    </div>
  );
}
