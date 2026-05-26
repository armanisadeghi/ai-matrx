import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Edit",
  title: "Prompts",
  description: "Edit an existing AI prompt",
  letter: "PE",
});

export default function EditPromptLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
