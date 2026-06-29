// components/ui/JsonComponents/JsonEditor.tsx
"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Copy,
  Save,
  Maximize2,
  RotateCcw,
  Check,
  Minimize2,
  FileText,
  Edit3,
  Plus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../tooltip";
import { EditableJsonViewerProps } from "@/components/ui/JsonComponents/types";
import JsonEditorItem from "./JsonEditorItem";
import jsonUtils from "./newUitls";

const SAMPLE_ENTRY = {
  YourKey: "YourValue",
  YourNestedKey: {
    NestedKey: "NestedValue",
  },
  YourList: ["Item1", "Item2", "Item3"],
};

export const EditableJsonViewer: React.FC<EditableJsonViewerProps> = ({
  data,
  onChange,
  onFormat,
  className,
  initialExpanded = false,
  maxHeight = "400px",
  validateDelay = 300,
  lockKeys = false,
  defaultEnhancedMode = true,
  readOnly = false,
  sampleEntry = SAMPLE_ENTRY,
  ...props
}) => {
  const [originalValue, setOriginalValue] = useState<any>(data);
  const [parsedData, setParsedData] = useState<object>({});
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [isCopied, setIsCopied] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any>([]);
  const [isEnhancedMode, setIsEnhancedMode] = useState(defaultEnhancedMode);
  const [basicJsonText, setBasicJsonText] = useState("");
  const [isAllExpanded, setIsAllExpanded] = useState(false);

  const debouncedValidate = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    return (jsonString: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const { error } = jsonUtils.parse(jsonString);
        if (error) {
          setValidationErrors([
            {
              line: 1,
              column: 1,
              message: error,
            },
          ]);
        } else {
          setValidationErrors([]);
        }
      }, validateDelay);
    };
  }, [validateDelay]);

  useEffect(() => {
    const initializeData = () => {
      setOriginalValue(data);

      if (data === null || data === undefined || data === "") {
        setParsedData({});
        setBasicJsonText("");
        return;
      }

      try {
        if (typeof data === "object") {
          setParsedData(data);
          setBasicJsonText(jsonUtils.stringify(data));
          return;
        }

        const { data: parsed, error } = jsonUtils.parse(data);
        if (error) {
          throw new Error(error);
        }
        setParsedData(parsed);
        setBasicJsonText(
          typeof data === "string" ? data : jsonUtils.stringify(parsed),
        );
      } catch (error) {
        console.error("Error initializing data:", error);
        setParsedData({});
        setBasicJsonText(typeof data === "string" ? data : String(data));
        setValidationErrors([
          {
            line: 1,
            column: 1,
            message: `Invalid JSON: ${extractErrorMessage(error)}`,
          },
        ]);
      }
    };

    initializeData();
  }, [data]);

  const handleChange = (newData: object) => {
    try {
      setParsedData(newData);
      const stringified = jsonUtils.stringify(newData);
      setBasicJsonText(stringified);
      onChange(typeof originalValue === "string" ? stringified : newData);
      setValidationErrors([]);
    } catch (error) {
      console.error("Error in handleChange:", error);
      setValidationErrors([
        {
          line: 1,
          column: 1,
          message: `Change error: ${extractErrorMessage(error)}`,
        },
      ]);
    }
  };

  const handleBasicJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setBasicJsonText(newValue);

    const { data: parsed, error } = jsonUtils.parse(newValue);
    if (!error) {
      setParsedData(parsed);
      onChange(typeof originalValue === "string" ? newValue : parsed);
      setValidationErrors([]);
    } else {
      debouncedValidate(newValue);
    }
  };

  const toggleMode = () => {
    if (isEnhancedMode) {
      setBasicJsonText(jsonUtils.stringify(parsedData));
    } else {
      const { data: parsed, error } = jsonUtils.parse(basicJsonText);
      if (!error) {
        setParsedData(parsed);
        onChange(typeof originalValue === "string" ? basicJsonText : parsed);
      }
    }
    setIsEnhancedMode(!isEnhancedMode);
  };

  const copyToClipboard = () => {
    const stringified = jsonUtils.stringify(parsedData);
    navigator.clipboard.writeText(stringified);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  const getAllKeys = (obj: any): string[] => {
    let keys: string[] = [];
    for (const key in obj) {
      keys.push(key);
      if (typeof obj[key] === "object" && obj[key] !== null) {
        keys = keys.concat(getAllKeys(obj[key]).map((k) => `${key}.${k}`));
      }
    }
    return keys;
  };

  const expandAll = () => {
    const allKeys = getAllKeys(parsedData);
    setExpandedKeys(new Set(allKeys));
  };

  const collapseAll = () => {
    setExpandedKeys(new Set());
  };

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      collapseAll();
    } else {
      expandAll();
    }
    setIsAllExpanded(!isAllExpanded);
  };

  const handleAddFirstItem = () => {
    if (readOnly) return;
    const { data: newData } = jsonUtils.parse(
      typeof sampleEntry === "string"
        ? sampleEntry
        : jsonUtils.stringify(sampleEntry),
    );
    handleChange(newData);
  };
  const IconButton = ({ icon: Icon, tooltip, onClick, className = "" }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "p-0 hover:bg-muted rounded-sm transition-colors",
              className,
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div
      className={cn(
        "relative dark:bg-zinc-800 text-muted-foreground px-1 mb-2 rounded-md overflow-y-auto overflow-x-hidden",
        className,
      )}
      style={{ maxHeight }}
      {...props}
    >
      {validationErrors.length > 0 && (
        <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-sm">
          <div className="text-xs text-yellow-800 dark:text-yellow-200">
            Original Value:
          </div>
          <pre className="mt-1 text-xs overflow-auto">
            {typeof originalValue === "string"
              ? originalValue
              : JSON.stringify(originalValue, null, 2)}
          </pre>
        </div>
      )}

      <div className="flex justify-end space-x-2 mb-1">
        {isEnhancedMode && (
          <IconButton
            icon={isAllExpanded ? Minimize2 : Maximize2}
            tooltip={isAllExpanded ? "Collapse All" : "Expand All"}
            onClick={toggleExpandAll}
          />
        )}

        <IconButton
          icon={isEnhancedMode ? FileText : Edit3}
          tooltip={
            isEnhancedMode ? "Switch to Basic Mode" : "Switch to Enhanced Mode"
          }
          onClick={toggleMode}
        />
        <IconButton
          icon={Copy}
          tooltip={isCopied ? "Copied!" : "Copy JSON"}
          onClick={copyToClipboard}
        />
        {!readOnly && onFormat && (
          <IconButton
            icon={FileText}
            tooltip="Format JSON"
            onClick={onFormat}
          />
        )}
      </div>

      {isEnhancedMode ? (
        <div className="space-y-0.5 dark:bg-zinc-800">
          {Object.entries(parsedData).length > 0 ? (
            Object.entries(parsedData).map(([key, value], index) => (
              <JsonEditorItem
                key={key}
                keyName={key}
                value={value}
                depth={0}
                isExpanded={expandedKeys.has(key)}
                onToggle={() => toggleExpand(key)}
                onEdit={(newKey, newValue) => {
                  if (readOnly) return;
                  const newData = { ...parsedData };
                  delete newData[key];
                  newData[newKey] = newValue;
                  handleChange(newData);
                }}
                onAdd={(newKey, newValue, index) => {
                  if (readOnly) return;
                  const entries = Object.entries(parsedData);
                  entries.splice(index, 0, [newKey, newValue]);
                  handleChange(Object.fromEntries(entries));
                }}
                onDelete={() => {
                  if (readOnly) return;
                  const newData = { ...parsedData };
                  delete newData[key];
                  handleChange(newData);
                }}
                error={validationErrors.find(
                  (error) => error.line === index + 1,
                )}
                lockKeys={lockKeys}
                readOnly={readOnly}
                index={index}
              />
            ))
          ) : (
            <div className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-sm">
              <span className="text-muted-foreground text-sm">No data</span>
              {!readOnly && (
                <button
                  onClick={handleAddFirstItem}
                  className="flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <Textarea
          value={basicJsonText}
          onChange={handleBasicJsonChange}
          className="w-full h-64 dark:bg-zinc-800 font-mono text-sm"
          readOnly={readOnly}
        />
      )}

      {validationErrors.length > 0 && (
        <div className="mt-2 p-1.5 bg-destructive/10 rounded text-sm">
          <h4 className="text-destructive font-medium">Validation Errors:</h4>
          <ul className="list-disc pl-4 mt-1">
            {validationErrors.map((error, index) => (
              <li key={index} className="text-destructive">
                Line {error.line}, Column {error.column}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const FullEditableJsonViewer: React.FC<
  EditableJsonViewerProps & { title?: string }
> = ({
  data,
  onChange,
  onFormat,
  title = "JSON Editor",
  className,
  readOnly,
  ...props
}) => {
  return (
    <Card className={cn("bg-card", className)}>
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      <div className="p-3">
        <EditableJsonViewer
          data={data}
          onChange={onChange}
          onFormat={onFormat}
          readOnly={readOnly}
          {...props}
        />
      </div>
    </Card>
  );
};

export interface EnhancedEditableJsonViewerProps extends React.HTMLAttributes<HTMLDivElement> {
  data: object | string;
  title?: string;
  onSave?: (data: object) => void;
  onChange?: (data: object) => void;
  className?: string;
  allowMinimize?: boolean;
  isMinimized?: boolean;
  onMinimizeChange?: (isMinimized: boolean) => void;
  id?: string;
  readOnly?: boolean;
  hideHeader?: boolean;
}

export const EnhancedEditableJsonViewer: React.FC<
  EnhancedEditableJsonViewerProps
> = ({
  data,
  title,
  onSave,
  onChange,
  className,
  allowMinimize = false,
  isMinimized: controlledIsMinimized,
  onMinimizeChange,
  id,
  readOnly = false,
  hideHeader = false,
  ...props
}) => {
  const [localIsMinimized, setLocalIsMinimized] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [localData, setLocalData] = useState(data);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const isMinimized = controlledIsMinimized ?? localIsMinimized;

  useEffect(() => {
    setLocalData(data);
    setHasChanges(false);
  }, [data]);

  const handleMinimizeToggle = () => {
    const newValue = !isMinimized;
    setLocalIsMinimized(newValue);
    onMinimizeChange?.(newValue);
  };

  const handleChange = (newData: object) => {
    setLocalData(newData);
    setHasChanges(true);
    onChange?.(newData);
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setSaveStatus("saving");
    try {
      const dataToSave =
        typeof localData === "string"
          ? localData.trim().startsWith("{") || localData.trim().startsWith("[")
            ? JSON.parse(localData)
            : localData
          : localData;

      await onSave?.(dataToSave);
      setSaveStatus("saved");
      setHasChanges(false);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Save error:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleReset = () => {
    setLocalData(data);
    setHasChanges(false);
  };

  const renderEditorContent = () => (
    <EditableJsonViewer
      data={localData}
      onChange={handleChange}
      readOnly={readOnly}
      title={hideHeader ? title : undefined} // Pass title only if header is hidden
      {...props}
    />
  );

  const minimizedContent = (
    <motion.div
      key="minimized"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={cn(
        "flex items-center gap-2 bg-card rounded-full px-3 py-1.5 shadow-sm border cursor-pointer",
        hasChanges && "border-orange-500",
        readOnly && "border-muted",
      )}
      onClick={handleMinimizeToggle}
    >
      <span className="text-sm font-medium truncate max-w-[200px]">
        {title}
      </span>
      {hasChanges && (
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
      )}
      {readOnly && (
        <span className="text-xs text-muted-foreground">(Read Only)</span>
      )}
      <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
    </motion.div>
  );

  const expandedContent = (
    <motion.div
      key="expanded"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="bg-card">
        {!hideHeader && (
          <div className="px-3 py-2 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              {readOnly && (
                <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                  Read Only
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {!readOnly && hasChanges && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className="h-7 px-2 text-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSave}
                    className="h-7 px-2 text-xs"
                    disabled={saveStatus === "saving"}
                  >
                    {saveStatus === "saving" ? (
                      <>Saving...</>
                    ) : saveStatus === "saved" ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1" /> Saved
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5 mr-1" /> Save
                      </>
                    )}
                  </Button>
                </>
              )}
              {allowMinimize && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMinimizeToggle}
                  className="h-7 w-7 p-0"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}
        <div className={cn("p-3", hideHeader && "pt-0")}>
          {renderEditorContent()}
        </div>
      </Card>
    </motion.div>
  );

  return (
    <motion.div
      layout
      initial={false}
      className={cn("relative", className)}
      transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
    >
      <AnimatePresence mode="wait">
        {isMinimized ? minimizedContent : expandedContent}
      </AnimatePresence>
    </motion.div>
  );
};

export default FullEditableJsonViewer;
