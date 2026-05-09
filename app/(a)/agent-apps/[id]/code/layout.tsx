import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getAgentApp } from "@/lib/agent-apps/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const app = await getAgentApp(id).catch(() => null);
  const name = app?.name?.trim() || "Agent App";
  return createDynamicRouteMetadata("/agent-apps", {
    titlePrefix: "Code",
    title: name,
    description: `Edit code for ${name}`,
    letter: "AC",
  });
}

export default function CodeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
