"use client";

// features/meet/components/record/ActionItemsSection.tsx
//
// THE ACTION ITEMS, EACH ONE A TASK AWAY (Meet wave 3). Owner as the meeting
// named them; "Task" makes it a platform task (owner + due date, linked back to
// this meeting) and "Create N tasks" does every one still loose. Once a task
// exists the row shows ITS status and due date — done in Tasks is done here.

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ListPlus, Loader2, SquareCheck } from "lucide-react";
import {
  absenceSentence,
  displayNameFor,
  type MeetingNote,
  type MeetingRecord,
  type MeetingRecordBundle,
} from "@ai-matrx/meet/react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TASK_STATUS_META } from "@/features/tasks/constants/status";
import {
  useActionItemTasks,
  type LinkedTask,
} from "@/features/meet/hooks/useActionItemTasks";

interface Person {
  readonly userId: string;
  readonly name: string;
}

function formatDue(date: string | null): string | null {
  if (!date) return null;
  const at = new Date(`${date}T12:00:00`);
  return Number.isNaN(at.getTime())
    ? date
    : at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TaskStatusChip({ task }: { task: LinkedTask }) {
  const meta = TASK_STATUS_META[task.status] ?? TASK_STATUS_META.inbox;
  const Icon = meta.icon;
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80",
        meta.chipClass,
      )}
      title="Open the task"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {meta.label}
    </Link>
  );
}

export function ActionItemsSection({
  meeting,
  bundle,
  when,
  canManage,
  userId,
  focusNoteId,
}: {
  meeting: MeetingRecord;
  bundle: MeetingRecordBundle;
  when: string;
  canManage: boolean;
  userId: string | null;
  focusNoteId: string | null;
}) {
  const items = bundle.actionItems;
  const linked = useActionItemTasks({
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    organizationId: meeting.organizationId,
    when,
    noteIds: items.map((item) => item.id),
  });
  const [editing, setEditing] = useState<MeetingNote | null>(null);
  const [bulk, setBulk] = useState(false);

  // People who can own a task: everyone with an account who was there, and me.
  const people: Person[] = [];
  const seen = new Set<string>();
  for (const person of bundle.attendees) {
    if (!person.userId || person.isAgent || seen.has(person.userId)) continue;
    seen.add(person.userId);
    people.push({
      userId: person.userId,
      name: displayNameFor(bundle.names, person.identity, person.displayName),
    });
  }
  if (userId && !seen.has(userId)) people.unshift({ userId, name: "Me" });

  const defaultOwner = (item: MeetingNote): string | null =>
    item.assigneeUserId ?? userId;

  const loose = items.filter((item) => !linked.tasks.has(item.id));

  const createAll = async () => {
    setBulk(true);
    let made = 0;
    for (const item of loose) {
      const ok = await linked.createOne({
        item: {
          noteId: item.id,
          text: item.text,
          ownerName: item.assigneeDisplayName,
        },
        assigneeId: defaultOwner(item),
        dueDate: null,
      });
      if (ok) made += 1;
    }
    setBulk(false);
    if (made > 0)
      toast.success(`${made} task${made === 1 ? "" : "s"} created in Tasks.`);
  };

  useEffect(() => {
    if (!focusNoteId) return;
    document
      .getElementById(`note-${focusNoteId}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusNoteId]);

  return (
    <section aria-label="Action items" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Action items
          {items.length > 0 ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {items.length}
            </span>
          ) : null}
        </h2>
        {canManage && loose.length > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={bulk || linked.loading}
            onClick={() => void createAll()}
          >
            {bulk ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Create {loose.length} tasks
          </Button>
        ) : null}
      </div>
      {linked.failure ? (
        <p role="alert" className="text-xs text-destructive">
          {linked.failure}
          <ErrorAlchemyMenu error={linked.failure} size="xs" />
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {absenceSentence(
            bundle,
            "notes",
            "No action items came out of this meeting.",
          )}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map((item) => {
            const task = linked.tasks.get(item.id);
            const done = task?.status === "completed";
            const due = formatDue(task?.dueDate ?? null);
            return (
              <li
                key={item.id}
                id={`note-${item.id}`}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2",
                  focusNoteId === item.id && "bg-primary/5",
                )}
              >
                <SquareCheck
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    done
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/60",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {item.text}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{item.assigneeDisplayName ?? "No owner named"}</span>
                    {due ? <span>Due {due}</span> : null}
                  </p>
                </div>
                {task ? (
                  <TaskStatusChip task={task} />
                ) : canManage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={linked.creating.has(item.id) || bulk}
                    onClick={() => setEditing(item)}
                  >
                    {linked.creating.has(item.id) ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      "Task"
                    )}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <CreateTaskDialog
          item={editing}
          people={people}
          defaultOwner={defaultOwner(editing)}
          onClose={() => setEditing(null)}
          onCreate={async (assigneeId, dueDate) => {
            const ok = await linked.createOne({
              item: {
                noteId: editing.id,
                text: editing.text,
                ownerName: editing.assigneeDisplayName,
              },
              assigneeId,
              dueDate,
            });
            if (ok) {
              toast.success("Task created in Tasks.");
              setEditing(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}

const NOBODY = "__nobody__";

function CreateTaskDialog({
  item,
  people,
  defaultOwner,
  onClose,
  onCreate,
}: {
  item: MeetingNote;
  people: readonly Person[];
  defaultOwner: string | null;
  onClose: () => void;
  onCreate: (
    assigneeId: string | null,
    dueDate: string | null,
  ) => Promise<void>;
}) {
  const [owner, setOwner] = useState<string>(defaultOwner ?? NOBODY);
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a task</DialogTitle>
          <DialogDescription className="line-clamp-3">
            {item.text}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Owner
            </span>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-9" aria-label="Owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.userId} value={person.userId}>
                    {person.name}
                  </SelectItem>
                ))}
                <SelectItem value={NOBODY}>Nobody yet</SelectItem>
              </SelectContent>
            </Select>
            {item.assigneeDisplayName && !item.assigneeUserId ? (
              <span className="block text-xs text-muted-foreground">
                The meeting named {item.assigneeDisplayName}, who has no
                account here; the task keeps their name in its description.
              </span>
            ) : null}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Due date
            </span>
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-9"
              aria-label="Due date"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onCreate(owner === NOBODY ? null : owner, due || null);
              setSaving(false);
            }}
          >
            {saving ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
