import { ReactNode, Suspense } from "react";
import type { Metadata } from "next";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { getAgentApp } from "@/lib/agent-apps/data";
import { AgentAppHydratorServer } from "@/features/agent-apps/route/AgentAppHydratorServer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const app = await getAgentApp(id).catch(() => null);
  const name = app?.name?.trim() || "Agent App";
  const rawDesc = app?.tagline || app?.description;
  const description =
    rawDesc && rawDesc.trim() !== ""
      ? rawDesc.slice(0, 120)
      : "Manage your AI-powered agent application";

  return createDynamicRouteMetadata("/agent-apps", {
    title: name,
    description,
    letter: "Ag",
  });
}

export default async function AgentAppIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <span className="shell-hide-dock" aria-hidden="true" />
      {/* Hydrate the agent-app row into Redux for every sub-route. Streamed in
          a Suspense boundary so it never blocks the layout shell. */}
      <Suspense fallback={null}>
        <AgentAppHydratorServer appId={id} />
      </Suspense>
      {children}
    </>
  );
}
