"use client";

import { useRouter } from "next/navigation";
import { ProjectCreatePanel } from "@/features/projects/components/ProjectCreatePanel";
import type { Project } from "@/features/projects/types";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

export default function NewProjectPage() {
  const router = useRouter();

  const handleClose = () => router.push("/projects");

  const handleSuccess = (project: Project) => {
    // Always route by UUID — slug is only unique inside an org, and PG treats
    // NULL org_ids are distinct in the unique constraint, so the id is the only
    // globally-safe segment for both personal and org projects.
    router.push(`/projects/${project.id}/settings`);
  };

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton href="/projects" ariaLabel="Back" />
            <span className="ml-2 text-sm font-medium text-foreground truncate">
              New project
            </span>
          </>
        }
      />
      <div className="h-full overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="mx-auto h-full w-full max-w-2xl px-4 py-4">
          <ProjectCreatePanel
            skipRedirect
            onSuccess={handleSuccess}
            onClose={handleClose}
          />
        </div>
      </div>
    </>
  );
}
