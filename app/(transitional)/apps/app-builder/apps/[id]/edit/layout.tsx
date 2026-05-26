import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";
import AppEditLayoutClient from "./AppEditLayoutClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_app_configs")
    .select("name, description")
    .eq("id", id)
    .maybeSingle();

  const name = data?.name?.trim() || "App";
  const description =
    data?.description?.slice(0, 120) || `Edit ${name} in the app builder.`;

  return createDynamicRouteMetadata("/apps", {
    titlePrefix: "Edit",
    title: name,
    description,
    letter: "Ue", // App edit
  });
}

export default function AppEditLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return <AppEditLayoutClient params={params}>{children}</AppEditLayoutClient>;
}
