import { createRouteMetadata } from "@/utils/route-metadata";
import FeatureDocsTable from "@/features/feature-docs/components/FeatureDocsTable";

export const metadata = createRouteMetadata("/administration/feature-docs", {
  title: "Feature Docs",
  description:
    "Internal feature documentation synced from repo markdown via admin.feature_docs",
  letter: "Fd",
});

export default function FeatureDocsAdminPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-background">
      <header className="border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-sm font-bold tracking-tight">Feature Docs</h1>
          <span className="text-xs text-muted-foreground">
            DB-backed internal markdown — sync with{" "}
            <code className="font-mono">pnpm sync:feature-docs</code>
          </span>
        </div>
      </header>
      <FeatureDocsTable />
    </div>
  );
}
