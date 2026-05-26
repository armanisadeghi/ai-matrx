import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/admin", {
  titlePrefix: "Socket.IO",
  title: "Admin",
  description:
    "Socket.IO admin tools, connection tests, and realtime debugging",
  letter: "Sj",
});

export default function StyledLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="w-full h-full bg-textured text-gray-900 dark:text-gray-200">
      {children}

      <div className="h-screen bg-inherit" aria-hidden="true" />
    </div>
  );
}
