import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { setActiveApp } from "../appBuilderSyncActions";
import { createAppThunk, updateAppThunk, deleteAppThunk, addAppletThunk, removeAppletThunk, fetchAppsThunk, checkAppSlugUniqueness, FetchAppByIdSuccessAction, saveAppThunk } from "../thunks/appBuilderThunks";
import { AppBuilder, type AppsState } from "../types";
import { v4 as uuidv4 } from "uuid";
import { AppLayoutOptions, CustomActionButton } from "@/types/customAppTypes";

// Helper function to check if an app exists in state
const checkAppExists = (state: AppsState, id: string): boolean => {
    if (!state.apps[id]) {
        console.error(`App with ID ${id} not found in state`);
        return false;
    }
    return true;
};

// Default app configuration
export const DEFAULT_APP: Partial<AppBuilder> = {
    name: "",
    description: "",
    slug: "",
    mainAppIcon: "LayoutTemplate",
    mainAppSubmitIcon: "Search",
    creator: "",
    primaryColor: "gray",
    accentColor: "rose",
    appletList: [],
    extraButtons: [],
    layoutType: "tabbedApplets",
    imageUrl: "",
    imageFileId: "",
    authenticatedRead: true,
    publicRead: false,
    isDirty: false,
    isLocal: true,
    slugStatus: "unchecked",
    appDataContext: {},
};


const initialState: AppsState = {
    apps: {},
    isLoading: false,
    error: null,
    activeAppId: null,
    newAppId: null,
};

export const appBuilderSlice = createSlice({
    name: "appBuilder",
    initialState,
    reducers: {
        // Initialize a new app
        startNewApp: (state, action: PayloadAction<{ 
            id: string; 
            template?: { 
                type: 'simple' | 'complex';
                appName: string;
                description: string;
            } 
        }>) => {
            const id = action.payload.id;
            const template = action.payload.template;

            state.apps[id] = {
                ...DEFAULT_APP,
                id,
                name: template ? template.appName : DEFAULT_APP.name,
                description: template ? template.description : DEFAULT_APP.description,
                // For template apps, we'll set a more complete configuration in the thunk
                isTemplated: !!template,
                templateType: template?.type,
            } as AppBuilder;
            state.newAppId = id;
            state.activeAppId = id;
        },
        // Cancel creation of a local app
        cancelNewApp: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            if (!checkAppExists(state, id)) return;
            
            if (state.apps[id].isLocal) {
                delete state.apps[id];
                if (state.newAppId === id) {
                    state.newAppId = null;
                }
                if (state.activeAppId === id) {
                    state.activeAppId = null;
                }
            }
        },
        // Existing actions - preserve these
        setApp: (state, action: PayloadAction<AppBuilder>) => {
            const id = action.payload.id;
            if (!id) return;
            state.apps[id] = { ...action.payload, isDirty: action.payload.isDirty || true, isLocal: action.payload.isLocal || true, slugStatus: action.payload.slugStatus || 'unchecked' };
        },
        updateApp: (state, action: PayloadAction<{ id: string; changes: Partial<AppBuilder> }>) => {
            const { id, changes } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            const isSlugChanged = changes.slug && changes.slug !== state.apps[id].slug;
            state.apps[id] = { ...state.apps[id], ...changes, isDirty: true, slugStatus: isSlugChanged ? 'unchecked' : state.apps[id].slugStatus };
        },
        deleteApp: (state, action: PayloadAction<string>) => {
            const id = action.payload;
            if (!checkAppExists(state, id)) return;
            
            delete state.apps[id];
            if (state.activeAppId === id) {
                state.activeAppId = null;
            }
            if (state.newAppId === id) {
                state.newAppId = null;
            }
        },
        addApplet: (state, action: PayloadAction<{ appId: string; appletId: string }>) => {
            const { appId, appletId } = action.payload;
            if (!checkAppExists(state, appId)) return;
            
            if (!state.apps[appId].appletIds.includes(appletId)) {
                state.apps[appId].appletIds.push(appletId);
                state.apps[appId].isDirty = true;
            }
        },
        removeApplet: (state, action: PayloadAction<{ appId: string; appletId: string }>) => {
            const { appId, appletId } = action.payload;
            if (!checkAppExists(state, appId)) return;
            
            state.apps[appId].appletIds = state.apps[appId].appletIds.filter((id) => id !== appletId);
            state.apps[appId].isDirty = true;
        },
        
        // Individual property setters - add these 
        setName: (state, action: PayloadAction<{ id: string; name: string }>) => {
            const { id, name } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], name, isDirty: true };
        },
        setDescription: (state, action: PayloadAction<{ id: string; description?: string }>) => {
            const { id, description } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], description: description ?? state.apps[id].description, isDirty: true };
        },
        setSlug: (state, action: PayloadAction<{ id: string; slug: string }>) => {
            const { id, slug } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], slug, isDirty: true, slugStatus: 'unchecked' };
        },
        setMainAppIcon: (state, action: PayloadAction<{ id: string; mainAppIcon?: string }>) => {
            const { id, mainAppIcon } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], mainAppIcon, isDirty: true };
        },
        setMainAppSubmitIcon: (state, action: PayloadAction<{ id: string; mainAppSubmitIcon?: string }>) => {
            const { id, mainAppSubmitIcon } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], mainAppSubmitIcon, isDirty: true };
        },
        setCreator: (state, action: PayloadAction<{ id: string; creator?: string }>) => {
            const { id, creator } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], creator, isDirty: true };
        },
        setPrimaryColor: (state, action: PayloadAction<{ id: string; primaryColor?: string }>) => {
            const { id, primaryColor } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], primaryColor, isDirty: true };
        },
        setAccentColor: (state, action: PayloadAction<{ id: string; accentColor?: string }>) => {
            const { id, accentColor } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], accentColor, isDirty: true };
        },
        setAppletList: (state, action: PayloadAction<{ id: string; appletList?: { appletId: string; label: string; slug: string }[] }>) => {
            const { id, appletList } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], appletList, isDirty: true };
        },
        setExtraButtons: (state, action: PayloadAction<{ id: string; extraButtons?: CustomActionButton[] }>) => {
            const { id, extraButtons } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], extraButtons, isDirty: true };
        },
        setLayoutType: (state, action: PayloadAction<{ id: string; layoutType?: AppLayoutOptions }>) => {
            const { id, layoutType } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], layoutType, isDirty: true };
        },
        setImageUrl: (state, action: PayloadAction<{ id: string; imageUrl?: string; imageFileId?: string }>) => {
            const { id, imageUrl, imageFileId } = action.payload;
            if (!checkAppExists(state, id)) return;

            state.apps[id] = { ...state.apps[id], imageUrl, imageFileId: imageFileId ?? "", isDirty: true };
        },
        setIsPublic: (state, action: PayloadAction<{ id: string; isPublic?: boolean }>) => {
            const { id, isPublic } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], isPublic, isDirty: true };
        },
        setAuthenticatedRead: (state, action: PayloadAction<{ id: string; authenticatedRead?: boolean }>) => {
            const { id, authenticatedRead } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], authenticatedRead, isDirty: true };
        },
        setPublicRead: (state, action: PayloadAction<{ id: string; publicRead?: boolean }>) => {
            const { id, publicRead } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], publicRead, isDirty: true };
        },
        setIsDirty: (state, action: PayloadAction<{ id: string; isDirty?: boolean }>) => {
            const { id, isDirty } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], isDirty };
        },
        setIsLocal: (state, action: PayloadAction<{ id: string; isLocal?: boolean }>) => {
            const { id, isLocal } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], isLocal };
        },
        setSlugStatus: (state, action: PayloadAction<{ id: string; slugStatus: 'unchecked' | 'unique' | 'notUnique' }>) => {
            const { id, slugStatus } = action.payload;
            if (!checkAppExists(state, id)) return;
            
            state.apps[id] = { ...state.apps[id], slugStatus, isDirty: true };
        },
        
        // Keep the existing actions
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.isLoading = action.payload;
        },
        setError: (state, action: PayloadAction<string | null>) => {
            state.error = action.payload;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setActiveApp, (state, action) => {
            const id = action.payload;
            if (id !== null && !state.apps[id]) {
                console.error(`App with ID ${id} not found in state`);
            }
            state.activeAppId = id;
        });

        // Create App
        builder.addCase(createAppThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(createAppThunk.fulfilled, (state, action) => {
            const id = action.payload.id;
            if (!id) {
                state.isLoading = false;
                return;
            }
            state.apps[id] = { ...action.payload, isDirty: false, isLocal: false, slugStatus: 'unique' };
            if (state.newAppId) {
                delete state.apps[state.newAppId];
                state.newAppId = null;
            }
            state.activeAppId = id;
            state.isLoading = false;
        });
        builder.addCase(createAppThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to create app";
        });

        // Update App
        builder.addCase(updateAppThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(updateAppThunk.fulfilled, (state, action) => {
            const id = action.payload.id;
            if (id) {
                state.apps[id] = { ...action.payload, isDirty: false, isLocal: false, slugStatus: 'unique' };
            }
            state.isLoading = false;
        });
        builder.addCase(updateAppThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to update app";
        });

        // Save App (unified thunk for create/update)
        builder.addCase(saveAppThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(saveAppThunk.fulfilled, (state, action) => {
            const app = action.payload;
            const id = app.id;
            if (!id) {
                state.isLoading = false;
                return;
            }
            state.apps[id] = { ...app, isDirty: false, isLocal: false, slugStatus: 'unique' };
            if (state.newAppId && id !== state.newAppId) {
                delete state.apps[state.newAppId];
                state.newAppId = null;
            }
            state.activeAppId = id;
            state.isLoading = false;
        });
        builder.addCase(saveAppThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to save app";
        });

        // Delete App
        builder.addCase(deleteAppThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(deleteAppThunk.fulfilled, (state, action) => {
            delete state.apps[action.meta.arg];
            if (state.activeAppId === action.meta.arg) {
                state.activeAppId = null;
            }
            state.isLoading = false;
        });
        builder.addCase(deleteAppThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to delete app";
        });

        // Add Applet
        builder.addCase(addAppletThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(addAppletThunk.fulfilled, (state, action) => {
            const { appId, appletId } = action.meta.arg;
            if (state.apps[appId] && !state.apps[appId].appletIds.includes(appletId)) {
                state.apps[appId].appletIds.push(appletId);
            }
            state.isLoading = false;
        });
        builder.addCase(addAppletThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to add applet";
        });

        // Remove Applet
        builder.addCase(removeAppletThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(removeAppletThunk.fulfilled, (state, action) => {
            const { appId, appletId } = action.meta.arg;
            if (state.apps[appId]) {
                state.apps[appId].appletIds = state.apps[appId].appletIds.filter((id) => id !== appletId);
            }
            state.isLoading = false;
        });
        builder.addCase(removeAppletThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to remove applet";
        });

        // Check Slug Uniqueness
        builder.addCase(checkAppSlugUniqueness.pending, (state) => {
            state.error = null;
        });
        builder.addCase(checkAppSlugUniqueness.fulfilled, (state, action) => {
            const { slug, appId } = action.meta.arg;
            if (appId && state.apps[appId]) {
                state.apps[appId].slugStatus = action.payload ? 'unique' : 'notUnique';
            } else {
                Object.values(state.apps).forEach(app => {
                    if (app.slug === slug) {
                        app.slugStatus = action.payload ? 'unique' : 'notUnique';
                    }
                });
            }
        });
        builder.addCase(checkAppSlugUniqueness.rejected, (state, action) => {
            state.error = action.error.message || "Failed to check slug uniqueness";
        });

        // Fetch Apps
        builder.addCase(fetchAppsThunk.pending, (state) => {
            state.isLoading = true;
            state.error = null;
        });
        builder.addCase(fetchAppsThunk.fulfilled, (state, action) => {
            // Create a new apps object that explicitly sets isLocal=false for fetched apps
            const newApps = action.payload.reduce((acc, app) => {
                const id = app.id;
                if (id) {
                    acc[id] = {
                        ...app,
                        isDirty: false,
                        isLocal: false,
                        slugStatus: 'unique'
                    };
                }
                return acc;
            }, {} as Record<string, AppBuilder>);
            
            // Preserve any local apps in the current state
            Object.entries(state.apps).forEach(([id, app]) => {
                if (app.isLocal) {
                    newApps[id] = app;
                }
            });
            
            state.apps = newApps;
            state.isLoading = false;
        });
        builder.addCase(fetchAppsThunk.rejected, (state, action) => {
            state.isLoading = false;
            state.error = action.error.message || "Failed to fetch apps";
        });

        // Handle fetchAppByIdSuccess (used by setActiveAppWithFetchThunk)
        builder.addCase("appBuilder/fetchAppByIdSuccess", (state, action: FetchAppByIdSuccessAction) => {
            const { id } = action.payload;
            if (!id) {
                console.error("fetchAppByIdSuccess: payload is missing id", action.payload);
                return;
            }
            state.apps[id] = {
                ...action.payload,
                isDirty: false,
                isLocal: false,
                slugStatus: 'unique'
            };
            state.activeAppId = id;
            state.isLoading = false;
        });
    },
});

export const {
    // Existing actions
    setApp, 
    updateApp, 
    deleteApp, 
    addApplet, 
    removeApplet, 
    setLoading, 
    setError,
    
    // New slice-style actions
    startNewApp,
    cancelNewApp,
    setName,
    setDescription,
    setSlug,
    setMainAppIcon,
    setMainAppSubmitIcon,
    setCreator,
    setPrimaryColor,
    setAccentColor,
    setAppletList,
    setExtraButtons,
    setLayoutType,
    setImageUrl,
    setIsPublic,
    setAuthenticatedRead,
    setPublicRead,
    setIsDirty,
    setIsLocal,
    setSlugStatus,
} = appBuilderSlice.actions;

export { setActiveApp } from "../appBuilderSyncActions";

export default appBuilderSlice.reducer;