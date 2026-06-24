// File location: components/socket-io/form-builder/field-components/SocketTaskInput.tsx

import React, { useCallback, useEffect, useState } from "react";
import { FancyInput } from "@/components/ui/input";
import { File } from "lucide-react";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";
import { SchemaField } from "@/constants/socket-schema";
import {
  formatLabel,
  formatPlaceholder,
} from "@/components/socket/utils/label-util";
import { updateTaskFieldByPath } from "@/lib/redux/socket-io/thunks/taskFieldThunks";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectConnectionTestMode } from "@/lib/redux/socket-io/selectors/socket-connection-selectors";
import {
  selectFieldValue,
  selectTaskNameById,
} from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import { FieldOverrides } from "@/components/socket/form-builder/FormField";
import { isValidField } from "@/constants/socket-schema";
import { flexibleJsonParse } from "@/utils/json/json-utils";

interface SocketTaskInputProps {
  taskId: string;
  fieldName: string;
  fieldDefinition: SchemaField;
  fullPath: string;
  initialValue: any;
  propOverrides?: FieldOverrides;
  showPlaceholder?: boolean;
  value?: any;
}

const SocketTaskInput: React.FC<SocketTaskInputProps> = ({
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

  const testMode = useAppSelector(selectConnectionTestMode);
  const reduxValue = useAppSelector((state) =>
    selectFieldValue(taskId, fullPath)(state),
  );
  const taskName = useAppSelector((state) => selectTaskNameById(state, taskId));

  // Use provided value (for nested array fields) or Redux value (for top-level fields)
  const currentValue = providedValue !== undefined ? providedValue : reduxValue;

  // Only initialize if current value is undefined/null and no value is provided
  useEffect(() => {
    if (
      providedValue === undefined &&
      (reduxValue === undefined || reduxValue === null)
    ) {
      dispatch(
        updateTaskFieldByPath({
          taskId,
          fieldPath: fullPath,
          value: initialValue,
        }),
      );
    }
  }, []);

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

  const labelContent = (
    <div className="flex items-start gap-1">
      <span className="text-slate-700 dark:text-slate-300">
        {formatLabel(fieldName)}
      </span>
      {fieldDefinition.REQUIRED && (
        <span className="text-red-500 text-sm leading-none">*</span>
      )}
    </div>
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let processedValue: any = e.target.value;

    // Convert value based on expected data type
    const dataType = fieldDefinition.DATA_TYPE?.toLowerCase();

    try {
      switch (dataType) {
        case "number":
          const numValue = parseFloat(processedValue);
          processedValue = isNaN(numValue) ? processedValue : numValue;
          break;
        case "integer":
          const intValue = parseInt(processedValue, 10);
          processedValue = isNaN(intValue) ? processedValue : intValue;
          break;
        case "boolean":
          if (processedValue === "true") processedValue = true;
          else if (processedValue === "false") processedValue = false;
          break;
        case "object":
          // For object fields, use flexible JSON parsing
          if (processedValue.trim()) {
            const result = flexibleJsonParse(processedValue);
            if (result.success) {
              processedValue = result.data;
            }
            // If parsing fails, keep as string for validation to catch
          }
          break;
        case "array":
          // For array fields, use flexible JSON parsing
          if (processedValue.trim()) {
            const result = flexibleJsonParse(processedValue);
            if (result.success && Array.isArray(result.data)) {
              processedValue = result.data;
            } else {
              // Try to parse as a simple comma-separated list
              try {
                processedValue = processedValue
                  .split(",")
                  .map((item) => item.trim());
              } catch (e) {
                // Keep as string if conversion fails
              }
            }
          }
          break;
        // case "string" and default: keep as string
      }
    } catch (e) {
      // If any conversion fails, keep original value
      processedValue = e.target.value;
    }

    dispatch(
      updateTaskFieldByPath({
        taskId,
        fieldPath: fullPath,
        value: processedValue,
      }),
    );
  };

  const validateField = useCallback(
    (value: any) => isValidField(taskName, fullPath, value),
    [taskName, fullPath],
  );

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let value = e.target.value;

    // Apply final conversion on blur for better UX
    const dataType = fieldDefinition.DATA_TYPE?.toLowerCase();
    try {
      switch (dataType) {
        case "number":
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) value = numValue.toString();
          break;
        case "integer":
          const intValue = parseInt(value, 10);
          if (!isNaN(intValue)) value = intValue.toString();
          break;
        case "object":
          // For object fields, try flexible JSON parsing one more time
          if (value.trim()) {
            const result = flexibleJsonParse(value);
            if (result.success) {
              value = JSON.stringify(result.data, null, 2);
            }
          }
          break;
        case "array":
          // For array fields, try flexible JSON parsing one more time
          if (value.trim()) {
            const result = flexibleJsonParse(value);
            if (result.success && Array.isArray(result.data)) {
              value = JSON.stringify(result.data, null, 2);
            }
          }
          break;
      }
    } catch (e) {
      // Keep original value if conversion fails
    }

    // Only validate on blur, not on every keystroke
    if (value === "") {
      setHasError(false);
      setNotice("");
    } else {
      const { isValid, errorMessage } = validateField(value);
      setHasError(!isValid);
      setNotice(isValid ? "" : errorMessage);
    }

    // Update Redux state on blur
    dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value }));
  };

  const dataType = fieldDefinition.DATA_TYPE;

  // Determine input type based on data type
  const getInputType = () => {
    switch (dataType?.toLowerCase()) {
      case "number":
      case "integer":
        return "number";
      case "boolean":
        return "text"; // We'll handle boolean conversion manually
      default:
        return "text";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <FancyInput
        type={getInputType()}
        prefix={<Icon className="w-4 h-4" />}
        value={currentValue || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        className={cn(
          "w-full bg-background",
          hasError ? "border-red-500" : "",
          props.className || "",
        )}
        placeholder={placeholder}
        {...Object.fromEntries(
          Object.entries(props).filter(([key]) => key !== "className"),
        )}
      />
      {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
    </div>
  );
};

export default SocketTaskInput;
