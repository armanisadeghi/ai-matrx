"use client";

import { useRouter } from "next/navigation";
import { ProjectCreatePanel } from "@/features/projects/components/ProjectCreatePanel";
import type { Project } from "@/features/projects/types";

export default function NewProjectPage() {
  const router = useRouter();

  const handleClose = () => router.push("/projects");

  const handleSuccess = (project: Project) => {
    // Always route by UUID — slug is only unique inside an org, and PG treats
    // NULL org_ids as distinct in the unique constraint, so the id is the only
    // globally-safe segment for both personal and org projects.
    router.push(`/projects/${project.id}/settings`);
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold text-foreground">
          Create New Project
        </h1>
        <p className="text-sm text-muted-foreground">
          Name it, pick an owner, and go — or let AI set it up for you.
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto h-full w-full max-w-2xl px-4 py-4">
          <ProjectCreatePanel
            skipRedirect
            onSuccess={handleSuccess}
            onClose={handleClose}
          />
        </div>
      </div>
    </div>
  );
}
