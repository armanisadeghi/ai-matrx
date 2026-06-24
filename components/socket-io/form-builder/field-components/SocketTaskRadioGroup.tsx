// File location: components/socket-io/form-builder/field-components/SocketTaskRadioGroup.tsx
/*
COMPONENT SCHEMA REQUIREMENTS:
{
  "fieldName": {
    "COMPONENT": "radiogroup",
    "DATA_TYPE": "string",
    "DEFAULT": "", // Default selected value (must match an option value)
    "REQUIRED": true/false,
    "COMPONENT_PROPS": {
      "className": "your-custom-class", // Optional
      "options": [ // REQUIRED - Array of options for the radio buttons
        { 
          "label": "Option 1 Display Text", // REQUIRED - Text shown next to the radio button
          "value": "option1" // REQUIRED - Value stored in Redux when selected
        },
        { 
          "label": "Option 2 Display Text",
          "value": "option2"
        }
      ],
      "layout": "vertical", // Optional - "vertical" (default) or "horizontal"
      "disabled": false // Optional - Disable all radio buttons
    }
  }
}

IMPORTANT NOTES:
1. The "options" array in COMPONENT_PROPS is REQUIRED and must contain objects with "label" and "value" properties
2. Each option must have a unique "value" property
3. If no options are provided, the radio group will be empty and unusable
4. Radio buttons are stacked vertically by default
5. The component displays an icon - customize with ICON_NAME property (defaults to "File")

The component will:
- Store the selected option value (string) in Redux
- Display radio buttons with the provided options
- Show validation errors if required field is not selected
- Validate immediately on selection (no blur event needed)
- Support test mode for automated testing with TEST_VALUE
- Support light and dark mode through Tailwind classes
*/
import React, { useCallback, useEffect, useState } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { File } from "lucide-react";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";
import { SchemaField } from "@/constants/socket-schema";
import { formatPlaceholder } from "@/components/socket/utils/label-util";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectConnectionTestMode } from "@/lib/redux/socket-io/selectors/socket-connection-selectors";
import {
  selectFieldValue,
  selectTaskNameById,
} from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import { updateTaskFieldByPath } from "@/lib/redux/socket-io/thunks/taskFieldThunks";
import { FieldOverrides } from "@/components/socket/form-builder/FormField";
import { isValidField } from "@/constants/socket-schema";
import { Label } from "@/components/ui/label";

interface SocketTaskRadioGroupProps {
  taskId: string;
  fieldName: string;
  fieldDefinition: SchemaField;
  fullPath: string;
  initialValue: any;
  propOverrides?: FieldOverrides;
  showPlaceholder?: boolean;
}

const SocketTaskRadioGroup: React.FC<SocketTaskRadioGroupProps> = ({
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
  const currentValue = useAppSelector((state) =>
    selectFieldValue(taskId, fullPath)(state),
  );
  const testMode = useAppSelector(selectConnectionTestMode);
  const taskName = useAppSelector((state) => selectTaskNameById(state, taskId));

  // Initialize the value in Redux on component mount
  useEffect(() => {
    dispatch(
      updateTaskFieldByPath({
        taskId,
        fieldPath: fullPath,
        value: initialValue,
      }),
    );
  }, []);

  // Handle test mode
  React.useEffect(() => {
    if (testMode && fieldDefinition.TEST_VALUE !== undefined) {
      dispatch(
        updateTaskFieldByPath({
          taskId,
          fieldPath: fullPath,
          value: fieldDefinition.TEST_VALUE,
        }),
      );
    }
  }, [testMode]);

  const validateField = useCallback(
    (value: any) => isValidField(taskName, fullPath, value),
    [taskName, fullPath],
  );

  const Icon = (props: any) => (
    <DynamicIcon
      name={fieldDefinition.ICON_NAME}
      fallbackIcon="File"
      {...props}
    />
  );
  const placeholder = showPlaceholder
    ? fieldDefinition.DESCRIPTION || formatPlaceholder(fieldName)
    : "";

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
  const handleValueChange = (value: string) => {
    dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value }));

    // Validate on change since radio buttons don't have a separate blur event
    const { isValid, errorMessage } = validateField(value);
    setHasError(!isValid);
    setNotice(isValid ? "" : errorMessage);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <Icon className="w-4 h-4 mr-2 text-slate-500" />
        <Label className="text-sm text-gray-500 dark:text-gray-400">
          {placeholder}
        </Label>
      </div>
      <RadioGroup
        value={currentValue || ""}
        onValueChange={handleValueChange}
        className={cn(
          "space-y-1",
          hasError ? "border-red-500" : "",
          finalProps.className || "",
        )}
        {...Object.fromEntries(
          Object.entries(finalProps).filter(
            ([key]) => !["className", "options"].includes(key),
          ),
        )}
      >
        {finalProps.options?.map((option: { label: string; value: string }) => (
          <div key={option.value} className="flex items-center space-x-2">
            <RadioGroupItem
              value={option.value}
              id={`${fullPath}-${option.value}`}
            />
            <Label htmlFor={`${fullPath}-${option.value}`} className="text-sm">
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
    </div>
  );
};

export default SocketTaskRadioGroup;
