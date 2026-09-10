import AppLink from "@/components/navigation/AppLink";
import { createRouteMetadata } from "@/utils/route-metadata";
import {
  FEATURE_DOC_DOT_DIRS,
  dotDirRouteSlug,
} from "@/features/feature-docs/constants";
import FeatureDocsShell from "@/features/feature-docs/components/FeatureDocsShell";

export const metadata = createRouteMetadata(
  "/administration/documentation/feature-docs/dotdirs",
  {
    titlePrefix: "Feature Docs",
    title: "Tooling dirs",
    letter: "Fd",
  },
);

export default function FeatureDocsDotDirsHubPage() {
  return (
    <FeatureDocsShell
      zone="dotdir"
      title="Tooling dirs"
      subtitle="Agent, IDE, and repo-local config markdown — kept separate from codebase docs"
    >
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {FEATURE_DOC_DOT_DIRS.map((dir) => (
            <AppLink
              key={dir}
              href={`/administration/documentation/feature-docs/dotdirs/${dotDirRouteSlug(dir)}`}
              className="rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/40 hover:bg-accent/30 transition-colors"
            >
              <p className="font-mono text-sm font-semibold">{dir}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {/* eslint-disable-next-line react/jsx-no-comment-textnodes -- "/**" here is a glob in prose, not a JS comment. */}
                Browse {dir}/**/*.md
              </p>
            </AppLink>
          ))}
        </div>
      </div>
    </FeatureDocsShell>
  );
}
