import { useThemeMode } from "@/styles/themes/useThemeMode";

export const useMonacoTheme = () => useThemeMode() === "dark";
