import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import AppletsLayoutClient from "./AppletsLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Applets",
  title: "App Builder",
  description: "Create and manage applet packages and recipes.",
  letter: "Pl", // App builder — applets
});

interface AppletsLayoutProps {
  children: ReactNode;
}

export default function AppletsLayout({ children }: AppletsLayoutProps) {
  return <AppletsLayoutClient>{children}</AppletsLayoutClient>;
}
