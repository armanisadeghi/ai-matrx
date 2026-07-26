"use client";

import React from "react";

export default function AppsLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full bg-textured transition-colors">
      <main className="h-full w-full">{children}</main>
    </div>
  );
}
