import React, { useMemo } from "react";
import { FancyInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Files, Plus, Trash } from "lucide-react";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { formatLabel, formatPlaceholder } from "../utils/label-util";
import { SchemaField } from "@/constants/socket-schema";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  arrayOperation,
  updateTaskFieldByPath,
} from "@/lib/redux/socket-io/thunks/taskFieldThunks";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { selectTaskDataById } from "@/lib/redux/socket-io/selectors/socket-task-selectors";

interface ArrayFieldProps {
  taskId: string;
  fieldName: string;
  fieldDefinition: SchemaField;
  path: string;
  hasError?: boolean;
  testMode?: boolean;
}

const ArrayField: React.FC<ArrayFieldProps> = ({
  taskId,
  fieldName,
  fieldDefinition,
  path = "",
  hasError = false,
  testMode = false,
}) => {
  const dispatch = useAppDispatch();
  const fullPath = path ? `${path}.${fieldName}` : fieldName;
  const taskData = useSelector((state: RootState) =>
    selectTaskDataById(state, taskId),
  );

  // Get the value of this array field using the path
  const getValue = () => {
    if (!taskData) return [];
    if (fullPath.includes(".")) {
      const parts = fullPath.split(".");
      let current = taskData;
      for (const part of parts) {
        if (!current || typeof current !== "object") return [];
        current = current[part];
      }
      return Array.isArray(current) ? current : [];
    }

    return Array.isArray(taskData[fullPath]) ? taskData[fullPath] : [];
  };

  const value = getValue();
  const arrayValues = value.length > 0 ? value : [""];

  const handleItemChange = (index: number, newValue: string) => {
    const newArray = [...arrayValues];

    while (newArray.length <= index) {
      newArray.push("");
    }

    newArray[index] = newValue;

    // Remove empty trailing items except keep at least one empty item
    const trimmedArray = newArray.filter(
      (item, idx) => item !== "" || idx === newArray.length - 1 || idx <= index,
    );

    // Ensure we always have at least one item
    const finalArray = trimmedArray.length > 0 ? trimmedArray : [""];

    dispatch(
      updateTaskFieldByPath({
        taskId,
        fieldPath: fullPath,
        value: finalArray,
      }),
    );
  };

  const handleRemoveItem = (index: number) => {
    if (arrayValues.length <= 1) {
      // Always keep at least one empty item
      dispatch(
        updateTaskFieldByPath({
          taskId,
          fieldPath: fullPath,
          value: [""],
        }),
      );
    } else {
      // Use array operation for proper removal
      const newArray = arrayValues.filter((_, idx) => idx !== index);
      dispatch(
        updateTaskFieldByPath({
          taskId,
          fieldPath: fullPath,
          value: newArray.length > 0 ? newArray : [""],
        }),
      );
    }
  };

  const handleAddItem = () => {
    const newArray = [...arrayValues, ""];
    dispatch(
      updateTaskFieldByPath({
        taskId,
        fieldPath: fullPath,
        value: newArray,
      }),
    );
  };

  const getIcon = useMemo(() => {
    const iconName = fieldDefinition.ICON_NAME || "Files";
    const Icon = (props: any) => (
      <DynamicIcon name={iconName} fallbackIcon="Files" {...props} />
    );
    return <Icon className="w-4 h-4" />;
  }, [fieldDefinition.ICON_NAME]);

  // Memoize the rendered items to prevent unnecessary re-renders
  const renderedItems = useMemo(() => {
    return arrayValues.map((item, index) => (
      <div
        key={`${fullPath}-item-${index}`}
        className="flex items-center gap-2 w-full"
      >
        <FancyInput
          type="text"
          prefix={getIcon}
          value={item || ""}
          onChange={(e) => handleItemChange(index, e.target.value)}
          className={`w-full bg-gray-100 dark:bg-gray-800 ${hasError ? "border-red-500" : ""}`}
          wrapperClassName="w-full"
          placeholder={`${formatPlaceholder(fieldName)} item ${index + 1}`}
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={() => handleRemoveItem(index)}
        >
          <Trash className="w-4 h-4" />
        </Button>
      </div>
    ));
  }, [
    arrayValues,
    fullPath,
    hasError,
    fieldName,
    getIcon,
    handleItemChange,
    handleRemoveItem,
  ]);

  // Use test value if in test mode
  React.useEffect(() => {
    if (testMode && fieldDefinition.TEST_VALUE !== undefined) {
      // Use a microtask to ensure this is outside the current render cycle
      Promise.resolve().then(() => {
        dispatch(
          updateTaskFieldByPath({
            taskId,
            fieldPath: fullPath,
            value: fieldDefinition.TEST_VALUE,
          }),
        );
      });
    }
  }, [testMode, fieldDefinition.TEST_VALUE, fullPath, dispatch, taskId]);

  return (
    <div className="grid grid-cols-12 gap-4 mb-4 w-full">
      <Label className="col-span-1 text-sm font-medium">
        <div className="flex items-start gap-1">
          <span className="text-slate-700 dark:text-slate-300 text-xs">
            {formatLabel(fieldName)}
          </span>
          {fieldDefinition.REQUIRED && (
            <span className="text-red-500 text-sm leading-none">*</span>
          )}
        </div>
      </Label>
      <div className="col-span-11 w-full">
        <div className="space-y-2 w-full">
          {renderedItems}
          <Button
            onClick={handleAddItem}
            variant="outline"
            className="border-gray-500 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg"
          >
            <Plus className="w-5 h-5 mr-1" />
            Add {formatLabel(fieldName)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ArrayField;
