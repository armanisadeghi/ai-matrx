import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutTemplate, ChevronDown, ChevronRight, Tag, Check, HelpCircle } from 'lucide-react';
import * as SiIcons from 'lucide-react';
import { redirect } from 'next/navigation';
import type {
    CustomAppletConfig,
    AppletContainer,
    FieldDefinition,
    AppletSourceConfig,
    ComponentProps,
} from "@/types/customAppTypes";

// Type definitions
type AppletConfig = {
    id: string;
    user_id: string;
    public_read: boolean;
    name: string;
    description: string;
    slug: string;
    applet_icon: string;
    applet_submit_text: string | null;
    creator: string;
    primary_color: string;
    accent_color: string;
    layout_type: string;
    containers: Container[];
    data_source_config: AppletSourceConfig | undefined;
    result_component_config: unknown;
    next_step_config: unknown;
    compiled_recipe_id: string;
    subcategory_id: string | null;
    image_url: string;
    app_id: string;
    broker_map: Array<{
        fieldId: string;
        appletId: string;
        brokerId: string;
    }>;
};

type Container = {
    id: string;
    label: string;
    shortLabel: string;
    description: string;
    fields: ContainerField[];
    helpText: string;
    hideDescription: boolean;
};

type ContainerField = {
    id: string;
    label: string;
    component: string;
    description: string;
    placeholder: string;
    helpText: string;
    required: boolean;
    group: string;
    isDirty: boolean;
    disabled: boolean;
    iconName: string;
    defaultValue: string;
    includeOther: boolean;
    componentProps: ComponentProps;
    options?: Array<{
        id: string;
        label: string;
        description?: string;
        helpText?: string;
    }>;
};

// Function to dynamically render Lucide icons
const renderIcon = (iconName: string, size = 20) => {
    // For Lucide icons
    if (iconName in SiIcons) {
        const IconComponent = SiIcons[iconName as keyof typeof SiIcons] as React.ComponentType<{size?: number}>;
        return <IconComponent size={size} />;
    }
    // Default icon if not found
    return <Tag size={size} />;
};

// Component to represent field components
const FieldComponentIcon = ({ component }: { component: string }) => {
    switch (component.toLowerCase()) {
        case "textarea":
            return (
                <div className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">Textarea</div>
            );
        case "select":
            return (
                <div className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">Select</div>
            );
        case "radio":
            return (
                <div className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                    Radio
                </div>
            );
        case "checkbox":
            return (
                <div className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">
                    Checkbox
                </div>
            );
        case "text":
            return <div className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded">Text</div>;
        default:
            return (
                <div className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded">{component}</div>
            );
    }
};

type AppletConfigViewerProps = {
    applet: AppletConfig;
    searchParams: { 
      tab?: string;
      container?: string;
    };
};

function mapFieldDefinitionToContainerField(f: FieldDefinition): ContainerField {
    return {
        id: f.id,
        label: f.label,
        component: f.component,
        description: f.description ?? "",
        placeholder: f.placeholder ?? "",
        helpText: f.helpText ?? "",
        required: f.required,
        group: f.group ?? "",
        isDirty: false,
        disabled: false,
        iconName: f.iconName ?? "",
        defaultValue:
            f.defaultValue === undefined || f.defaultValue === null
                ? ""
                : String(f.defaultValue),
        includeOther: f.includeOther,
        componentProps: f.componentProps,
        options: f.options?.map((o) => ({
            id: o.id,
            label: o.label,
            description: o.description,
            helpText: o.helpText,
        })),
    };
}

function mapAppletContainerToViewerContainer(c: AppletContainer): Container {
    return {
        id: c.id,
        label: c.label,
        shortLabel: c.shortLabel ?? "",
        description: c.description ?? "",
        fields: c.fields.map(mapFieldDefinitionToContainerField),
        helpText: c.helpText ?? "",
        hideDescription: c.hideDescription ?? false,
    };
}

/** Builds the full viewer model from a `CustomAppletConfig` loaded via `fetchAppletBySlug`. */
export function customAppletConfigToAppletViewerConfig(
    c: CustomAppletConfig,
): AppletConfig {
    const containers = (c.containers ?? []).map(mapAppletContainerToViewerContainer);
    const brokerMap = c.brokerMap ?? [];
    return {
        id: c.id,
        user_id: c.userId ?? "",
        public_read: c.publicRead ?? false,
        name: c.name,
        description: c.description ?? "",
        slug: c.slug,
        applet_icon: c.appletIcon ?? "",
        applet_submit_text: c.appletSubmitText ?? null,
        creator: c.creator ?? "",
        primary_color: c.primaryColor ?? "",
        accent_color: c.accentColor ?? "",
        layout_type: c.layoutType ?? "",
        containers,
        data_source_config: c.dataSourceConfig,
        result_component_config: c.resultComponentConfig,
        next_step_config: c.nextStepConfig,
        compiled_recipe_id: c.compiledRecipeId ?? "",
        subcategory_id: c.subcategoryId ?? null,
        image_url: c.imageUrl ?? "",
        app_id: c.appId ?? "",
        broker_map: brokerMap.map((b) => ({
            fieldId: b.fieldId,
            appletId: b.appletId,
            brokerId: b.brokerId,
        })),
    };
}
    
const AppletConfigViewer = ({ applet, searchParams }: AppletConfigViewerProps) => {
    // Get tab from URL query parameter with default to "info"
    const activeTab = searchParams.tab || 'info';
    
    // Get expanded container from URL query parameter
    const expandedContainer = searchParams.container || null;

    // Validate that the tab is one of the allowed values
    if (!['info', 'containers', 'brokers', 'json'].includes(activeTab)) {
        // If invalid tab, redirect to default tab
        redirect(`?tab=info`);
    }

    return (
        <div className="bg-textured rounded-lg shadow overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-border">
                <nav className="flex space-x-2 px-4" aria-label="Tabs">
                    <Link
                        href="?tab=info"
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === "info"
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-white"
                        }`}
                    >
                        Applet Info
                    </Link>
                    <Link
                        href="?tab=containers"
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === "containers"
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-white"
                        }`}
                    >
                        Containers
                    </Link>
                    <Link
                        href="?tab=brokers"
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === "brokers"
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-white"
                        }`}
                    >
                        Broker Map
                    </Link>
                    <Link
                        href="?tab=json"
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === "json"
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-white"
                        }`}
                    >
                        Raw JSON
                    </Link>
                </nav>
            </div>

            {/* Content */}
            <div className="p-4">
                {activeTab === "info" && (
                    <div className="space-y-4">
                        <div className="flex items-start">
                            <div className="flex-shrink-0 mr-4">
                                <div className="relative w-24 h-24 rounded-lg overflow-hidden">
                                    {applet.image_url && <Image src={applet.image_url} alt={applet.name} fill sizes="96px" className="object-cover" />}
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center">
                                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white">{applet.name}</h2>
                                    <div className="ml-2 text-indigo-600 dark:text-indigo-400">{renderIcon(applet.applet_icon)}</div>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Created by {applet.creator}</p>
                                <div className="mt-2">
                                    <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">Description</h3>
                                    <p className="mt-1 text-gray-600 dark:text-gray-300">{applet.description}</p>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">ID</h3>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">{applet.id}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Slug</h3>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">{applet.slug}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Layout Type</h3>
                                <p className="mt-1 text-sm text-gray-900 dark:text-gray-200">{applet.layout_type}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Colors</h3>
                                <div className="flex items-center space-x-2 mt-1">
                                    <div className={`w-4 h-4 rounded-full bg-${applet.primary_color}-500`} title="Primary color"></div>
                                    <span className="text-sm">Primary: {applet.primary_color}</span>
                                    <div className={`w-4 h-4 rounded-full bg-${applet.accent_color}-500`} title="Accent color"></div>
                                    <span className="text-sm">Accent: {applet.accent_color}</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4">
                            <h3 className="text-md font-medium text-gray-700 dark:text-gray-300">Structure Summary</h3>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg">
                                    <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{applet.containers.length}</div>
                                    <div className="text-sm text-indigo-700 dark:text-indigo-300">Containers</div>
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg">
                                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                                        {applet.containers.reduce((acc, container) => acc + container.fields.length, 0)}
                                    </div>
                                    <div className="text-sm text-blue-700 dark:text-blue-300">Fields</div>
                                </div>
                                <div className="bg-purple-50 dark:bg-purple-900/30 p-3 rounded-lg">
                                    <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{applet.broker_map.length}</div>
                                    <div className="text-sm text-purple-700 dark:text-purple-300">Broker Mappings</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "containers" && (
                    <div className="space-y-6">
                        <h2 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                            <span>Containers & Fields</span>
                            <span className="ml-2 text-gray-500 dark:text-gray-400 text-sm font-normal">
                                {applet.containers.length} containers total
                            </span>
                        </h2>
                        {applet.containers.map((container) => (
                            <div key={container.id} className="border rounded-lg overflow-hidden">
                                <Link
                                    href={expandedContainer === container.id 
                                        ? `?tab=containers` 
                                        : `?tab=containers&container=${container.id}`}
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    <div className="flex items-center">
                                        {expandedContainer === container.id 
                                            ? <ChevronDown size={18} className="transition-transform duration-200" />
                                            : <ChevronRight size={18} className="transition-transform duration-200" />
                                        }
                                        <h3 className="ml-2 text-md font-medium text-gray-900 dark:text-white">{container.label}</h3>
                                        <span className="ml-2 px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded-full">
                                            {container.shortLabel}
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-500 dark:text-gray-400">{container.fields.length} fields</div>
                                </Link>

                                {expandedContainer === container.id && (
                                    <div className="border-t border-border p-4 bg-gray-50 dark:bg-gray-800/50">
                                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{container.description}</p>
                                        <div className="space-y-6">
                                            {container.fields.map((field) => (
                                                <div key={field.id} className="border-l-2 border-indigo-400 pl-4 py-2">
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center space-x-2">
                                                            <h4 className="text-sm font-medium text-gray-800 dark:text-white">
                                                                {field.label}
                                                            </h4>
                                                            {field.required && (
                                                                <span className="text-xs bg-red-100 dark:bg-red-900 px-2 py-0.5 rounded text-red-700 dark:text-red-200">
                                                                    Required
                                                                </span>
                                                            )}
                                                        </div>
                                                        <FieldComponentIcon component={field.component} />
                                                    </div>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{field.description}</p>
                                                    {field.helpText && (
                                                        <div className="flex items-start mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded">
                                                            <HelpCircle size={14} className="text-gray-400 mr-2 flex-shrink-0 mt-0.5" />
                                                            <span className="text-gray-600 dark:text-gray-300">{field.helpText}</span>
                                                        </div>
                                                    )}
                                                    {field.placeholder && (
                                                        <div className="mt-2">
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">Placeholder: </span>
                                                            <span className="text-xs italic text-gray-600 dark:text-gray-300">
                                                                "{field.placeholder}"
                                                            </span>
                                                        </div>
                                                    )}
                                                    {field.options && field.options.length > 0 && (
                                                        <div className="mt-2">
                                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                                Options:
                                                            </span>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {field.options.map((option) => (
                                                                    <div
                                                                        key={option.id}
                                                                        className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300 flex items-center"
                                                                        title={option.description || ""}
                                                                    >
                                                                        <Check size={10} className="mr-1 text-green-500" />
                                                                        {option.label}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">ID: {field.id}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === "brokers" && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Broker Mappings</h2>
                        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-100 dark:bg-gray-800">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                            >
                                                Field ID
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                            >
                                                Field Label
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                                            >
                                                Broker ID
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                        {applet.broker_map.map((broker) => {
                                            // Find the field that corresponds to this broker mapping
                                            let fieldLabel = "Unknown Field";
                                            for (const container of applet.containers) {
                                                const field = container.fields.find((f) => f.id === broker.fieldId);
                                                if (field) {
                                                    fieldLabel = field.label;
                                                    break;
                                                }
                                            }
                                            return (
                                                <tr key={broker.fieldId + broker.brokerId}>
                                                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{broker.fieldId}</td>
                                                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium">
                                                        {fieldLabel}
                                                    </td>
                                                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                                        {broker.brokerId}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "json" && (
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                        <pre className="text-xs text-gray-800 dark:text-gray-200 overflow-auto max-h-96">
                            {JSON.stringify(applet, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AppletConfigViewer;