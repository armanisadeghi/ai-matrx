// Server component. Thin wrapper that renders the EduComingSoon placeholder for
// a tool slug from the tools registry. Keeps each /education/<tool> route file
// to a couple of lines while the single source of config stays in data/tools.ts.
import { notFound } from "next/navigation";
import { EduComingSoon } from "./EduComingSoon";
import { EDU_TOOL_BY_SLUG } from "../data/tools";

export function EduToolComingSoon({ slug }: { slug: string }) {
  const tool = EDU_TOOL_BY_SLUG[slug];
  if (!tool) notFound();
  return (
    <EduComingSoon
      icon={tool.icon}
      title={tool.name}
      description={tool.description}
      capabilities={tool.capabilities}
      visionRef={tool.visionRef}
      status={tool.status}
      accessTier={tool.accessTier}
    />
  );
}
