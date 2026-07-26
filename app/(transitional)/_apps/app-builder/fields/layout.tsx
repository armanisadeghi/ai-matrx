import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import FieldsLayoutClient from "./FieldsLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Fields",
  title: "App Builder",
  description: "Create and manage reusable field components.",
  letter: "Fl", // App builder — fields
});

interface AppBuilderLayoutProps {
  children: ReactNode;
}

export default function FieldsLayout({ children }: AppBuilderLayoutProps) {
  return <FieldsLayoutClient>{children}</FieldsLayoutClient>;
}
