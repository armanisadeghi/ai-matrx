import { ScopesHub } from "@/features/scopes/components/management/ScopesHub";
import { ScopesHubHeader } from "@/features/scopes/components/management/ScopesHubHeader";

// Guest branch lives in ./layout.tsx (ScopesLanding) so /scopes/settings and
// /scopes/templates are covered too — this page renders for authed users only.
export default function ScopesIndexPage() {
  return (
    <>
      <ScopesHubHeader />
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)] scroll-pt-[var(--shell-header-h)]">
        <div data-matrx-table-page className="py-4">
          <ScopesHub />
        </div>
      </div>
    </>
  );
}
