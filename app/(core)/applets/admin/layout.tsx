import { createRouteMetadata } from "@/utils/route-metadata";

// The Applets admin map names itself so the browser tab reads "Admin | Applets".
export const metadata = createRouteMetadata("/applets", {
  titlePrefix: "Admin",
  title: "Applets",
  letter: "AD",
});

export default function AppletsAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
