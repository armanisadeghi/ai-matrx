import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

// The page is a Client Component (it reads the query string), so the route's
// metadata boundary lives here.
export const metadata = createRouteMetadata("/drive", {
  title: "Drive",
  description:
    "The short link into a rulebook's driving interview — one thumb, from a lock screen.",
  letter: "Dr",
});

export default function DriveLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
