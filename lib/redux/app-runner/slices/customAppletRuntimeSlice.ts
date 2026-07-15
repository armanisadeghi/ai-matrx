import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  AppletLayoutOption,
  AppletContainer,
  BrokerMapping,
  CustomAppletConfig,
} from "@/types/customAppTypes";

interface CustomAppletRuntimeState {
  applets: Record<string, CustomAppletConfig>;
  activeAppletId: string | null;
  status: "uninitialized" | "loading" | "initialized";
  isDebug: boolean;
  isDemo: boolean;
}

const initialState: CustomAppletRuntimeState = {
  applets: {} as Record<string, CustomAppletConfig>,
  activeAppletId: null,
  status: "uninitialized",
  isDebug: false,
  isDemo: false,
};

const customAppletRuntimeSlice = createSlice({
  name: "customAppletRuntime",
  initialState,
  reducers: {
    setAppletRuntimeConfig: (
      state,
      action: PayloadAction<{
        applets: CustomAppletConfig[];
        activeAppletId: string | null;
      }>,
    ) => {
      state.applets = action.payload.applets.reduce(
        (acc, applet) => {
          acc[applet.id] = applet;
          return acc;
        },
        {} as Record<string, CustomAppletConfig>,
      );
      state.activeAppletId = action.payload.activeAppletId;
      state.status = "initialized";
    },
    setAppletRuntimeLoading: (state) => {
      state.status = "loading";
    },
    resetAppletRuntimeConfig: (state) => {
      state.applets = {};
      state.activeAppletId = null;
      state.status = "uninitialized";
    },
    setActiveAppletId: (state, action: PayloadAction<string>) => {
      state.activeAppletId = action.payload;
    },
  },
});

export const {
  setAppletRuntimeConfig,
  setAppletRuntimeLoading,
  resetAppletRuntimeConfig,
  setActiveAppletId,
} = customAppletRuntimeSlice.actions;

// Selectors
type WithCustomAppletRuntime = { customAppletRuntime: CustomAppletRuntimeState };
const EMPTY_APPLET_CONTAINERS: AppletContainer[] = [];

export const selectAppletRuntimeApplets = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.applets;
export const selectAppletRuntimeStatus = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.status;
export const selectAppletRuntimeIsInitialized = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.status === "initialized";
export const selectAppletRuntimeIsDebug = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.isDebug;
export const selectAppletRuntimeIsDemo = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.isDemo;
export const selectAppletRuntimeActiveAppletId = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.activeAppletId;
export const selectAppletRuntimeActiveApplet = (state: WithCustomAppletRuntime) => {
  const activeId = state.customAppletRuntime.activeAppletId;
  return activeId ? state.customAppletRuntime.applets[activeId] : null;
};

export const selectAppletRuntimeById = (state: WithCustomAppletRuntime, appletId: string) =>
  state.customAppletRuntime.applets[appletId];

// Select applet by slug
export const selectAppletRuntimeBySlug = (state: WithCustomAppletRuntime, slug: string) => {
  const applets = state.customAppletRuntime.applets;
  return (
    (Object.values(applets) as CustomAppletConfig[]).find(
      (applet) => applet.slug === slug,
    ) || null
  );
};

export const selectAppletIdBySlug = (state: WithCustomAppletRuntime, slug: string) => {
  const applet = selectAppletRuntimeBySlug(state, slug);
  return applet?.id || null;
};

export const selectAppletRuntimeName = (state: WithCustomAppletRuntime, appletId: string) =>
  state.customAppletRuntime.applets[appletId]?.name;
export const selectAppletRuntimeDescription = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.description;
export const selectAppletRuntimeSlug = (state: WithCustomAppletRuntime, appletId: string) =>
  state.customAppletRuntime.applets[appletId]?.slug;
export const selectAppletRuntimeAppletIcon = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.appletIcon;
export const selectAppletRuntimeAppletSubmitText = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.appletSubmitText;
export const selectAppletRuntimeCreator = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.creator;
export const selectAppletRuntimePrimaryColor = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.primaryColor;
export const selectAppletRuntimeAccentColor = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.accentColor;
export const selectAppletRuntimeLayoutType = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.layoutType;
export const selectAppletRuntimeContainers = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.containers ?? EMPTY_APPLET_CONTAINERS;
export const selectAppletRuntimeDataSourceConfig = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.dataSourceConfig;
export const selectAppletRuntimeBrokerMap = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.brokerMap;
export const selectAppletRuntimeResultComponentConfig = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.resultComponentConfig;
export const selectAppletRuntimeNextStepConfig = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.nextStepConfig;
export const selectAppletRuntimeCompiledRecipeId = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.compiledRecipeId;
export const selectAppletRuntimeSubcategoryId = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.subcategoryId;
export const selectAppletRuntimeImageUrl = (
  state: WithCustomAppletRuntime,
  appletId: string,
) => state.customAppletRuntime.applets[appletId]?.imageUrl;
export const selectAppletRuntimeAppId = (state: WithCustomAppletRuntime, appletId: string) =>
  state.customAppletRuntime.applets[appletId]?.appId;

export const selectActiveApplet = (state: WithCustomAppletRuntime) =>
  state.customAppletRuntime.activeAppletId
    ? state.customAppletRuntime.applets[
        state.customAppletRuntime.activeAppletId
      ]
    : null;

export const selectActiveAppletName = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.name;
export const selectActiveAppletDescription = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.description;
export const selectActiveAppletSlug = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.slug;
export const selectActiveAppletIcon = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.appletIcon;
export const selectActiveAppletSubmitText = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.appletSubmitText;
export const selectActiveAppletCreator = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.creator;
export const selectActiveAppletPrimaryColor = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.primaryColor;
export const selectActiveAppletAccentColor = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.accentColor;
export const selectActiveAppletLayoutType = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.layoutType;
export const selectActiveAppletContainers = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.containers ?? EMPTY_APPLET_CONTAINERS;
export const selectActiveAppletDataSourceConfig = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.dataSourceConfig;
export const selectActiveAppletBrokerMap = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.brokerMap;
export const selectActiveAppletResultComponentConfig = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.resultComponentConfig;
export const selectActiveAppletNextStepConfig = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.nextStepConfig;
export const selectActiveAppletCompiledRecipeId = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.compiledRecipeId;
export const selectActiveAppletSubcategoryId = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.subcategoryId;
export const selectActiveAppletImageUrl = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.imageUrl;
export const selectActiveAppletAppId = (state: WithCustomAppletRuntime) =>
  selectActiveApplet(state)?.appId;

export default customAppletRuntimeSlice.reducer;
