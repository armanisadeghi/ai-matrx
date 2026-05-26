import { Layout, Zap, Database, Palette, Code, Globe } from "lucide-react";

export const STEPS = [
    { id: 1, title: "Template", icon: <Layout size={18} /> },
    { id: 2, title: "Intelligence", icon: <Zap size={18} /> },
    { id: 3, title: "Data", icon: <Database size={18} /> },
    { id: 4, title: "Customize", icon: <Palette size={18} /> },
    { id: 5, title: "Logic", icon: <Code size={18} /> },
    { id: 6, title: "Deploy", icon: <Globe size={18} /> },
] as const;

export const COLOR_OPTIONS = [
    { id: "red", value: "#ef4444" },
    { id: "orange", value: "#f97316" },
    { id: "amber", value: "#f59e0b" },
    { id: "green", value: "#16a34a" },
    { id: "cyan", value: "#06b6d4" },
    { id: "blue", value: "#3b82f6" },
    { id: "indigo", value: "#6366f1" },
    { id: "purple", value: "#8b5cf6" },
    { id: "pink", value: "#d946ef" },
    { id: "gray", value: "#6b7280" },
] as const;
