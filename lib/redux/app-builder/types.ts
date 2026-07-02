import { AppletContainer, CustomAppConfig, CustomAppletConfig, FieldDefinition , AppletSourceConfig } from "@/types/customAppTypes";
import type { JsonObject } from "@/types/json";

export interface FieldBuilder extends FieldDefinition {
    isPublic?: boolean;
    authenticatedRead?: boolean;
    publicRead?: boolean;
    isDirty?: boolean;
    isLocal?: boolean;
}

export interface ContainerBuilder extends AppletContainer {
    isPublic?: boolean;
    authenticatedRead?: boolean;
    publicRead?: boolean;
    isDirty?: boolean;
    isLocal?: boolean;
}

export interface AppletBuilder extends CustomAppletConfig {
    isPublic?: boolean;
    authenticatedRead?: boolean;
    publicRead?: boolean;
    isDirty?: boolean;
    isLocal?: boolean;
    slugStatus?: 'unchecked' | 'unique' | 'notUnique';
}

export interface AppBuilder extends CustomAppConfig {
    appletIds: string[];
    isPublic?: boolean;
    authenticatedRead?: boolean;
    publicRead?: boolean;
    isDirty?: boolean;
    isLocal?: boolean;
    isTemplated?: boolean;
    templateType?: 'simple' | 'complex';
    slugStatus?: 'unchecked' | 'unique' | 'notUnique';
    appDataContext?: JsonObject;
}

export interface AppsState {
    apps: Record<string, AppBuilder>;
    isLoading: boolean;
    error: string | null;
    activeAppId: string | null;
    newAppId: string | null;
}

// NOTE: unused duplicate of app-runner/types.ts#RuntimeBrokerDefinition — no importer
// in the codebase references this local copy (all consumers import the app-runner one).
export interface RuntimeBrokerDefinition {
    id: string;
    name: string;
    dataType: string;
    defaultValue?: unknown;
  }
  
export interface ContainersState {
    containers: Record<string, ContainerBuilder>;
    isLoading: boolean;
    error: string | null;
    activeContainerId: string | null;
    newContainerId: string | null;
}

export interface FieldsState {
    fields: Record<string, FieldBuilder>;
    isLoading: boolean;
    error: string | null;
    activeFieldId: string | null;
    newFieldId: string | null;
    hasFetched: boolean;
}

export interface AppletsState {
    applets: Record<string, AppletBuilder>;
    isLoading: boolean;
    error: string | null;
    activeAppletId: string | null;
    newAppletId: string | null;
    tempSourceConfigList: AppletSourceConfig[];
}
