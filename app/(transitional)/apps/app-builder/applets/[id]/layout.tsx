import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";
import AppletViewLayoutClient from "./AppletViewLayoutClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_applet_configs")
    .select("name, description")
    .eq("id", id)
    .maybeSingle();

  const title = data?.name?.trim() || "Applet";
  const description =
    data?.description?.slice(0, 120) || "Applet in the app builder.";

  return createDynamicRouteMetadata("/apps", {
    title,
    description,
    letter: "Pv", // Applet detail
  });
}

export default function AppletViewLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <AppletViewLayoutClient params={params}>{children}</AppletViewLayoutClient>
  );
}
