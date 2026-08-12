import {
    BarChart3,
    FileText,
    Globe,
    LayoutTemplate,
    Lightbulb,
    ListTree,
    PenLine,
    RefreshCw,
    ScanSearch,
    Search,
    SearchCheck,
    Send,
    Workflow,
    type LucideIcon,
} from "lucide-react";

/**
 * Lucide name -> component. `loop-map.ts` stays React-free (it is pure data
 * shared with the admin canvas), so it carries the icon NAME and this module
 * resolves it. An unknown name falls back to Workflow rather than crashing a
 * marketing page.
 */
const STAGE_ICONS: Record<string, LucideIcon> = {
    BarChart3,
    FileText,
    Globe,
    LayoutTemplate,
    Lightbulb,
    ListTree,
    PenLine,
    RefreshCw,
    ScanSearch,
    Search,
    SearchCheck,
    Send,
};

export function stageIcon(name: string): LucideIcon {
    return STAGE_ICONS[name] ?? Workflow;
}
