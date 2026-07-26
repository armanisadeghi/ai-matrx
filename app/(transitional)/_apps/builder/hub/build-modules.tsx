import { AppWindow, Box, Layers, Database, FileText, Settings2, PanelLeft } from "lucide-react";
import { LuComponent } from "react-icons/lu";
import { IoLogoWebComponent } from "react-icons/io5";


export const builderModules = [
    {
        id: "apps",
        title: "Apps",
        description: "Create and manage your applications",
        icon: <AppWindow className="h-8 w-8 text-indigo-500 dark:text-indigo-500" />,
        href: "/apps/builder/modules/app",
    },
    {
        id: "applets",
        title: "Applets",
        description: "Build reusable applet components",
        icon: <Box className="h-8 w-8 text-emerald-500 dark:text-emerald-600" />,
        href: "/apps/builder/modules/applet",
    },
    {
        id: "fields",
        title: "Field Builder",
        description: "Design individual input fields",
        icon: <LuComponent className="h-8 w-8 text-rose-500 dark:text-rose-500" />,
        href: "/apps/builder/modules/field",
    },
    {
        id: "groups",
        title: "Field Containers",
        description: "Create containers for similar fields",
        icon: <IoLogoWebComponent className="h-8 w-8 text-amber-500 dark:text-amber-500" />,
        href: "/apps/builder/modules/group",
    },
    {
        id: "library",
        title: "Component Library",
        description: "Browse, import and export components",
        icon: <Database className="h-8 w-8 text-blue-500 dark:text-blue-400" />,
        href: "/apps/builder/modules/library",
    },
    {
        id: "complete",
        title: "Complete Builder",
        description: "Build a full app in one workflow",
        icon: <Settings2 className="h-8 w-8 text-purple-500 dark:text-purple-500" />,
        href: "/apps/builder",
    },
];
