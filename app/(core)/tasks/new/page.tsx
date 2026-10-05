"use client";

import { useRouter } from "next/navigation";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";

export default function NewTaskPage() {
  const router = useRouter();

  const handleSaved = (taskId: string) => {
    router.push(`/tasks?task=${taskId}`);
  };

  return (
    <>
      <RecordPageHeader
        backHref="/tasks"
        parents={[{ label: "Tasks", href: "/tasks" }]}
        record={{ name: "New task" }}
      />
      {/* Static top UI (the form / post-save banner starts at the top) must
          clear the glass header, or it renders behind it on mobile. */}
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
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
