import { redirect } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AssistsManager } from "@/features/assists/manager/AssistsManager";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = {
  title: "Assists",
  description: "Every assist the system has offered you, in every state.",
};

export default async function AssistsPage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/login");

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-0 p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Assists
          </h1>
        </div>
      </PageHeader>
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1">
          <AssistsManager />
        </div>
      </div>
    </>
  );
}
