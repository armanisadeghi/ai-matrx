import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";
import ContainerDetailLayoutClient from "./ContainerDetailLayoutClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("component_groups")
    .select("label, description")
    .eq("id", id)
    .maybeSingle();

  const title = data?.label?.trim() || "Container";
  const description =
    data?.description?.slice(0, 120) || "Container in the app builder.";

  return createDynamicRouteMetadata("/apps", {
    title,
    description,
    letter: "Cv", // Container detail
  });
}

export default function ContainerDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <ContainerDetailLayoutClient params={params}>
      {children}
    </ContainerDetailLayoutClient>
  );
}
