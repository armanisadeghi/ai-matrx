import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";
import FieldDetailLayoutClient from "./FieldDetailLayoutClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("field_components")
    .select("label")
    .eq("id", id)
    .maybeSingle();

  const title = data?.label?.trim() || "Field";
  const description = "View or edit a field in the app builder.";

  return createDynamicRouteMetadata("/apps", {
    title,
    description,
    letter: "Fv", // Field detail
  });
}

export default function FieldDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  return (
    <FieldDetailLayoutClient params={params}>
      {children}
    </FieldDetailLayoutClient>
  );
}
