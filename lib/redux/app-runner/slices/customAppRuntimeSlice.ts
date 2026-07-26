import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { AppLayoutOptions, CustomAppConfig } from "@/types/customAppTypes";

interface CustomAppRuntimeState {
  config: CustomAppConfig | null;
  status: "uninitialized" | "loading" | "initialized";
  isDebug: boolean;
  isDemo: boolean;
}

const initialState: CustomAppRuntimeState = {
  config: null,
  status: "uninitialized",
  isDebug: false,
  isDemo: false,
};

const customAppRuntimeSlice = createSlice({
  name: "customAppRuntime",
  initialState,
  reducers: {
    setAppRuntimeConfig: (state, action: PayloadAction<CustomAppConfig>) => {
      state.config = action.payload;
      state.status = "initialized";
    },
    setAppRuntimeLoading: (state) => {
      state.status = "loading";
    },
    resetAppRuntimeConfig: (state) => {
      state.config = null;
      state.status = "uninitialized";
    },
  },
});

export const {
  setAppRuntimeConfig,
  setAppRuntimeLoading,
  resetAppRuntimeConfig,
} = customAppRuntimeSlice.actions;

// Selectors
type WithCustomAppRuntime = { customAppRuntime: CustomAppRuntimeState };

export const selectAppRuntimeConfig = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config;
export const selectAppRuntimeStatus = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.status;
export const selectAppRuntimeIsInitialized = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.status === "initialized";
export const selectAppRuntimeIsDebug = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.isDebug;
export const selectAppRuntimeIsDemo = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.isDemo;

export const selectAppRuntimeId = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.id;
export const selectAppRuntimeName = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.name;
export const selectAppRuntimeDescription = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.description;
export const selectAppRuntimeSlug = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.slug;
export const selectAppRuntimeMainAppIcon = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.mainAppIcon;
export const selectAppRuntimeMainAppSubmitIcon = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.mainAppSubmitIcon;
export const selectAppRuntimeCreator = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.creator;
export const selectAppRuntimeCoreBackgroundColor = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.primaryColor;
export const selectAppRuntimePrimaryColor = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.primaryColor;
export const selectAppRuntimeAccentColor = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.accentColor;
export const selectAppRuntimeAppletList = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.appletList;
export const selectAppRuntimeExtraButtons = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.extraButtons;
export const selectAppRuntimeLayoutType = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.layoutType;
export const selectAppRuntimeImageUrl = (state: WithCustomAppRuntime) =>
  state.customAppRuntime.config?.imageUrl;

export default customAppRuntimeSlice.reducer;
