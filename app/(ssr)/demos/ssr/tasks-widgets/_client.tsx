"use client";

/**
 * Tasks Widgets Demo — every drop-in component in one place.
 *
 * This page has **zero local state and zero page-level logic**. Every widget
 * drives itself off Redux + the shared `useAssociateTask` hook. The page
 * pulls in real entities (notes, messages, files) from their respective
 * slices so you can see the widgets operating on live data.
 *
 * Anything you do here is real — it writes to `ctx_task_associations` and
 * shows up on `/tasks` immediately.
 */

import React from "react";
import Link from "next/link";
import {
  FileText,
  MessageSquare,
  Paperclip,
  Keyboard,
  Layers,
  ListPlus,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { selectAllNotesList } from "@/features/notes/redux/selectors";
import { selectAllTasksFlat } from "@/features/tasks/redux/selectors";
import QuickCreateTaskButton from "@/features/tasks/widgets/QuickCreateTaskButton";
import AssociateTaskButton from "@/features/tasks/widgets/AssociateTaskButton";
import TaskChip from "@/features/tasks/widgets/TaskChip";
import TaskChipRow from "@/features/tasks/widgets/TaskChipRow";
import TaskQuickAddBar from "@/features/tasks/widgets/TaskQuickAddBar";
import TaskTapButton from "@/features/tasks/widgets/TaskTapButton";
import TaskAttachmentsPanel from "@/features/tasks/components/TaskAttachmentsPanel";
import TaskPreviewWindow from "@/features/tasks/components/TaskPreviewWindow";
import { parseMarkdownChecklist } from "@/components/mardown-display/blocks/tasks/tasklist-parser";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import {
  CopyTapButton,
  PencilTapButton,
  MoreHorizontalTapButton,
  ThumbsUpTapButton,
} from "@/components/icons/tap-buttons";

// Demo fixtures — realistic fake IDs the backend RLS will reject. Every
// widget still renders + opens correctly; only the final "commit" hits the
// DB (and will show an error toast for the fake ids, which is the point).
const DEMO_IDS = {
  note: "00000000-0000-0000-0000-000000000001",
  message: "00000000-0000-0000-0000-000000000002",
  file: "00000000-0000-0000-0000-000000000003",
  agentConversation: "00000000-0000-0000-0000-000000000004",
  chatBlock: "00000000-0000-0000-0000-000000000005",
};

const SAMPLE_TASKS_MARKDOWN = `
# Product launch checklist

## Engineering
- [ ] Harden error boundaries in the chat pipeline
- [ ] Ship the new scope-filter flamegraph metric
- [ ] Cut 1.14.0 release branch

## Marketing
- [ ] Finalize the launch post hero image
- [ ] Draft the release-day email sequence
- [ ] Schedule Friday's AMA
`;

export default function TasksWidgetsDemo() {
  // Shared hydration. If the user has already opened /tasks or the notes
  // sidebar, this is a no-op.
  useNavTree();

  // Pull real entities for demo sections so widgets have something to bind to.
  const allTasks = useAppSelector(selectAllTasksFlat);
  const allNotes = useAppSelector(selectAllNotesList);

  const firstTaskId = allTasks[0]?.id ?? null;
  const firstNote = allNotes[0] ?? null;

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const parsedItems = React.useMemo(
    () => parseMarkdownChecklist(SAMPLE_TASKS_MARKDOWN),
    [],
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-10">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Tasks Widgets</h1>
        <p className="text-sm text-muted-foreground">
          Every drop-in task component, wired to real Redux state. Open{" "}
          <Link
            className="underline underline-offset-2 text-primary hover:text-primary/80"
            href="/tasks"
          >
            /tasks
          </Link>{" "}
          in another tab to watch tasks appear as you create them.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Keyboard className="w-3.5 h-3.5" />
          Press{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-card border border-border/60 font-mono text-[10px]">
            ⌘⇧T
          </kbd>{" "}
          or{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-card border border-border/60 font-mono text-[10px]">
            Ctrl+Shift+T
          </kbd>{" "}
          from anywhere to create a task. Mounted in{" "}
          <code className="font-mono">Providers.tsx</code>.
        </div>
      </header>

      {/* Section: QuickCreateTaskButton */}
      <Section
        title="QuickCreateTaskButton"
        summary="The simplest trigger. Drop anywhere for a create-task popover. Scopes + project defaults come from active app context."
      >
        <Demo label="Icon">
          <QuickCreateTaskButton variant="icon" />
        </Demo>
        <Demo label="Button">
          <QuickCreateTaskButton variant="button" label="New task" />
        </Demo>
        <Demo label="Menu item">
          <div className="w-56 rounded-md border border-border bg-card p-1">
            <QuickCreateTaskButton variant="menu-item" label="Create a task" />
          </div>
        </Demo>
        <Demo label="With pre-filled title">
          <QuickCreateTaskButton
            variant="button"
            prePopulate={{
              title: "Review PR #1247",
              priority: "high",
            }}
          />
        </Demo>
      </Section>

      {/* Section: AssociateTaskButton */}
      <Section
        title="AssociateTaskButton"
        summary="The universal attach-to-task button. Pass any entity type + id and it handles search/create/link/unlink. Shows a linked-count badge."
      >
        <Demo label="Icon — attach this note to a task">
          <AssociateTaskButton
            entityType="note"
            entityId={firstNote?.id ?? DEMO_IDS.note}
            label={firstNote?.label ?? "Demo note"}
            variant="icon"
          />
        </Demo>
        <Demo label="Button — attach a chat message">
          <AssociateTaskButton
            entityType="message"
            entityId={DEMO_IDS.message}
            label="This demo message — writes to ctx_task_associations"
            variant="button"
            label_text="Attach to task"
          />
        </Demo>
        <Demo label="Menu item — inside a dropdown">
          <div className="w-56 rounded-md border border-border bg-card p-1">
            <AssociateTaskButton
              entityType="user_file"
              entityId={DEMO_IDS.file}
              label="report.pdf"
              variant="menu-item"
              label_text="Attach file to task"
            />
          </div>
        </Demo>
      </Section>

      {/* Section: TaskTapButton (tap-target style) */}
      <Section
        title="TaskTapButton"
        summary="Tap-target-style button matching CopyTapButton, PencilTapButton, etc. Drops cleanly into a TapTargetButtonGroup — exactly like the message action bar."
      >
        <Demo label="In a tap-target group (assistant action bar style)">
          <TapTargetButtonGroup>
            <ThumbsUpTapButton variant="group" ariaLabel="Like" />
            <CopyTapButton variant="group" ariaLabel="Copy" />
            <PencilTapButton variant="group" ariaLabel="Edit" />
            <TaskTapButton
              variant="group"
              entityType="message"
              entityId={DEMO_IDS.message}
              label="Demo message for tap-button task flow"
              icon="check-square"
            />
            <MoreHorizontalTapButton variant="group" ariaLabel="More" />
          </TapTargetButtonGroup>
        </Demo>
        <Demo label="Glass variant (floating toolbars)">
          <TaskTapButton
            variant="glass"
            entityType="message"
            entityId={DEMO_IDS.message}
            icon="link"
          />
        </Demo>
        <Demo label="No entity → pure create mode">
          <TapTargetButtonGroup>
            <TaskTapButton variant="group" icon="check-square" />
          </TapTargetButtonGroup>
        </Demo>
      </Section>

      {/* Section: TaskChipRow */}
      <Section
        title="TaskChipRow"
        summary="Inline row showing every task linked to an entity, plus a '+' to attach more. Drops under any message / note / file row."
      >
        <Demo label="Under a fake note row">
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">
                {firstNote?.label ?? "Sample note"}
              </span>
            </div>
            <TaskChipRow
              entityType="note"
              entityId={firstNote?.id ?? DEMO_IDS.note}
              label={firstNote?.label}
            />
          </div>
        </Demo>
        <Demo label="Under an assistant message bubble">
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
              <p className="text-foreground">
                Here's the plan I drafted. We should kick off with the
                engineering track first so the marketing dependencies resolve.
              </p>
            </div>
            <TaskChipRow
              entityType="message"
              entityId={DEMO_IDS.message}
              label="Here's the plan I drafted..."
            />
          </div>
        </Demo>
        <Demo label="Under a file row">
          <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <span className="flex-1 text-sm">launch-plan.pdf</span>
            <TaskChipRow
              entityType="user_file"
              entityId={DEMO_IDS.file}
              label="launch-plan.pdf"
              size="xs"
            />
          </div>
        </Demo>
      </Section>

      {/* Section: TaskChip */}
      <Section
        title="TaskChip"
        summary="Single colored pill for an existing task. Click to open; hover to unlink. Perfect for attachment panels and inline references."
      >
        {allTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Create a task to see chips rendered here.
          </p>
        ) : (
          <Demo label="Your first 5 tasks">
            <div className="flex flex-wrap gap-1.5">
              {allTasks.slice(0, 5).map((t) => (
                <TaskChip key={t.id} taskId={t.id} size="sm" />
              ))}
            </div>
          </Demo>
        )}
      </Section>

      {/* Section: TaskQuickAddBar */}
      <Section
        title="TaskQuickAddBar"
        summary="Inline input — Enter creates a task. Same spirit as the VoiceTextarea. Drop into empty states and sidebars."
      >
        <Demo label="Unbound (creates standalone task)">
          <TaskQuickAddBar placeholder="Add a task — press Enter to create" />
        </Demo>
        <Demo label="Bound to a note (auto-links each task)">
          <TaskQuickAddBar
            source={{
              entity_type: "note",
              entity_id: firstNote?.id ?? DEMO_IDS.note,
              label: firstNote?.label,
            }}
            placeholder="Add a task linked to this note..."
          />
        </Demo>
      </Section>

      {/* Section: TaskPreviewWindow (bulk flow for TasksBlock) */}
      <Section
        title="TaskPreviewWindow"
        summary="Quality gate between an AI-generated task list and real persisted tasks. Review, edit, de-select, then bulk-create with one RPC."
      >
        <Demo label="Sample task list from the AI">
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground">
              {SAMPLE_TASKS_MARKDOWN.trim()}
            </pre>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <ListPlus className="w-3.5 h-3.5" />
              Save to Tasks
            </button>
          </div>
          <TaskPreviewWindow
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            parsedItems={parsedItems}
            source={{
              entity_type: "chat_block",
              entity_id: DEMO_IDS.chatBlock,
              metadata: { block_index: 0, demo: true },
            }}
          />
        </Demo>
      </Section>

      {/* Section: TaskAttachmentsPanel (live) */}
      <Section
        title="TaskAttachmentsPanel"
        summary="Shown inside TaskEditor. Collapsible sections per entity type — notes, files, messages, conversations, chat blocks. Powered by one RPC (get_task_associations)."
      >
        {firstTaskId ? (
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Live data for task: {firstTaskId}
            </div>
            <TaskAttachmentsPanel taskId={firstTaskId} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Create at least one task to see the live panel here.
          </p>
        )}
      </Section>

      {/* Section: GlobalTaskShortcut */}
      <Section
        title="GlobalTaskShortcut"
        summary="Mounted once in Providers.tsx. ⌘⇧T / Ctrl+Shift+T opens a quick-create dialog from anywhere. No prop wiring required at call sites."
      >
        <div className="text-xs text-muted-foreground">
          Already mounted globally. Press the shortcut to try it now.
        </div>
      </Section>

      {/* Footer — one-liners */}
      <footer className="border-t border-border/60 pt-6 space-y-2 text-xs text-muted-foreground">
        <div className="font-semibold text-foreground">Drop-in recipes</div>
        <pre className="font-mono bg-muted/40 rounded p-3 text-[11px] whitespace-pre-wrap leading-relaxed">
          {`// Attach anything to a task
<AssociateTaskButton entityType="user_file" entityId={file.id} label={file.filename} />

// Show everything this entity is linked to
<TaskChipRow entityType="conversation" entityId={conversation.id} />

// Tap-target style for action bars
<TaskTapButton variant="group" entityType="message" entityId={msg.id} />

// Inline creator
<TaskQuickAddBar source={{ entity_type: "note", entity_id: note.id }} />

// Bulk preview for AI task lists
<TaskPreviewWindow open={open} onOpenChange={setOpen} parsedItems={items}
  source={{ entity_type: "chat_block", entity_id: messageId }} />`}
        </pre>
      </footer>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function Section({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Demo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
