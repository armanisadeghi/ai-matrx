import PageHeader from "@/features/shell/components/header/PageHeader";
import { WorkflowCatalog } from "@/features/workflow-runtime/catalog/WorkflowCatalog";

/**
 * /workflows — the entry LIST (root CLAUDE.md: a feature's entry page is a
 * list of everything you can do, never a forced detail view). Picking one
 * leads to running it (`/workflows/[id]`) or designing what you watch while
 * it runs (`/workflows/[id]/design`).
 */
export default function WorkflowsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="min-w-0 truncate text-sm font-medium text-foreground">
            Workflows
          </h1>
        </div>
      </PageHeader>

      <div className="h-full overflow-hidden">
        <div className="mx-auto flex h-full max-w-[1600px] flex-col px-3 pb-3 pt-[var(--shell-header-h)] sm:px-5">
          <WorkflowCatalog />
        </div>
      </div>
    </>
  );
}
