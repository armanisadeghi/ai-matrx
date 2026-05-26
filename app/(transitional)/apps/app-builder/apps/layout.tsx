import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import AppsSectionLayoutClient from "./AppsSectionLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Apps",
  title: "App Builder",
  description: "Create and manage published Matrx applications.",
  letter: "Am", // App builder — apps section
});

interface AppsLayoutProps {
  children: ReactNode;
}

export default function AppsLayout({ children }: AppsLayoutProps) {
  return <AppsSectionLayoutClient>{children}</AppsSectionLayoutClient>;
}
