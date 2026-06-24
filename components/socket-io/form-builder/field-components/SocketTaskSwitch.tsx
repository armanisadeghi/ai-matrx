// File location: components/socket-io/form-builder/field-components/SocketTaskSwitch.tsx
/*
COMPONENT SCHEMA REQUIREMENTS:
{
  "fieldName": {
    "COMPONENT": "switch",
    "DATA_TYPE": "boolean",
    "DEFAULT": false, // Default value (true or false)
    "REQUIRED": true/false,
    "COMPONENT_PROPS": {
      "className": "your-custom-class", // Optional
      "disabled": false, // Optional - Disable the switch
      "labelPosition": "right" // Optional - Position of the label ("right" or "left")
    }
  }
}

IMPORTANT NOTES:
1. The switch component stores a boolean value (true/false) in Redux
2. Unlike other components, the switch is always paired with its label in the UI
3. The component displays an icon - customize with ICON_NAME property (defaults to "File")
4. The label text is taken from DESCRIPTION or derived from the field name
5. No specific REQUIRED props in COMPONENT_PROPS - all are optional

The component will:
- Store a boolean value in Redux
- Toggle between true/false when clicked
- Show validation errors if the value doesn't meet requirements
- Validate immediately on change (no blur event needed)
- Support test mode for automated testing with TEST_VALUE
- Support light and dark mode through Tailwind classes
*/
import React, { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
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

interface SocketTaskSwitchProps {
  taskId: string;
  fieldName: string;
  fieldDefinition: SchemaField;
  fullPath: string;
  initialValue: any;
  propOverrides?: FieldOverrides;
  showPlaceholder?: boolean;
}

const SocketTaskSwitch: React.FC<SocketTaskSwitchProps> = ({
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

  useEffect(() => {
    dispatch(
      updateTaskFieldByPath({
        taskId,
        fieldPath: fullPath,
        value: initialValue,
      }),
    );
  }, []);

  const testMode = useAppSelector(selectConnectionTestMode);
  const currentValue = useAppSelector((state) =>
    selectFieldValue(taskId, fullPath)(state),
  );
  const taskName = useAppSelector((state) => selectTaskNameById(state, taskId));

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

  const props: Record<string, any> = {};
  const finalProps = { ...fieldDefinition.COMPONENT_PROPS, ...propOverrides };

  for (const [key, value] of Object.entries(finalProps)) {
    if (key === "className" && props.className) {
      props.className = cn(props.className, value as string);
    } else {
      props[key] = value;
    }
  }

  const handleChange = (checked: boolean) => {
    dispatch(
      updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: checked }),
    );

    const { isValid, errorMessage } = validateField(checked);
    setHasError(!isValid);
    setNotice(isValid ? "" : errorMessage);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={!!currentValue}
          onCheckedChange={handleChange}
          className={cn(
            hasError ? "border-red-500" : "",
            props.className || "",
          )}
          {...Object.fromEntries(
            Object.entries(props).filter(([key]) => key !== "className"),
          )}
        />
        <Icon className="w-4 h-4 mr-2 text-slate-500" />
        <Label className="text-sm text-gray-500 dark:text-gray-400">
          {placeholder}
        </Label>
      </div>
      {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
    </div>
  );
};

export default SocketTaskSwitch;
