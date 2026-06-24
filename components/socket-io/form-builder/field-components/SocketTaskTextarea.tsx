// File location: components/socket-io/form-builder/field-components/SocketTaskTextarea.tsx
import React, { useCallback, useEffect, useState } from "react";
import { FancyTextarea } from "@/components/ui/textarea";
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
import { formatLabel } from "../../utils/label-util";

interface SocketTaskTextareaProps {
    taskId: string;
    fieldName: string;
    fieldDefinition: SchemaField;
    fullPath: string;
    initialValue: any;
    propOverrides?: FieldOverrides;
    showPlaceholder?: boolean;
}

const SocketTaskTextarea: React.FC<SocketTaskTextareaProps> = ({
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
      dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: initialValue }));
    }, []);

    const testMode = useAppSelector(selectConnectionTestMode);
    const currentValue = useAppSelector((state) => selectFieldValue(taskId, fullPath)(state));
    const taskName = useAppSelector((state) => selectTaskNameById(state, taskId));

    React.useEffect(() => {
        if (testMode && fieldDefinition.TEST_VALUE !== undefined) {
            dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: fieldDefinition.TEST_VALUE }));
        }
    }, [testMode]);

    const validateField = useCallback(
        (value: any) => isValidField(taskName, fullPath, value),
        [taskName, fullPath]
      );

    const labelContent = (
        <div className="flex items-start gap-1">
            <span className="text-slate-700 dark:text-slate-300 text-xs">{formatLabel(fieldName)}</span>
            {fieldDefinition.REQUIRED && <span className="text-red-500 text-sm leading-none">*</span>}
        </div>
    );

    const Icon = (props: any) => <DynamicIcon name={fieldDefinition.ICON_NAME} fallbackIcon="File" {...props} />;
    const placeholder = showPlaceholder ? fieldDefinition.DESCRIPTION || formatPlaceholder(fieldName) : "";
    
    const props: Record<string, any> = {};
    const finalProps = { ...fieldDefinition.COMPONENT_PROPS, ...propOverrides };
    
    for (const [key, value] of Object.entries(finalProps)) {
        if (key === "className" && props.className) {
            props.className = cn(props.className, value as string);
        } else {
            props[key] = value;
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: e.target.value }));
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        if (e.target.value === "") {
            setHasError(false);
            setNotice("");
        } else {
            const { isValid, errorMessage } = validateField(e.target.value);
            setHasError(!isValid);
            setNotice(isValid ? "" : errorMessage);
        }
        dispatch(updateTaskFieldByPath({ taskId, fieldPath: fullPath, value: e.target.value }));
    };

    return (
        <div className="flex flex-col gap-2">
            <FancyTextarea
                value={currentValue || ""}
                onChange={handleChange}
                onBlur={handleBlur}
                className={cn("w-full bg-background", hasError ? "border-red-500" : "", props.className || "")}
                placeholder={placeholder}
                prefix={<Icon className="w-4 h-4" />}
                {...Object.fromEntries(Object.entries(props).filter(([key]) => key !== "className"))}
            />
            {notice && <span className="text-yellow-600 text-sm">{notice}</span>}
        </div>
    );
};

export default SocketTaskTextarea;