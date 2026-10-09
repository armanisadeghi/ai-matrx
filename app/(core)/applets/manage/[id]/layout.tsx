import { ReactNode, Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import { getApplet } from "@/lib/applets/data";
import { AppletHydratorServer } from "@/features/applets/route/AppletHydratorServer";
import { AppletSurfaceRuntime } from "@/features/applets/route/AppletSurfaceRuntime";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const app = await getApplet(id).catch(() => null);
  const name = app?.name?.trim() || "Applet";
  const rawDesc = app?.tagline || app?.description;
  const description =
    rawDesc && rawDesc.trim() !== ""
      ? rawDesc.slice(0, 120)
      : "Manage this Applet";

  return createDynamicRouteMetadata("/applets", {
    title: name,
    description,
    letter: "AD",
  });
}

export default async function AppletIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A build that has not saved an app yet is still being built: EVERY owner page (overview, run,
  // code, settings, versions) opens as its build. A row that is not there falls through to the
  // page's own not-found.
  const app = await getApplet(id).catch(() => null);
  if (app && !app.entry) redirect(`/applets/build/${app.id}`);
  return (
    <>
      {/* Hydrate the applet row into Redux for every sub-route. Streamed in
          a Suspense boundary so it never blocks the layout shell. The /run
          shell does NOT depend on the hydrator winning the race — useApplet
          gates the launcher behind selectAgentExecutionPayload(...).isReady,
          dispatching fetchAgentExecutionMinimal if needed. */}
      <Suspense fallback={null}>
        <AppletHydratorServer appId={id} />
      </Suspense>
      {/* Surface Values: register `matrx-user/agent-apps` for every sub-route.
          The scope is read live from Redux at Run time — see the manifest at
          features/surfaces/manifests/applets.manifest.ts. */}
      <AppletSurfaceRuntime>{children}</AppletSurfaceRuntime>
    </>
  );
}
