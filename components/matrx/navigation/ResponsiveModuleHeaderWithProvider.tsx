"use client";

import { useWindowSize } from "@/hooks/usehooks";
import ModuleHeaderDesktop from "./ModuleHeaderDesktop";
import ModuleHeaderMobile from "./ModuleHeaderMobile";
import { ModuleHeaderProps } from "./types";

export default function ResponsiveModuleHeaderWithProvider(
  props: ModuleHeaderProps,
) {
  const { width } = useWindowSize();

  return (width ?? 1024) < 768 ? (
    <ModuleHeaderMobile {...props} />
  ) : (
    <ModuleHeaderDesktop {...props} />
  );
}
