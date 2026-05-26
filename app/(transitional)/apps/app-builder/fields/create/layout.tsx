import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import FieldCreateLayoutClient from "./FieldCreateLayoutClient";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "New Field",
  title: "App Builder",
  description: "Create a new field component.",
  letter: "Fc", // Field create
});

export default function FieldCreateLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <FieldCreateLayoutClient>{children}</FieldCreateLayoutClient>;
}
