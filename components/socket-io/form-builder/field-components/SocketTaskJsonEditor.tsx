// File location: components/socket-io/form-builder/field-components/SocketTaskJsonEditor.tsx
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { File } from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { cn } from "@/lib/utils";
import { SchemaField } from "@/constants/socket-schema";
import { formatLabel, formatPlaceholder } from "@/components/socket/utils/label-util";
import { updateTaskFieldByPath } from "@/lib/redux/socket-io/thunks/taskFieldThunks";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectConnectionTestMode } from "@/lib/redux/socket-io/selectors/socket-connection-selectors";
import { selectFieldValue, selectTaskNameById } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import { FieldOverrides } from "@/components/socket/form-builder/FormField";
import { isValidField } from "@/constants/socket-schema";
import { Label } from "@/components/ui/label";
import { flexibleJsonParse, formatJson, safeJsonStringify } from "@/utils/json/json-utils";

interface SocketTaskJsonEditorProps {
    taskId: string;
    fieldName: string;
    fieldDefinition: SchemaField;
    fullPath: string;
    initialValue: any;
    propOverrides?: FieldOverrides;
    showPlaceholder?: boolean;
    value?: any;
}

interface FormattedJsonResult {
    formattedValue: string;
    hasError: boolean;
}

const SocketTaskJsonEditor: React.FC<SocketTaskJsonEditorProps> = ({
    taskId,
    fieldName,
    fieldDefinition,
    fullPath,
    initialValue,
    showPlaceholder = true,
    propOverrides = {},
    value: providedValue,
}) => {
    const dispatch = useAppDispatch();
    const [hasError, setHasError] = useState(false);
    const [notice, setNotice] = useState("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [jsonError, setJsonError] = useState(false);
    const [localJsonValue, setLocalJsonValue] = useState<string>("");
    const [isFirstFocus, setIsFirstFocus] = useState(true);
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Get the current value from Redux store
    const reduxValue = useAppSelector((state) => selectFieldValue(taskId, fullPath)(state));
    const testMode = useAppSelector(selectConnectionTestMode);
    const taskName = useAppSelector((state) => selectTaskNameById(state, taskId));

    // Use provided value (for nested array fields) or Redux value (for top-level fields)
    const currentValue = providedValue !== undefined ? providedValue : reduxValue;

    // Format JSON once for display using the new utility
    const formatJsonValue = useCallback((value: any): FormattedJsonResult => {
        if (typeof value === "string" && value.trim()) {
            const result = flexibleJsonParse(value);
            if (result.success) {
                return {
                    formattedValue: result.formattedJson || value,
                    hasError: false
                };
            } else {
                return {
                    formattedValue: value,
                    hasError: true
                };
            }
        } else if (typeof value === "object" && value !== null) {
            return {
                formattedValue: safeJsonStringify(value, 2),
                hasError: false
            };
        } else if (!value || value === "") {
            return {
                formattedValue: "{}",
                hasError: false
            };
        } else {
            // For any other type, convert to string
            return {
                formattedValue: String(value),
                hasError: false
            };
        }
    }, []);

    // Parse JSON string to object for storage using the new utility
    const parseJsonValue = useCallback((jsonString: string): any => {
        if (!jsonString || jsonString.trim() === "") {
            return {};
        }
        
        const result = flexibleJsonParse(jsonString);
        if (result.success) {
            // Set warnings if any conversions were made
            if (result.warnings && result.warnings.length > 0) {
                setWarnings(result.warnings);
            } else {
                setWarnings([]);
            }
            return result.data;
        } else {
            // If parsing fails, return the string as-is
            setWarnings([]);
            return jsonString;
        }
    }, []);

    // Initialize the value in Redux on component mount
    useEffect(() => {
        // Only initialize if value is undefined/null and no value is provided
        if (providedValue === undefined && (reduxValue === undefined || reduxValue === null)) {
            const result = formatJsonValue(initialValue);
            const parsedValue = parseJsonValue(result.formattedValue);
            dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: parsedValue }));
        }
    }, []);

    // Set local JSON value whenever currentValue changes
    useEffect(() => {
        if (currentValue !== undefined) {
            const result = formatJsonValue(currentValue);
            setLocalJsonValue(result.formattedValue);
            setJsonError(result.hasError);
        }
    }, [currentValue, formatJsonValue]);

    // Handle test mode
    useEffect(() => {
        if (testMode && fieldDefinition.TEST_VALUE !== undefined) {
            const result = formatJsonValue(fieldDefinition.TEST_VALUE);
            dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: result.formattedValue }));
        }
    }, [testMode, fieldDefinition.TEST_VALUE, formatJsonValue]);

    const validateField = useCallback(
        (value: any) => isValidField(taskName, fullPath, value),
        [taskName, fullPath]
      );

    const Icon = (props: any) => <DynamicIcon name={fieldDefinition.ICON_NAME} fallbackIcon="File" {...props} />;
    const placeholder = showPlaceholder ? fieldDefinition.DESCRIPTION || formatPlaceholder(fieldName) : "";
    
    // Process component props
    const props: Record<string, any> = {};
    const finalProps = { ...fieldDefinition.COMPONENT_PROPS, ...propOverrides };
    
    for (const [key, value] of Object.entries(finalProps)) {
        if (key === "className" && props.className) {
            props.className = cn(props.className, value as string);
        } else {
            props[key] = value;
        }
    }

    // Handle value change
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setLocalJsonValue(newValue);
        
        // Try to parse and store as object if valid, otherwise store as string
        const parsedValue = parseJsonValue(newValue);
        dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: parsedValue }));
    };

    // Handle focus - select all on first focus
    const handleFocus = () => {
        if (isFirstFocus && textareaRef.current) {
            textareaRef.current.select();
            setIsFirstFocus(false);
        }
    };

    // Handle blur - validate and clean up JSON
    const handleBlur = () => {
        const result = flexibleJsonParse(localJsonValue);
        
        if (result.success) {
            // Update with formatted JSON
            const formattedValue = result.formattedJson || localJsonValue;
            setLocalJsonValue(formattedValue);
            setJsonError(false);
            setWarnings(result.warnings || []);
            
            // Store the parsed object
            dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: result.data }));
        } else {
            setJsonError(true);
            setWarnings([]);
            // Keep the current value but mark as error
        }
    };

    // Auto-fix button for Python-style JSON
    const handleAutoFix = () => {
        const result = flexibleJsonParse(localJsonValue);
        if (result.success) {
            const formattedValue = result.formattedJson || localJsonValue;
            setLocalJsonValue(formattedValue);
            setJsonError(false);
            setWarnings(result.warnings || []);
            dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: result.data }));
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center">
                    <Icon className="w-4 h-4 mr-2 text-slate-500" />
                    <Label className="text-sm text-gray-500 dark:text-gray-400">{placeholder}</Label>
                </div>
                {(jsonError || warnings.length > 0) && (
                    <button
                        type="button"
                        onClick={handleAutoFix}
                        className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Auto-fix JSON
                    </button>
                )}
            </div>
            <textarea
                ref={textareaRef}
                value={localJsonValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={cn(
                    "w-full font-mono text-sm bg-background min-h-[200px] p-2 border rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500",
                    hasError || jsonError ? "border-red-500" : "border-gray-300 dark:border-gray-600",
                    finalProps.className || ""
                )}
                placeholder={placeholder || "Enter JSON here..."}
                spellCheck="false"
                {...Object.fromEntries(Object.entries(finalProps).filter(([key]) => key !== "className"))}
            />
            {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
            {jsonError && <span className="text-red-500 text-sm">Invalid JSON format - click Auto-fix to attempt repair</span>}
            {warnings.length > 0 && (
                <div className="text-blue-600 text-sm">
                    <div className="font-medium">Auto-conversions applied:</div>
                    <ul className="list-disc list-inside ml-2">
                        {warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default SocketTaskJsonEditor;