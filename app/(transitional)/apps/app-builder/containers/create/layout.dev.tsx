import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import ContainerCreateLayoutClient from "./ContainerCreateLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "New Container",
  title: "App Builder",
  description: "Create a new field container.",
  letter: "Cc", // Container create
});

export default function ContainerCreateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ContainerCreateLayoutClient>{children}</ContainerCreateLayoutClient>;
}
