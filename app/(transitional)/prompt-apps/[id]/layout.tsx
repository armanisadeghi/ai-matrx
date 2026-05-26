import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: app } = await supabase
    .from("prompt_apps")
    .select("name, tagline, description")
    .eq("id", id)
    .single();

  const name =
    app?.name && app.name.trim() !== "" ? app.name.trim() : "Prompt App";
  const rawDesc = app?.tagline || app?.description;
  const description =
    rawDesc && rawDesc.trim() !== ""
      ? rawDesc.slice(0, 120)
      : "Edit and manage your AI-powered prompt application";

  return createDynamicRouteMetadata("/prompt-apps", {
    title: name,
    description,
    letter: "Pd",
  });
}

export default function PromptAppIdLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
