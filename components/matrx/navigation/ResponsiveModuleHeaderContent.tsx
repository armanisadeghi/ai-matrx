'use client';

import { useWindowSize } from "@ai-matrx/kit/hooks";
import ModuleHeaderDesktopContent from "./ModuleHeaderDesktopContent";
import ModuleHeaderMobileContent from "./ModuleHeaderMobileContent";
import { ModuleHeaderProps } from "./types";

export default function ResponsiveModuleHeaderContent(props: ModuleHeaderProps) {
    const { width } = useWindowSize();
    
    return width && width < 768
           ? <ModuleHeaderMobileContent {...props} />
           : <ModuleHeaderDesktopContent {...props} />;
}


