import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/admin", {
  titlePrefix: "App Template",
  title: "Admin",
  description: "Starter layout shell for admin app template pages",
  letter: "Ap",
});

export default function AppTemplateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div>{children}</div>;
}
