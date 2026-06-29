// components/applet/applets/layouts/DashboardLayout.tsx
import { AppletConfig } from "@/types/applets/types";

export function DashboardLayout({ config }: { config: AppletConfig }) {
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold">{config.title}</h1>
      <p>Dashboard layout coming soon...</p>
    </div>
  );
}
