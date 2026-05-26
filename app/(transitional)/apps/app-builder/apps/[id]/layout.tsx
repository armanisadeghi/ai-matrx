import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";
import AppViewLayoutClient from "./AppViewLayoutClient";

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

  const title = data?.name?.trim() || "App";
  const description =
    data?.description?.slice(0, 120) || "Application in the app builder.";

  return createDynamicRouteMetadata("/apps", {
    title,
    description,
    letter: "Uv", // App detail (builder)
  });
}

export default function AppViewLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return <AppViewLayoutClient params={params}>{children}</AppViewLayoutClient>;
}
