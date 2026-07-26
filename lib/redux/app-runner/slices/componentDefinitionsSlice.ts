import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { FieldDefinition, AppletContainer, CustomAppletConfig, CustomAppConfig } from "@/types/customAppTypes";
import { ComponentToBrokerMapping } from "../types";

interface ComponentDefinitionsState {
    appConfigs: Record<string, CustomAppConfig>; // Store multiple app configs by ID
    definitions: Record<string, Record<string, FieldDefinition>>; // appId -> definitions
    instances: Record<string, Record<string, FieldDefinition>>; // appId -> instances
    containers: Record<string, Record<string, AppletContainer>>; // appId -> containers
    applets: Record<string, Record<string, CustomAppletConfig>>; // appId -> applets
    componentToBrokerMap: Record<string, ComponentToBrokerMapping[]>; // appId -> mappings
    isLoading: boolean;
    error: string | null;
}

const initialComponentDefinitionsState: ComponentDefinitionsState = {
    appConfigs: {},
    definitions: {},
    instances: {},
    containers: {},
    applets: {},
    componentToBrokerMap: {},
    isLoading: false,
    error: null,
};

export const componentDefinitionsSlice = createSlice({
    name: "componentDefinitions",
    initialState: initialComponentDefinitionsState,
    reducers: {
        // App config management
        setAppConfig: (state, action: PayloadAction<{ appId: string; config: CustomAppConfig }>) => {
            state.appConfigs[action.payload.appId] = action.payload.config;
        },
        clearAppConfig: (state, action: PayloadAction<string>) => {
            delete state.appConfigs[action.payload];
            delete state.definitions[action.payload];
            delete state.instances[action.payload];
            delete state.containers[action.payload];
            delete state.applets[action.payload];
            delete state.componentToBrokerMap[action.payload];
        },

        // Component definitions management
        setDefinitions: (
            state,
            action: PayloadAction<{ appId: string; definitions: Record<string, FieldDefinition> }>
        ) => {
            state.definitions[action.payload.appId] = action.payload.definitions;
        },
        addDefinition: (state, action: PayloadAction<{ appId: string; definition: FieldDefinition }>) => {
            if (!state.definitions[action.payload.appId]) {
                state.definitions[action.payload.appId] = {};
            }
            state.definitions[action.payload.appId][action.payload.definition.id] = action.payload.definition;
        },
        updateDefinition: (
            state,
            action: PayloadAction<{
                appId: string;
                id: string;
                changes: Partial<FieldDefinition>;
            }>
        ) => {
            const { appId, id, changes } = action.payload;
            if (state.definitions[appId]?.[id]) {
                state.definitions[appId][id] = { ...state.definitions[appId][id], ...changes };
            }
        },
        removeDefinition: (state, action: PayloadAction<{ appId: string; id: string }>) => {
            if (state.definitions[action.payload.appId]) {
                delete state.definitions[action.payload.appId][action.payload.id];
            }
        },

        // Component instances management
        createComponentInstance: (
            state,
            action: PayloadAction<{
                appId: string;
                definitionId: string;
                instanceId: string;
                overrides?: Partial<FieldDefinition>;
            }>
        ) => {
            const { appId, definitionId, instanceId, overrides } = action.payload;
            if (!state.instances[appId]) {
                state.instances[appId] = {};
            }
            const baseDefinition = state.definitions[appId]?.[definitionId];
            if (baseDefinition) {
                state.instances[appId][instanceId] = {
                    ...baseDefinition,
                    id: instanceId,
                    ...overrides,
                };
            }
        },
        updateComponentInstance: (
            state,
            action: PayloadAction<{
                appId: string;
                instanceId: string;
                changes: Partial<FieldDefinition>;
            }>
        ) => {
            const { appId, instanceId, changes } = action.payload;
            if (state.instances[appId]?.[instanceId]) {
                state.instances[appId][instanceId] = {
                    ...state.instances[appId][instanceId],
                    ...changes,
                };
            }
        },
        removeComponentInstance: (state, action: PayloadAction<{ appId: string; instanceId: string }>) => {
            if (state.instances[action.payload.appId]) {
                delete state.instances[action.payload.appId][action.payload.instanceId];
            }
        },

        // Container management
        setContainers: (
            state,
            action: PayloadAction<{ appId: string; containers: Record<string, AppletContainer> }>
        ) => {
            state.containers[action.payload.appId] = action.payload.containers;
        },
        addContainer: (state, action: PayloadAction<{ appId: string; container: AppletContainer }>) => {
            if (!state.containers[action.payload.appId]) {
                state.containers[action.payload.appId] = {};
            }
            state.containers[action.payload.appId][action.payload.container.id] = action.payload.container;
        },
        updateContainer: (
            state,
            action: PayloadAction<{
                appId: string;
                id: string;
                changes: Partial<AppletContainer>;
            }>
        ) => {
            const { appId, id, changes } = action.payload;
            if (state.containers[appId]?.[id]) {
                state.containers[appId][id] = { ...state.containers[appId][id], ...changes };
            }
        },
        removeContainer: (state, action: PayloadAction<{ appId: string; id: string }>) => {
            if (state.containers[action.payload.appId]) {
                delete state.containers[action.payload.appId][action.payload.id];
            }
        },

        // Applet management
        setApplets: (
            state,
            action: PayloadAction<{ appId: string; applets: Record<string, CustomAppletConfig> }>
        ) => {
            state.applets[action.payload.appId] = action.payload.applets;
        },
        addApplet: (state, action: PayloadAction<{ appId: string; applet: CustomAppletConfig }>) => {
            if (!state.applets[action.payload.appId]) {
                state.applets[action.payload.appId] = {};
            }
            if (action.payload.applet.id) {
                state.applets[action.payload.appId][action.payload.applet.id] = action.payload.applet;
            }
        },
        updateApplet: (
            state,
            action: PayloadAction<{
                appId: string;
                id: string;
                changes: Partial<CustomAppletConfig>;
            }>
        ) => {
            const { appId, id, changes } = action.payload;
            if (state.applets[appId]?.[id]) {
                state.applets[appId][id] = { ...state.applets[appId][id], ...changes };
            }
        },
        removeApplet: (state, action: PayloadAction<{ appId: string; id: string }>) => {
            if (state.applets[action.payload.appId]) {
                delete state.applets[action.payload.appId][action.payload.id];
            }
        },

        // Component to Broker mapping
        mapComponentToBroker: (
            state,
            action: PayloadAction<{ appId: string; mapping: ComponentToBrokerMapping }>
        ) => {
            if (!state.componentToBrokerMap[action.payload.appId]) {
                state.componentToBrokerMap[action.payload.appId] = [];
            }
            state.componentToBrokerMap[action.payload.appId] = state.componentToBrokerMap[
                action.payload.appId
            ].filter((mapping) => mapping.instanceId !== action.payload.mapping.instanceId);
            state.componentToBrokerMap[action.payload.appId].push(action.payload.mapping);
        },
        unmapComponentFromBroker: (state, action: PayloadAction<{ appId: string; instanceId: string }>) => {
            if (state.componentToBrokerMap[action.payload.appId]) {
                state.componentToBrokerMap[action.payload.appId] = state.componentToBrokerMap[
                    action.payload.appId
                ].filter((mapping) => mapping.instanceId !== action.payload.instanceId);
            }
        },

        // Loading states
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.isLoading = action.payload;
        },
        setError: (state, action: PayloadAction<string | null>) => {
            state.error = action.payload;
        },
    },
});

export const {
    setAppConfig,
    clearAppConfig,
    setDefinitions,
    addDefinition,
    updateDefinition,
    removeDefinition,
    createComponentInstance,
    updateComponentInstance,
    removeComponentInstance,
    setContainers,
    addContainer,
    updateContainer,
    removeContainer,
    setApplets,
    addApplet,
    updateApplet,
    removeApplet,
    mapComponentToBroker,
    unmapComponentFromBroker,
    setLoading,
    setError,
} = componentDefinitionsSlice.actions;

export default componentDefinitionsSlice.reducer;