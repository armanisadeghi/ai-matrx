"use client";

import { useRouter } from "next/navigation";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export default function NewTaskPage() {
  const router = useRouter();

  const handleSaved = (taskId: string) => {
    router.push(`/tasks?task=${taskId}`);
  };

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <ChevronLeftTapButton href="/tasks" variant="transparent" ariaLabel="Back to tasks" />
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            Create New Task
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden bg-textured">
        <div className="mx-auto h-full w-full max-w-3xl px-4 py-4">
          <TaskCreatePanel
            onSaved={handleSaved}
            onCancel={() => router.push("/tasks")}
          />
        </div>
      </div>
    </>
  );
}
