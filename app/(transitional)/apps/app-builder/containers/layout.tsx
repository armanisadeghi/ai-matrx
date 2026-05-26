import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import ContainersLayoutClient from "./ContainersLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Containers",
  title: "App Builder",
  description: "Create and manage field containers and groups.",
  letter: "Cl", // App builder — containers
});

interface ContainersLayoutProps {
  children: ReactNode;
}

export default function ContainersLayout({ children }: ContainersLayoutProps) {
  return <ContainersLayoutClient>{children}</ContainersLayoutClient>;
}
