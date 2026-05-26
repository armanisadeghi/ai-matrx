"use client";

import { ReactNode } from "react";

export default function AppsDemoLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="h-full w-full transition-colors">{children}</div>;
}
