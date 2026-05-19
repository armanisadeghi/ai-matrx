// components/matrx/EntityTable/enhanced/actions.tsx

import React from "react";
import {ReactNode} from 'react';
import {EntityKeys, EntityData, AutomationEntity} from '@/types/entityTypes';
import {Edit, Eye, Zap} from "lucide-react";
import MatrxTooltip from '../../MatrxTooltip';
import { Button } from "@/components/ui/button";
import {AppRouterInstance} from "next/dist/shared/lib/app-router-context.shared-runtime";


// Action Context provides rich information to handlers
export interface ActionContext<TEntity extends EntityKeys> {
    entity: {
        key: TEntity;
        schema: AutomationEntity<TEntity>;
        data: EntityData<TEntity>;
    };
    state: {
        loading: boolean;
        disabled: boolean;
        selected: boolean;
        expanded: boolean;
    };
    relationships: {
        loaded: Record<string, boolean>;
        loading: Record<string, boolean>;
        data: Record<string, any[]>;
    };
    ui: {
        modal: {
            open: (config: ModalConfig) => void;
            close: () => void;
        };
        toast: {
            success: (message: string) => void;
            error: (message: string) => void;
            info: (message: string) => void;
        };
        confirm: (config: ConfirmConfig) => Promise<boolean>;
    };
    dispatch: (action: any) => void;
    navigate: (path: string) => void;
}

// Rich configuration for modals
export interface ModalConfig {
    type: 'form' | 'view' | 'custom';
    title: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    component?: React.ComponentType<any>;
    props?: Record<string, any>;
    position?: 'center' | 'right' | 'left' | 'bottom';
    animation?: 'fade' | 'slide' | 'scale';
}

// Confirmation dialog configuration
export interface ConfirmConfig {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'warning' | 'danger' | 'info';
    icon?: ReactNode;
}

// Enhanced action definition
export interface EnhancedActionDefinition<TEntity extends EntityKeys> {
    // Basic properties
    name: string;
    label: string | ((context: ActionContext<TEntity>) => string);
    icon: ReactNode | ((context: ActionContext<TEntity>) => ReactNode);
    className?: string | ((context: ActionContext<TEntity>) => string);

    // Visibility and enablement
    isVisible?: (context: ActionContext<TEntity>) => boolean;
    isEnabled?: (context: ActionContext<TEntity>) => boolean;
    requiredPermissions?: string[];

    // Handler and execution
    handler: (context: ActionContext<TEntity>) => void | Promise<void>;
    onSuccess?: (result: any, context: ActionContext<TEntity>) => void;
    onError?: (error: any, context: ActionContext<TEntity>) => void;

    // UI Configuration
    position?: 'row' | 'toolbar' | 'context' | 'modal';
    group?: string;
    order?: number;
    variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
    size?: 'xs' | 'sm' | 'md' | 'lg';

    // Interaction
    shortcut?: string;
    confirmationRequired?: boolean | ConfirmConfig;
    modal?: ModalConfig;

    // Batching support
    supportsBatching?: boolean;
    batchHandler?: (items: EntityData<TEntity>[], context: ActionContext<TEntity>) => Promise<void>;

    // Workflow integration
    workflow?: {
        preConditions?: Array<(context: ActionContext<TEntity>) => boolean | Promise<boolean>>;
        postActions?: Array<(context: ActionContext<TEntity>) => void | Promise<void>>;
        rollback?: (context: ActionContext<TEntity>) => void | Promise<void>;
    };

    // Custom rendering
    renderButton?: (props: { context: ActionContext<TEntity>; onClick: () => void }) => ReactNode;
    renderIcon?: (props: { context: ActionContext<TEntity> }) => ReactNode;
    renderTooltip?: (props: { context: ActionContext<TEntity> }) => ReactNode;
}

// Action registry for managing actions
export class ActionRegistry<TEntity extends EntityKeys> {
    private actions: Map<string, EnhancedActionDefinition<TEntity>> = new Map();
    private groups: Map<string, Set<string>> = new Map();

    register(action: EnhancedActionDefinition<TEntity>) {
        this.actions.set(action.name, action);
        if (action.group) {
            if (!this.groups.has(action.group)) {
                this.groups.set(action.group, new Set());
            }
            this.groups.get(action.group)!.add(action.name);
        }
    }

    getAction(name: string): EnhancedActionDefinition<TEntity> | undefined {
        return this.actions.get(name);
    }

    getGroupActions(group: string): EnhancedActionDefinition<TEntity>[] {
        const actionNames = this.groups.get(group) || new Set();
        return Array.from(actionNames)
            .map(name => this.actions.get(name)!)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    getAllActions(): EnhancedActionDefinition<TEntity>[] {
        return Array.from(this.actions.values());
    }
}

interface ActionButtonProps<TEntity extends EntityKeys> {
    action: EnhancedActionDefinition<TEntity>;
    context: ActionContext<TEntity>;
    className?: string;
    children?: React.ReactNode;
}

export function ActionButton<TEntity extends EntityKeys>(
    {
        action,
        context,
        className,
        children
    }: ActionButtonProps<TEntity>) {
    const isVisible = action.isVisible?.(context) ?? true;
    const isEnabled = action.isEnabled?.(context) ?? true;

    if (!isVisible) return null;

    const handleClick = async () => {
        if (action.confirmationRequired) {
            const confirmConfig = typeof action.confirmationRequired === 'boolean'
                                  ? {
                    title: `Confirm ${typeof action.label === 'string' ? action.label : ''}`,
                    message: `Are you sure you want to ${typeof action.label === 'string' ? action.label : ''}?`
                }
                                  : action.confirmationRequired;

            const confirmed = await context.ui.confirm(confirmConfig);
            if (!confirmed) return;
        }

        try {
            const result = await action.handler(context);
            action.onSuccess?.(result, context);
        } catch (error) {
            action.onError?.(error, context);
            const errorLabel = typeof action.label === 'string'
                               ? action.label
                               : 'action';
            context.ui.toast.error(`Failed to ${errorLabel}`);
        }
    };

    if (action.renderButton) {
        return action.renderButton({context, onClick: handleClick});
    }

    const actionLabel = typeof action.label === 'function'
                        ? action.label(context)
                        : action.label;

    const actionIcon = typeof action.icon === 'function'
                       ? action.icon(context)
                       : action.icon;

    return (
        <MatrxTooltip
            content={actionLabel}
            placement="left"
        >
            <Button
                onClick={handleClick}
                disabled={!isEnabled}
                size="sm"
                variant="ghost"
                className={`p-1 ${action.className || ""} ${className || ""}`}
            >
                {children || (
                    React.isValidElement(actionIcon)
                    ? React.cloneElement(actionIcon as React.ReactElement<any>, {className: 'w-3 h-3'})
                    : actionIcon
                )}
            </Button>
        </MatrxTooltip>
    );
}


/*
// Example usage
const editAction: EnhancedActionDefinition<'registeredFunction'> = {
    name: 'edit',
    label: 'Edit',
    icon: <Edit className="h-3 w-3"/>,
    position: 'row',
    group: 'crud',
    order: 1,
    requiredPermissions: ['edit:registeredFunction'],

    isEnabled: (context) => !context.state.loading,

    confirmationRequired: {
        title: 'Confirm Edit',
        message: 'Are you sure you want to edit this item?',
        type: 'warning'
    },

    modal: {
        type: 'form',
        title: 'Edit Item',
        size: 'lg',
        position: 'right'
    },

    handler: async (context) => {
        // Implementation
    },

    workflow: {
        preConditions: [
            (context) => !!context.entity.data.id,
            (context) => !context.state.loading
        ],
        postActions: [
            async (context) => {
                context.ui.toast.success('Item updated successfully');
                context.ui.modal.close();
            }
        ]
    }
};
*/

// Navigation and Routing
export interface NavigationConfig {
    type: 'internal' | 'external' | 'modal' | 'sidebar' | 'tab' | 'split';
    target?: string;
    params?: Record<string, string | number>;
    state?: Record<string, any>;
    options?: {
        shallow?: boolean;
        scroll?: boolean;
        prefetch?: boolean;
    };
}

// Relationship Configuration
export interface RelationshipActionConfig<TEntity extends EntityKeys> {
    type: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
    target: EntityKeys;
    display: {
        mode: 'modal' | 'sidebar' | 'page' | 'inline' | 'tab';
        config?: any; // Will be refined when we see the modal system
    };
    operations?: {
        create?: boolean;
        link?: boolean;
        unlink?: boolean;
        delete?: boolean;
    };
    loadStrategy: 'eager' | 'lazy' | 'onDemand';
    cascadeActions?: boolean;
}

// Service Integration
export interface ServiceConfig {
    type: 'ai' | 'api' | 'socket' | 'worker' | 'module';
    service: string;
    method: string;
    params?: Record<string, any>;
    options?: {
        timeout?: number;
        retry?: number;
        fallback?: () => any;
    };
}

// Enhanced context with integration support
export interface EnhancedActionContext<TEntity extends EntityKeys> {
    // Entity and Data
    entity: {
        key: TEntity;
        schema: AutomationEntity<TEntity>;
        data: EntityData<TEntity>;
        relationships: Record<string, any>;
    };

    // Navigation and Routing
    navigation: {
        router: AppRouterInstance;
        navigate: (config: NavigationConfig) => Promise<void>;
        createUrl: (config: NavigationConfig) => string;
    };

    // Service Integration
    services: {
        socket: 'Socket'; // update later
        invokeService: (config: ServiceConfig) => Promise<any>;
        registerServiceHandler: (service: string, handler: (data: any) => void) => void;
    };

    // State Management
    state: {
        loading: boolean;
        selected: boolean;
        expanded: boolean;
        relationships: Record<string, {
            loaded: boolean;
            loading: boolean;
            data: any[];
        }>;
    };

    // Redux Integration
    store: {
        dispatch: (action: any) => void;
        select: <T>(selector: (state: any) => T) => T;
    };
}

// Enhanced action definition with integration support
export interface IntegratedActionDefinition<TEntity extends EntityKeys> {
    name: string;
    label: string | ((context: EnhancedActionContext<TEntity>) => string);
    icon: ReactNode | ((context: EnhancedActionContext<TEntity>) => ReactNode);

    // Core Configuration
    type: 'entity' | 'relationship' | 'service' | 'navigation' | 'composite';
    category?: 'crud' | 'navigation' | 'integration' | 'utility' | 'custom';
    priority?: number;

    // Relationship Handling
    relationship?: RelationshipActionConfig<TEntity>;

    // Service Integration
    service?: ServiceConfig;

    // Navigation
    navigation?: NavigationConfig;

    // Execution
    handler: (context: EnhancedActionContext<TEntity>) => void | Promise<void>;
    preHandlers?: Array<(context: EnhancedActionContext<TEntity>) => boolean | Promise<boolean>>;
    postHandlers?: Array<(context: EnhancedActionContext<TEntity>) => void | Promise<void>>;

    // Client/Server Logic
    clientLogic?: {
        validate?: (context: EnhancedActionContext<TEntity>) => boolean | Promise<boolean>;
        transform?: (data: any) => any;
        cache?: boolean;
    };

    serverLogic?: {
        endpoint?: string;
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
        socket?: {
            event: string;
            responseEvent?: string;
            timeout?: number;
        };
    };

    // UI and Interaction
    display?: {
        position?: 'row' | 'toolbar' | 'context' | 'header';
        group?: string;
        order?: number;
        variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
        size?: 'xs' | 'sm' | 'md' | 'lg';
        showLabel?: boolean;
        className?: string;
    };

    // Permissions and Conditions
    security?: {
        requiredPermissions?: string[];
        validateAccess?: (context: EnhancedActionContext<TEntity>) => boolean | Promise<boolean>;
    };
}

// Example of a relationship action
const viewRelatedItemsAction: IntegratedActionDefinition<'registeredFunction'> = {
    name: 'viewRelatedItems',
    type: 'relationship',
    label: 'View Related Items',
    icon: <Eye/>,

    relationship: {
        type: 'oneToMany',
        target: 'arg',
        display: {
            mode: 'sidebar',
            config: {
                width: '30%',
                position: 'right'
            }
        },
        loadStrategy: 'lazy'
    },

    handler: async (context) => {
        const {entity, navigation} = context;

        // Load relationship data if needed
        if (!context.state.relationships['arg'].loaded) {
            await context.services.invokeService({
                type: 'api',
                service: 'entity',
                method: 'getRelated',
                params: {
                    entity: entity.key,
                    id: entity.data.id,
                    relationship: 'arg'
                }
            });
        }

        // Navigate to the appropriate view
        await navigation.navigate({
            type: 'sidebar',
            target: '/entities/arg',
            params: {
                parentId: entity.data.id,
                parentType: entity.key
            }
        });
    }
};

// Example of a service integration action
const generateAIContentAction: IntegratedActionDefinition<'registeredFunction'> = {
    name: 'generateContent',
    type: 'service',
    label: 'Generate Content',
    icon: <Zap/>,

    service: {
        type: 'ai',
        service: 'textGeneration',
        method: 'generate',
        options: {
            timeout: 30000,
            retry: 3
        }
    },

    clientLogic: {
        validate: (context) => !!context.entity.data.description,
        transform: (data) => ({
            prompt: data.description,
            maxLength: 1000
        })
    },

    handler: async (context) => {
        const result = await context.services.invokeService({
            type: 'socket',
            service: 'ai',
            method: 'generate',
            params: {
                text: context.entity.data.description
            }
        });

        // Update entity with generated content
        await context.store.dispatch({
            type: 'entity/update',
            payload: {
                entityKey: context.entity.key,
                id: context.entity.data.id,
                data: {
                    description: result.content
                }
            }
        });
    }
};
