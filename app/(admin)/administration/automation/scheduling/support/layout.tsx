import { createRouteMetadata } from "@/utils/route-metadata";
export const metadata = createRouteMetadata("/administration", { titlePrefix: "Schedule support", title: "Scheduling", letter: "SS" });
export default function SchedulingSupportLayout({ children }: { children: React.ReactNode }) { return children; }
