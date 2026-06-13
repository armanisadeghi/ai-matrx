import React from "react";
import { PanelTopOpen } from "lucide-react";
import IconSelect from "@/components/official/IconSelect";
import { ModulePage } from "./types";

interface NavigationSelectIconProps {
  currentPage?: ModulePage;
  pages: ModulePage[];
  getFullPath: (page: ModulePage) => string;
  handleNavigation: (path: string) => void;
}

const NavigationSelectIcon = ({
  currentPage,
  pages,
  getFullPath,
  handleNavigation,
}: NavigationSelectIconProps) => {
  const navigationItems = pages.map((page, index) => ({
    id: `${getFullPath(page)}-${index}`,
    label: page.title,
    value: getFullPath(page),
  }));

  return (
    <IconSelect
      items={navigationItems}
      icon={<PanelTopOpen className="h-5 w-5 opacity-70" />}
      value={currentPage ? getFullPath(currentPage) : undefined}
      onValueChange={handleNavigation}
      searchable
      searchPlaceholder="Search routes..."
    />
  );
};

export default NavigationSelectIcon;
