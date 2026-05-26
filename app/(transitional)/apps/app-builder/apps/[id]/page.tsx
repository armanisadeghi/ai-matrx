"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAppById,
  selectAppLoading,
  selectAppName,
  selectAppDescription,
  selectAppCreator,
  selectAppSlug,
  selectAppImageUrl,
  selectAppPrimaryColor,
  selectAppAccentColor,
  selectAppletIdsForApp,
} from "@/lib/redux/app-builder/selectors/appSelectors";
import { setActiveAppWithFetchThunk } from "@/lib/redux/app-builder/thunks/appBuilderThunks";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Info,
  Database,
  Code,
  Users,
  Layout,
  Palette,
  Lock,
  Activity,
  Book,
  FileText,
} from "lucide-react";
import SmartAppletList from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletList";
import { CustomAppletConfig } from "@/types/customAppTypes";

// Tab Components
import TabLayout from "./components/TabLayout";
import BasicInfoTab from "./components/BasicInfoTab";
import VisualDetailsTab from "./components/VisualDetailsTab";
import AccessTab from "./components/AccessTab";
import JsonConfigTab from "./components/JsonConfigTab";
import AppletsTab from "./components/AppletsTab";
import AppLayoutTab from "./components/AppLayoutTab";
import AppActionsTab from "./components/AppActionsTab";
import AppDataContextTab from "./components/AppDataContextTab";
import AdditionalInfoTab from "./components/AdditionalInfoTab";

export type AppLayoutOptions =
  | "tabbedApplets"
  | "singleDropdown"
  | "multiDropdown"
  | "singleDropdownWithSearch"
  | "icons";

export type KnownMethod =
  | "renderChat"
  | "changeApplet"
  | "renderModal"
  | "renderSampleApplet"
  | "none";

export interface HeaderExtraButtonsConfig {
  label: string;
  icon?: React.ReactNode;
  actionType?: "button" | "link" | "redux" | "none";
  onClick?: () => void;
  route?: string;
  reduxAction?: string;
  knownMethod?: KnownMethod;
}

export type CustomActionButton = {
  label: string;
  icon?: React.ReactNode;
  actionType?: "button" | "link" | "redux" | "none";
  onClick?: () => void;
  route?: string;
  reduxAction?: string;
  knownMethod?: KnownMethod;
};

export type AppletListItemConfig = {
  appletId: string;
  label: string;
  slug: string;
};

export type CustomAppConfig = {
  id?: string;
  name: string;
  description: string;
  slug: string;
  mainAppIcon?: string;
  mainAppSubmitIcon?: string;
  creator?: string;
  primaryColor?: string;
  accentColor?: string;
  appletList?: AppletListItemConfig[];
  extraButtons?: CustomActionButton[];
  layoutType?: AppLayoutOptions;
  appDataContext?: any;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: string;
  isPublic?: boolean;
  authenticatedRead?: boolean;
  publicRead?: boolean;
};

export interface AppBuilder extends CustomAppConfig {
  appletIds: string[];
  isPublic?: boolean;
  authenticatedRead?: boolean;
  publicRead?: boolean;
  isDirty?: boolean;
  isLocal?: boolean;
  isTemplated?: boolean;
  templateType?: "simple" | "complex";
  slugStatus?: "unchecked" | "unique" | "notUnique";
}

export default function AppViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;
  const dispatch = useAppDispatch();
  const router = useRouter();

  // Get app data from Redux
  const app = useAppSelector((state) => selectAppById(state, id));
  const appName = useAppSelector((state) => selectAppName(state, id));
  const appDescription = useAppSelector((state) =>
    selectAppDescription(state, id),
  );
  const appCreator = useAppSelector((state) => selectAppCreator(state, id));
  const appSlug = useAppSelector((state) => selectAppSlug(state, id));
  const appImageUrl = useAppSelector((state) => selectAppImageUrl(state, id));
  const primaryColor = useAppSelector((state) =>
    selectAppPrimaryColor(state, id),
  );
  const accentColor = useAppSelector((state) =>
    selectAppAccentColor(state, id),
  );
  const appletIds = useAppSelector((state) => selectAppletIdsForApp(state, id));
  const isLoading = useAppSelector(selectAppLoading);

  // Set active app when component mounts
  useEffect(() => {
    if (id) {
      dispatch(setActiveAppWithFetchThunk(id));
    }
  }, [id, dispatch]);

  // Handle edit button click
  const handleEdit = () => {
    router.push(`/apps/app-builder/apps/${id}/edit`);
  };

  // Loading state
  if (isLoading || !app) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const tabs = [
    {
      id: "basic-info",
      label: "Overview",
      icon: <Info className="h-4 w-4" />,
      content: <BasicInfoTab appId={id} />,
    },
    {
      id: "visual-details",
      label: "Visuals",
      icon: <Palette className="h-4 w-4" />,
      content: <VisualDetailsTab appId={id} />,
    },
    {
      id: "access",
      label: "Access",
      icon: <Lock className="h-4 w-4" />,
      content: <AccessTab appId={id} />,
    },
    {
      id: "applets",
      label: "Applets",
      icon: <Users className="h-4 w-4" />,
      content: <AppletsTab appId={id} />,
    },
    {
      id: "layout",
      label: "Layout",
      icon: <Layout className="h-4 w-4" />,
      content: <AppLayoutTab appId={id} />,
    },
    {
      id: "actions",
      label: "Actions",
      icon: <Activity className="h-4 w-4" />,
      content: <AppActionsTab appId={id} />,
    },
    {
      id: "data-context",
      label: "Data",
      icon: <Database className="h-4 w-4" />,
      content: <AppDataContextTab appId={id} />,
    },
    {
      id: "additional-info",
      label: "Info",
      icon: <FileText className="h-4 w-4" />,
      content: <AdditionalInfoTab appId={id} />,
    },
    {
      id: "json",
      label: "Config",
      icon: <Code className="h-4 w-4" />,
      content: <JsonConfigTab appId={id} />,
    },
  ];

  return (
    <TabLayout
      title={appName || "Untitled App"}
      subtitle={`ID: ${id}`}
      tabs={tabs}
      id={id}
    />
  );
}
