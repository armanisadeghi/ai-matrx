import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/prompts", {
  titlePrefix: "Redux",
  title: "Prompts",
  description: "Edit a prompt with the Redux-powered editor",
  letter: "RX",
});

export default function EditPromptLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
