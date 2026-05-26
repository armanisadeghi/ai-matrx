import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { PromptBuiltinsLayoutClient } from "./PromptBuiltinsLayoutClient";

export const metadata = createRouteMetadata("/administration", {
  title: "Prompt Builtins",
  description:
    "Manage prompt shortcuts, categories, and built-in prompt definitions",
  letter: "PB",
});

export default function PromptBuiltinsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PromptBuiltinsLayoutClient>{children}</PromptBuiltinsLayoutClient>;
}
