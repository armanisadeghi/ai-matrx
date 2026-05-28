// DashboardGrid.tsx — Server component for iOS-style app icon grid
// Renders all primary nav items as squircle icons with color-coded backgrounds
// Desktop: larger icons via CSS breakpoint in shell.css

import Link from "next/link";
import ShellIcon from "@/features/shell/components/ShellIcon";
import {
  primaryNavItems,
  iconColorMap,
} from "@/features/shell/constants/nav-data";

export default function DashboardGrid() {
  return (
    <div className="shell-dashboard-grid">
      {primaryNavItems.map((item) => (
        <Link key={item.href} href={item.href} className="shell-app-icon">
          <div
            className={`shell-app-icon-square ${iconColorMap[item.color ?? "slate"] ?? iconColorMap.slate}`}
          >
            <ShellIcon name={item.iconName} size={24} strokeWidth={1.75} />
          </div>
          <span className="shell-app-icon-label">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}
