"use client";

import React, { ReactNode } from "react";

export default function AppEditLayoutClient({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  return <div className="">{children}</div>;
}
