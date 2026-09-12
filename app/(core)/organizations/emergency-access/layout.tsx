// app/(core)/organizations/emergency-access/layout.tsx
//
// 🚨 THIS PATH IS LOAD-BEARING. `iam.emergency_door_open` writes
// `/organizations/emergency-access` into every "an emergency request needs your
// approval" notice it sends an organization's owners. Renaming this route
// breaks every notice already sent — the SQL moves first, or not at all.

import { createRouteMetadata } from "@/utils/route-metadata";

// Specific word FIRST: "Emergency Access | Organizations". Every Organizations
// tab otherwise starts with the same word and none can be told apart.
export const metadata = createRouteMetadata("/organizations/emergency-access", {
  titlePrefix: "Emergency Access",
  title: "Organizations",
  description:
    "Requests to read a person's private data, waiting on an organization owner's decision.",
  letter: "EA",
});

export default function EmergencyAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
