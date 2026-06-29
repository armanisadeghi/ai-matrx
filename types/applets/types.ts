import type { ReactNode } from "react";

export type AppletCategory = string;

export interface AppletStat {
  id: string;
  label: string;
  value: number | string;
  icon: ReactNode;
}

export interface AppletSection {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  link?: string;
  category?: string;
  count?: number;
  badge?: string;
}

export interface AppletCategoryGroup {
  id: string;
  title: string;
  description?: string;
}

export interface AppletConfig {
  key: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  layout?: string;
  category?: AppletCategory;
  stats?: AppletStat[];
  sections?: AppletSection[];
  categories?: AppletCategoryGroup[];
}

export interface ToolEntityConfig {
  id: string;
  entityKey: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  category?: string;
  count?: number;
  badge?: string;
}
