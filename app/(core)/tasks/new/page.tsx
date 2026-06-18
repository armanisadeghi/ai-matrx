"use client";

import { useRouter } from "next/navigation";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";

export default function NewTaskPage() {
  const router = useRouter();

  const handleSaved = (taskId: string) => {
    router.push(`/tasks?task=${taskId}`);
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold text-foreground">
          Create New Task
        </h1>
        <p className="text-sm text-muted-foreground">
          Capture a task — or let AI set it up for you.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto h-full w-full max-w-3xl px-4 py-4">
          <TaskCreatePanel
            onSaved={handleSaved}
            onCancel={() => router.push("/tasks")}
          />
        </div>
      </div>
    </div>
  );
}
