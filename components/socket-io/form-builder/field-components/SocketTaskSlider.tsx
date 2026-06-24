// File location: components/socket-io/form-builder/field-components/SocketTaskSlider.tsx
/*
COMPONENT SCHEMA REQUIREMENTS:
{
  "fieldName": {
    "COMPONENT": "slider",
    "DATA_TYPE": "number",
    "DEFAULT": 50, // Default numerical value within min-max range
    "REQUIRED": true/false,
    "COMPONENT_PROPS": {
      "className": "your-custom-class", // Optional
      "min": 0, // REQUIRED - Minimum value (default: 0 if not provided)
      "max": 100, // REQUIRED - Maximum value (default: 100 if not provided)
      "step": 1, // RECOMMENDED - Step increment (default: 1 if not provided)
      "disabled": false, // Optional - Disable the slider
      "showValueLabel": true // Optional - Show current value label
    }
  }
}

IMPORTANT NOTES:
1. "min" and "max" are REQUIRED for proper functioning - they define the range
2. "step" is HIGHLY RECOMMENDED to control increment granularity
3. The component always stores a single numerical value (not an array)
4. Default value should be within the min-max range
5. The component shows both a label and the current value
6. The component displays an icon - customize with ICON_NAME property (defaults to "File")

The component will:
- Store a single numerical value in Redux
- Allow sliding within the defined min-max range
- Update in real-time as the user drags the slider
- Show validation errors if value is outside allowed range
- Support test mode for automated testing with TEST_VALUE
- Support light and dark mode through Tailwind classes
*/
import React, { useCallback, useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { File } from "lucide-react";
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { cn } from "@/lib/utils";
import { SchemaField } from "@/constants/socket-schema";
import { formatPlaceholder } from "@/components/socket/utils/label-util";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectConnectionTestMode } from "@/lib/redux/socket-io/selectors/socket-connection-selectors";
import { selectFieldValue, selectTaskNameById } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import { updateTaskFieldByPath } from "@/lib/redux/socket-io/thunks/taskFieldThunks";
import { FieldOverrides } from "@/components/socket/form-builder/FormField";
import { isValidField } from "@/constants/socket-schema";
import { Label } from "@/components/ui/label";

interface SocketTaskSliderProps {
    taskId: string;
    fieldName: string;
    fieldDefinition: SchemaField;
    fullPath: string;
    initialValue: any;
    propOverrides?: FieldOverrides;
    showPlaceholder?: boolean;
}

const SocketTaskSlider: React.FC<SocketTaskSliderProps> = ({
    taskId,
    fieldName,
    fieldDefinition,
    fullPath,
    initialValue,
    showPlaceholder = true,
    propOverrides = {},
}) => {
    const dispatch = useAppDispatch();
    const [hasError, setHasError] = useState(false);
    const [notice, setNotice] = useState("");

    // Get the current value from Redux store
    const currentValue = useAppSelector((state) => selectFieldValue(taskId, fullPath)(state));
    const testMode = useAppSelector(selectConnectionTestMode);
    const taskName = useAppSelector((state) => selectTaskNameById(state, taskId));

    // Ensure the value is a number (not an array)
    const getProcessedValue = (rawValue: any) => {
        if (typeof rawValue === "number") {
            return rawValue;
        } else if (fieldDefinition.DEFAULT !== undefined && typeof fieldDefinition.DEFAULT === "number") {
            return fieldDefinition.DEFAULT;
        } else {
            return 0;
        }
    };

    // Initialize the value in Redux on component mount
    useEffect(() => {
        const processedValue = getProcessedValue(initialValue);
        dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: processedValue }));
    }, []);

    // Handle test mode
    React.useEffect(() => {
        if (testMode && fieldDefinition.TEST_VALUE !== undefined) {
            const testValue = typeof fieldDefinition.TEST_VALUE === "number" 
                ? fieldDefinition.TEST_VALUE 
                : getProcessedValue(fieldDefinition.TEST_VALUE);
            
            dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: testValue }));
        }
    }, [testMode]);

    const validateField = useCallback(
        (value: any) => isValidField(taskName, fullPath, value),
        [taskName, fullPath]
      );

    const Icon = (props: any) => <DynamicIcon name={fieldDefinition.ICON_NAME} fallbackIcon="File" {...props} />;
    const placeholder = showPlaceholder ? fieldDefinition.DESCRIPTION || formatPlaceholder(fieldName) : "";
    
    // Process the slider value
    const sliderValue = getProcessedValue(currentValue);

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
    const handleValueChange = (val: number[]) => {
        dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: val[0] }));
    };

    // Handle value commit (blur)
    const handleValueCommit = (val: number[]) => {
        const { isValid, errorMessage } = validateField(val[0]);
        setHasError(!isValid);
        setNotice(isValid ? "" : errorMessage);
        
        dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: val[0] }));
    };

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
                onValueChange={handleValueChange}
                onValueCommit={handleValueCommit}
                min={finalProps.min || 0}
                max={finalProps.max || 100}
                step={finalProps.step || 1}
                className={cn("w-full", hasError ? "border-red-500" : "", finalProps.className || "")}
                {...Object.fromEntries(
                    Object.entries(finalProps).filter(
                        ([key]) => !["className", "min", "max", "step", "range"].includes(key)
                    )
                )}
            />
            {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
        </div>
    );
};

export default SocketTaskSlider;