import React from "react";
import { Label } from "@/components/ui/label";
import { FancyInput } from "@/components/ui/input";
import { FancyTextarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Plus, Trash, Upload } from "lucide-react";
import { formatLabel, formatPlaceholder } from "../utils/label-util";
import { SchemaField } from "@/constants/socket-constants";
import ArrayField from "./ArrayField";
import { File, Files } from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { cn } from "@/lib/utils"; // Assuming you have a cn utility for classnames

export type FieldType =
    | "input"
    | "textarea"
    | "switch"
    | "checkbox"
    | "slider"
    | "select"
    | "radiogroup"
    | "fileupload"
    | "multifileupload"
    | "jsoneditor";
    
export interface FieldOverride {
    type: FieldType;
    props?: Record<string, any>;
}
export type FieldOverrides = Record<string, FieldOverride>;

// Define valid component types (now all lowercase for case-insensitive comparison)
const VALID_COMPONENTS = [
    "input",
    "textarea",
    "switch",
    "checkbox",
    "slider",
    "select",
    "radiogroup",
    "fileupload",
    "multifileupload",
    "jsoneditor",
];

interface FormFieldProps {
    fieldKey: string;
    field: SchemaField;
    path: string;
    value: any;
    errors: { [key: string]: boolean };
    notices: { [key: string]: string };
    formData: any;
    onChange: (key: string, value: any) => void;
    onBlur: (key: string, field: SchemaField, value: any) => void;
    onDeleteArrayItem?: (key: string, index: number) => void;
    fieldOverrides?: FieldOverrides;
    testMode?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({
    fieldKey,
    field,
    path = "",
    value,
    errors,
    notices,
    formData,
    onChange,
    onBlur,
    onDeleteArrayItem,
    fieldOverrides = {},
    testMode = false,
}) => {
    const fullPath = path ? `${path}.${fieldKey}` : fieldKey;
    const hasError = errors[fullPath];
    const notice = notices[fullPath] || "";

    // If in testMode and TEST_VALUE is defined, use that instead
    React.useEffect(() => {
        if (testMode && field.TEST_VALUE !== undefined && value !== field.TEST_VALUE) {
            // Use a microtask to ensure this is outside the current render cycle
            Promise.resolve().then(() => {
                onChange(fullPath, field.TEST_VALUE);
            });
        }
    }, [testMode, field.TEST_VALUE, fullPath, onChange, value]);

    const getFieldOverride = (path: string): FieldOverride | undefined => {
        return fieldOverrides[path];
    };

    // Determine component type based on field.COMPONENT or fallback to override
    const getComponentType = (): FieldType => {
        if (field.COMPONENT) {
            // Convert to lowercase for case-insensitive comparison
            const componentLower = field.COMPONENT.toLowerCase();
            if (VALID_COMPONENTS.includes(componentLower)) {
                return componentLower as FieldType;
            } else {
                console.warn(`Component type "${field.COMPONENT}" is not supported. Falling back to default.`);
            }
        }

        const override = getFieldOverride(fullPath);
        if (override?.type) {
            return override.type;
        }

        // Default logic based on data type
        if (field.DATA_TYPE === "boolean" || (field.DATA_TYPE === null && typeof field.DEFAULT === "boolean")) {
            return "switch";
        }

        if (field.DATA_TYPE === "object") {
            return "jsoneditor";
        }

        return "input";
    };

    // Get component props from field.COMPONENT_PROPS or fallback to override
    const getComponentProps = () => {
        const props: Record<string, any> = {};
        const override = getFieldOverride(fullPath);

        // Apply override props first (lower priority)
        if (override?.props) {
            Object.assign(props, override.props);
        }

        // Apply COMPONENT_PROPS (higher priority)
        if (field.COMPONENT_PROPS) {
            for (const [key, value] of Object.entries(field.COMPONENT_PROPS)) {
                if (key === "className" && props.className) {
                    // Use cn utility to merge classNames
                    props.className = cn(props.className, value as string);
                } else {
                    props[key] = value;
                }
            }
        }

        return props;
    };

    // Handle arrays - keep existing logic
    if (field.DATA_TYPE === "array") {
        if (!Array.isArray(value) || value.length === 0) {
            value = field.DEFAULT && Array.isArray(field.DEFAULT) && field.DEFAULT.length > 0 ? field.DEFAULT : field.REFERENCE ? [{}] : [];
        }

        // Special case for MultiFileUpload component
        const componentType = getComponentType();
        if (componentType === "multifileupload") {
            // Use ICON_NAME with fallback to deprecated iconName
            const iconName = field.ICON_NAME || field.iconName || "Files";
            const Icon = (props: any) => <DynamicIcon name={iconName} fallbackIcon="Files" {...props} />;
            const placeholder = field.DESCRIPTION || formatPlaceholder(fieldKey);
            const componentProps = getComponentProps();

            return (
                <div className="grid grid-cols-12 gap-4 mb-4">
                    <Label className="col-span-1 text-sm font-medium">
                        <div className="flex items-start gap-1">
                            <span className="text-slate-700 dark:text-slate-300">{formatLabel(fieldKey)}</span>
                            {field.REQUIRED && <span className="text-red-500 text-sm leading-none">*</span>}
                        </div>
                    </Label>
                    <div className="col-span-11">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center">
                                <Icon className="w-4 h-4 mr-2 text-slate-500" />
                                <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {Array.isArray(value) && value.length > 0 ? (
                                    <div className="space-y-2">
                                        {value.map((file, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded border-border"
                                            >
                                                <span className="text-sm truncate">
                                                    {typeof file === "string" ? file : file.name || `File ${index + 1}`}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        const newFiles = [...value];
                                                        newFiles.splice(index, 1);
                                                        onChange(fullPath, newFiles);
                                                    }}
                                                >
                                                    <Trash className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500 dark:text-gray-400 italic">No files uploaded</div>
                                )}
                                <Button
                                    variant="outline"
                                    className="flex items-center gap-2 mt-2"
                                    onClick={() => {
                                        // This would typically open a file dialog
                                        // For now, let's just add a placeholder file
                                        const newFiles = [...(Array.isArray(value) ? value : []), `file-${Date.now()}.txt`];
                                        onChange(fullPath, newFiles);
                                    }}
                                    {...componentProps}
                                >
                                    <Upload className="w-4 h-4" />
                                    Upload Files
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (!field.REFERENCE) {
            return (
                <ArrayField
                    fieldKey={fieldKey}
                    field={field}
                    fullPath={fullPath}
                    value={value}
                    hasError={hasError}
                    onChange={onChange}
                    onBlur={onBlur}
                />
            );
        }
        return (
            <div className="w-full">
                <div className="grid grid-cols-12 gap-2 mb-2">
                    <div className="col-span-1 text-slate-700 dark:text-slate-300 font-medium">{formatLabel(fieldKey)}</div>
                    <div className="col-span-11">
                        <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
                            {value.map((item: any, index: number) => (
                                <div key={`${fullPath}[${index}]`} className="relative">
                                    {Object.entries(field.REFERENCE).map(([nestedKey, nestedField]) => (
                                        <FormField
                                            key={`${fullPath}[${index}].${nestedKey}`}
                                            fieldKey={nestedKey}
                                            field={nestedField as SchemaField}
                                            path={`${fullPath}[${index}]`}
                                            value={item?.[nestedKey] ?? (nestedField as SchemaField).DEFAULT}
                                            errors={errors}
                                            notices={notices}
                                            formData={formData}
                                            onChange={onChange}
                                            onBlur={onBlur}
                                            onDeleteArrayItem={onDeleteArrayItem}
                                            fieldOverrides={fieldOverrides}
                                            testMode={testMode}
                                        />
                                    ))}
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="absolute right-0 top-0 mt-2 mr-2"
                                        onClick={() => {
                                            onDeleteArrayItem?.(fullPath, index);
                                        }}
                                    >
                                        <Trash className="w-5 h-5 p-0" />
                                    </Button>
                                    {index < value.length - 1 && <hr className="my-4 border-slate-300 dark:border-slate-600" />}
                                </div>
                            ))}
                            <Button
                                onClick={() => {
                                    const newArray = [...value, {}];
                                    onChange(fullPath, newArray);
                                }}
                                variant="outline"
                                className="border-gray-500 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <Plus className="w-5 h-5 mr-1" />
                                {formatLabel(fieldKey)} Entry
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Handle object/reference fields - keep existing logic
    if (field.REFERENCE) {
        if (typeof value !== "object" || value === null) value = field.DEFAULT || {};
        return (
            <div className="w-full mb-4">
                <div className="grid grid-cols-12 gap-4 mb-2">
                    <div className="col-span-1 text-slate-700 dark:text-slate-300 font-medium">{formatLabel(fieldKey)}</div>
                    <div className="col-span-11">
                        <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
                            {Object.entries(field.REFERENCE).map(([nestedKey, nestedField]) => (
                                <FormField
                                    key={`${fullPath}.${nestedKey}`}
                                    fieldKey={nestedKey}
                                    field={nestedField as SchemaField}
                                    path={fullPath}
                                    value={value?.[nestedKey] ?? (nestedField as SchemaField).DEFAULT}
                                    errors={errors}
                                    notices={notices}
                                    formData={formData}
                                    onChange={onChange}
                                    onBlur={onBlur}
                                    onDeleteArrayItem={onDeleteArrayItem}
                                    fieldOverrides={fieldOverrides}
                                    testMode={testMode}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const labelContent = (
        <div className="flex items-start gap-1">
            <span className="text-slate-700 dark:text-slate-300">{formatLabel(fieldKey)}</span>
            {field.REQUIRED && <span className="text-red-500 text-sm leading-none">*</span>}
        </div>
    );

    // Use ICON_NAME with fallback to deprecated iconName
    const iconName = field.ICON_NAME || field.iconName || "File";
    const Icon = (props: any) => <DynamicIcon name={iconName} fallbackIcon="File" {...props} />;
    const placeholder = field.DESCRIPTION || formatPlaceholder(fieldKey);

    // Get component type and props
    const componentType = getComponentType();
    const componentProps = getComponentProps();

    const inputField = () => {
        switch (componentType) {
            case "switch":
                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={!!value}
                                onCheckedChange={(checked) => {
                                    onChange(fullPath, checked);
                                }}
                                onBlur={() => onBlur(fullPath, field, value)}
                                {...componentProps}
                            />
                            <Icon className="w-4 h-4 mr-2 text-slate-500" />
                            <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                        </div>
                    </div>
                );

            case "checkbox":
                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={!!value}
                                onCheckedChange={(checked) => {
                                    onChange(fullPath, checked);
                                }}
                                onBlur={() => onBlur(fullPath, field, value)}
                                {...componentProps}
                            />
                            <Icon className="w-4 h-4 mr-2 text-slate-500" />
                            <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                        </div>
                    </div>
                );

            case "slider":
                // Ensure value is a number (not an array)
                const sliderValue =
                    typeof value === "number"
                        ? value
                        : field.DEFAULT !== undefined
                        ? typeof field.DEFAULT === "number"
                            ? field.DEFAULT
                            : 0
                        : 0;

                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <Icon className="w-4 h-4 mr-2 text-slate-500" />
                                <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{sliderValue}</span>
                        </div>
                        <Slider
                            value={[sliderValue]} // Wrap in array as the component expects
                            onValueChange={(val) => {
                                // Extract the first value from the array
                                onChange(fullPath, val[0]);
                            }}
                            onValueCommit={(val) => onBlur(fullPath, field, val[0])}
                            min={componentProps.min || 0}
                            max={componentProps.max || 100}
                            step={componentProps.step || 1}
                            className={cn("w-full", componentProps.className || "")}
                            {...Object.fromEntries(
                                Object.entries(componentProps).filter(
                                    ([key]) => !["className", "min", "max", "step", "range"].includes(key)
                                )
                            )}
                        />
                    </div>
                );
            case "select":
                return (
                    <div className="flex flex-col gap-2">
                        <Select
                            value={value || ""}
                            onValueChange={(val) => {
                                onChange(fullPath, val);
                            }}
                            onOpenChange={() => {
                                if (value) onBlur(fullPath, field, value);
                            }}
                        >
                            <SelectTrigger className={cn("w-full", hasError ? "border-red-500" : "", componentProps.className || "")}>
                                {!value && (
                                    <div className="flex items-center">
                                        <Icon className="w-4 h-4 mr-2 text-slate-500" />
                                        <span className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</span>
                                    </div>
                                )}
                                {value && <SelectValue />}
                            </SelectTrigger>
                            <SelectContent>
                                {componentProps.options?.map((option: { label: string; value: string }) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
                    </div>
                );
            case "radiogroup":
                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <Icon className="w-4 h-4 mr-2 text-slate-500" />
                            <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                        </div>
                        <RadioGroup
                            value={value || ""}
                            onValueChange={(val) => {
                                onChange(fullPath, val);
                                onBlur(fullPath, field, val);
                            }}
                            className="space-y-1"
                        >
                            {componentProps.options?.map((option: { label: string; value: string }) => (
                                <div key={option.value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option.value} id={`${fullPath}-${option.value}`} />
                                    <Label htmlFor={`${fullPath}-${option.value}`} className="text-sm">
                                        {option.label}
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                        {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
                    </div>
                );

            case "fileupload":
                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <Icon className="w-4 h-4 mr-2 text-slate-500" />
                            <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                        </div>
                        <div className="flex flex-col gap-2">
                            {value ? (
                                <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded border-border">
                                    <span className="text-sm truncate">
                                        {typeof value === "object" && value.name ? value.name : typeof value === "string" ? value : "File"}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            onChange(fullPath, "");
                                        }}
                                    >
                                        <Trash className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="text-sm text-gray-500 dark:text-gray-400 italic">No file selected</div>
                            )}
                            <div className="relative">
                                <input
                                    type="file"
                                    id={`file-input-${fullPath}`}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            onChange(fullPath, file);
                                        }
                                    }}
                                    {...componentProps}
                                />
                                <Button variant="outline" className="flex items-center gap-2 w-full" type="button">
                                    <Upload className="w-4 h-4" />
                                    Select File
                                </Button>
                            </div>
                        </div>
                    </div>
                );
            case "jsoneditor":
                let jsonValue = value;
                let jsonError = false;

                // Format JSON if possible
                if (typeof value === "string" && value.trim()) {
                    try {
                        const parsedJson = JSON.parse(value);
                        jsonValue = JSON.stringify(parsedJson, null, 2);
                    } catch (e) {
                        jsonError = true;
                        // Keep the original string if it can't be parsed
                        jsonValue = value;
                    }
                } else if (typeof value === "object" && value !== null) {
                    jsonValue = JSON.stringify(value, null, 2);
                } else if (!value) {
                    // Initialize with empty object if no value
                    jsonValue = "{}";
                }

                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center">
                            <Icon className="w-4 h-4 mr-2 text-slate-500" />
                            <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                        </div>
                        <textarea
                            value={jsonValue}
                            onChange={(e) => {
                                onChange(fullPath, e.target.value);
                            }}
                            onBlur={(e) => {
                                // Try to format JSON on blur
                                try {
                                    if (e.target.value.trim()) {
                                        const parsedJson = JSON.parse(e.target.value);
                                        const formattedJson = JSON.stringify(parsedJson, null, 2);
                                        if (formattedJson !== e.target.value) {
                                            onChange(fullPath, formattedJson);
                                        }
                                    }
                                    onBlur(fullPath, field, e.target.value);
                                } catch (err) {
                                    // Not valid JSON, leave as is
                                    onBlur(fullPath, field, e.target.value);
                                }
                            }}
                            className={cn(
                                "w-full font-mono text-sm bg-background min-h-[200px] p-2 border rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                                hasError || jsonError ? "border-red-500" : "border-gray-300 dark:border-gray-600",
                                componentProps.className || ""
                            )}
                            placeholder={placeholder || "Enter JSON here..."}
                            spellCheck="false"
                            {...Object.fromEntries(Object.entries(componentProps).filter(([key]) => key !== "className"))}
                        />
                        {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
                        {jsonError && <span className="text-red-500 text-sm">Invalid JSON format</span>}
                    </div>
                );
            case "textarea":
                return (
                    <div className="flex flex-col gap-2">
                        <FancyTextarea
                            value={value || ""}
                            onChange={(e) => {
                                onChange(fullPath, e.target.value);
                            }}
                            onBlur={() => onBlur(fullPath, field, value)}
                            className={cn("w-full bg-background", hasError ? "border-red-500" : "", componentProps.className || "")}
                            placeholder={placeholder}
                            prefix={<Icon className="w-4 h-4" />}
                            {...Object.fromEntries(Object.entries(componentProps).filter(([key]) => key !== "className"))}
                        />
                        {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
                    </div>
                );

            case "input":
            default:
                return (
                    <div className="flex flex-col gap-2">
                        <FancyInput
                            type="text"
                            prefix={<Icon className="w-4 h-4" />}
                            value={value || ""}
                            onChange={(e) => {
                                onChange(fullPath, e.target.value);
                            }}
                            onBlur={() => onBlur(fullPath, field, value)}
                            className={cn("w-full bg-background", hasError ? "border-red-500" : "", componentProps.className || "")}
                            placeholder={placeholder}
                            {...Object.fromEntries(Object.entries(componentProps).filter(([key]) => key !== "className"))}
                        />
                        {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
                    </div>
                );
        }
    };

    return (
        <div className="grid grid-cols-12 gap-4 mb-4">
            <Label className="col-span-1 text-sm font-medium">{labelContent}</Label>
            <div className="col-span-11">{inputField()}</div>
        </div>
    );
};

export default FormField;