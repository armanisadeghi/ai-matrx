"use client";

import React, { useState } from "react";
import { getRegisteredFunctions } from "@/features/workflows/react-flow/node-editor/workflow-node-editor/utils/arg-utils";
import { Button } from "@/components/ui/button";
import { Input, DeleteInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { DbFunctionNode } from "@/features/workflows/types";
import {
  updateArgOverride,
  handleArgValueChange,
  getEffectiveArgValue,
  addBrokerMapping,
  updateBrokerMapping,
  removeBrokerMapping,
  getBrokerMappingsForArg,
} from "@/features/workflows/react-flow/node-editor/workflow-node-editor/utils";
import {
  flexibleJsonParse,
  formatJson,
  valueToString,
  hasContent,
} from "@/utils/json/json-utils";
import { cleanJson } from "@/utils/json/json-cleaner-utility";
import { EnrichedBroker } from "@/features/workflows/utils/data-flow-manager";
import {
  asArgumentMappings,
  asArgumentOverrides,
} from "@/features/workflows/utils/workflow-json-fields";

interface ArgumentsTabProps {
  nodeData: DbFunctionNode;
  onNodeUpdate: (nodeData: DbFunctionNode) => void;
  argsToHide?: string[]; // Optional array of argument names to hide from display
  enrichedBrokers: EnrichedBroker[];
}

const ArgumentsTab: React.FC<ArgumentsTabProps> = ({
  nodeData,
  onNodeUpdate,
  argsToHide = [],
  enrichedBrokers,
}) => {
  const functionData = getRegisteredFunctions().find(
    (f) => f.id === nodeData.function_id,
  );
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  if (!functionData || functionData.args.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No arguments defined for this function.
      </div>
    );
  }

  // Filter out hidden arguments but keep the original functionality
  const visibleArgs = functionData.args.filter(
    (arg) => !argsToHide.includes(arg.name),
  );

  // Separate required and optional arguments from visible args only
  const requiredArgs = visibleArgs.filter((arg) => arg.required);
  const optionalArgs = visibleArgs.filter((arg) => !arg.required);

  const handleJsonClean = (argName: string, currentValue: string) => {
    if (!currentValue || currentValue.trim() === "") {
      setJsonErrors((prev) => ({ ...prev, [argName]: "" }));
      return;
    }

    try {
      // First try our flexible JSON parser
      const parseResult = flexibleJsonParse(currentValue);

      if (parseResult.success) {
        // Clean and format the JSON
        const cleanedData = cleanJson(parseResult.data);
        const formattedJson = JSON.stringify(cleanedData, null, 2);

        // Find the argument and update its value
        const arg = [...requiredArgs, ...optionalArgs].find(
          (a) => a.name === argName,
        );
        if (arg) {
          handleArgValueChange(nodeData, onNodeUpdate, arg, formattedJson);
          // Also update local state so the textarea shows the cleaned value
          setLocalValues((prev) => ({ ...prev, [argName]: formattedJson }));
        }

        setJsonErrors((prev) => ({ ...prev, [argName]: "" }));
      } else {
        setJsonErrors((prev) => ({
          ...prev,
          [argName]: parseResult.error || "Invalid JSON format",
        }));
      }
    } catch (error) {
      setJsonErrors((prev) => ({
        ...prev,
        [argName]: "Failed to parse JSON: " + (error as Error).message,
      }));
    }
  };

  const validateJsonOnBlur = (argName: string, value: string) => {
    if (!value || value.trim() === "") {
      setJsonErrors((prev) => ({ ...prev, [argName]: "" }));
      return;
    }

    try {
      const parseResult = flexibleJsonParse(value);
      if (parseResult.success) {
        setJsonErrors((prev) => ({ ...prev, [argName]: "" }));
      } else {
        setJsonErrors((prev) => ({
          ...prev,
          [argName]: "Invalid JSON - use Clean JSON button to fix",
        }));
      }
    } catch (error) {
      setJsonErrors((prev) => ({
        ...prev,
        [argName]: "Invalid JSON format",
      }));
    }
  };

  const renderValueInput = (arg: any, effective: any) => {
    const dataType = arg.data_type.toLowerCase();
    const currentError = jsonErrors[arg.name];

    switch (dataType) {
      case "bool":
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={effective.value === true || effective.value === "true"}
              onCheckedChange={(checked) =>
                handleArgValueChange(
                  nodeData,
                  onNodeUpdate,
                  arg,
                  String(checked),
                )
              }
            />
            <span className="text-sm">
              {effective.value === true || effective.value === "true"
                ? "True"
                : "False"}
            </span>
          </div>
        );

      case "int":
        return (
          <Input
            type="number"
            step="1"
            value={String(effective.value || "")}
            onChange={(e) => {
              const val =
                e.target.value === "" ? "" : parseInt(e.target.value) || 0;
              handleArgValueChange(nodeData, onNodeUpdate, arg, String(val));
            }}
            placeholder="Enter integer value"
            className="text-sm h-10"
          />
        );

      case "float":
        return (
          <Input
            type="number"
            step="any"
            value={String(effective.value || "")}
            onChange={(e) =>
              handleArgValueChange(nodeData, onNodeUpdate, arg, e.target.value)
            }
            placeholder="Enter decimal value"
            className="text-sm h-10"
          />
        );

      case "dict":
      case "list":
        const currentValue =
          localValues[arg.name] !== undefined
            ? localValues[arg.name]
            : valueToString(effective.value);

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">JSON {dataType.toUpperCase()}:</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const valueToClean =
                    localValues[arg.name] !== undefined
                      ? localValues[arg.name]
                      : valueToString(effective.value);
                  handleJsonClean(arg.name, valueToClean);
                }}
                className="h-7 px-2 text-xs"
              >
                <Zap className="h-3 w-3" />
                Clean JSON
              </Button>
            </div>
            <Textarea
              value={currentValue}
              onChange={(e) => {
                setLocalValues((prev) => ({
                  ...prev,
                  [arg.name]: e.target.value,
                }));
              }}
              onBlur={(e) => {
                handleArgValueChange(
                  nodeData,
                  onNodeUpdate,
                  arg,
                  e.target.value,
                );
                validateJsonOnBlur(arg.name, e.target.value);
                // Clear local state after committing to node
                setLocalValues((prev) => {
                  const newState = { ...prev };
                  delete newState[arg.name];
                  return newState;
                });
              }}
              placeholder={
                dataType === "dict"
                  ? '{\n  "key": "value"\n}'
                  : '[\n  "item1",\n  "item2"\n]'
              }
              className="text-sm font-mono resize-y"
              rows={8}
            />
            {currentError && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                {currentError}
              </div>
            )}
          </div>
        );

      case "str":
      case "url":
      default:
        return (
          <div className="space-y-2">
            <Label className="text-xs">Text value:</Label>
            <Textarea
              value={String(effective.value || "")}
              onChange={(e) =>
                handleArgValueChange(
                  nodeData,
                  onNodeUpdate,
                  arg,
                  e.target.value,
                )
              }
              placeholder={
                dataType === "url" ? "https://example.com" : "Enter text value"
              }
              className="text-sm resize-y"
              rows={3}
            />
          </div>
        );
    }
  };

  const renderArgument = (arg: any) => {
    const argOverrides = asArgumentOverrides(nodeData.arg_overrides);
    const argMapping = asArgumentMappings(nodeData.arg_mapping);
    const effective = getEffectiveArgValue(arg, argOverrides);
    const mappings = getBrokerMappingsForArg(nodeData, arg.name);

    return (
      <Card key={arg.name} className="border-border">
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm">{arg.name}</h4>
                <Badge variant="outline" className="text-xs">
                  {arg.data_type}
                </Badge>
                {arg.required && (
                  <Badge variant="destructive" className="text-xs">
                    Required
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Option 1: Direct Value */}
              <div className="space-y-3 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    Option 1: Direct Value
                  </span>
                  <Checkbox
                    checked={effective.ready}
                    onCheckedChange={(checked) =>
                      updateArgOverride(
                        nodeData,
                        onNodeUpdate,
                        arg.name,
                        "ready",
                        !!checked,
                      )
                    }
                  />
                </div>

                {renderValueInput(arg, effective)}

                {effective.ready && (
                  <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                    ✓ Ready - will use this value
                  </div>
                )}
              </div>

              {/* Option 2: Broker Mapping */}
              <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Option 2: Broker Mapping
                  </span>
                  <Button
                    onClick={() =>
                      addBrokerMapping(nodeData, onNodeUpdate, arg.name)
                    }
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                  >
                    <Plus className="h-3 w-3" />
                    Map
                  </Button>
                </div>

                {mappings.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Broker sources:</Label>
                    {mappings.map((mapping, mappingIndex) => {
                      const idx = argMapping.findIndex(
                        (m) =>
                          m.source_broker_id === mapping.source_broker_id &&
                          m.target_arg_name === mapping.target_arg_name,
                      );
                      const globalIndex = idx >= 0 ? idx : 0;

                      return (
                        <DeleteInput
                          key={mappingIndex}
                          value={mapping.source_broker_id}
                          onChange={(e) =>
                            updateBrokerMapping(
                              nodeData,
                              onNodeUpdate,
                              globalIndex,
                              e.target.value,
                            )
                          }
                          placeholder="Enter broker ID"
                          className="font-mono text-sm h-10"
                          onDelete={() =>
                            removeBrokerMapping(
                              nodeData,
                              onNodeUpdate,
                              globalIndex,
                            )
                          }
                        />
                      );
                    })}
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                      ✓ Mapped - will get value at runtime
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded">
                    No brokers mapped. Click "Map" to add a broker source.
                  </div>
                )}
              </div>
            </div>

            {/* Status indicator for required args */}
            {arg.required && (
              <div className="pt-3 border-t border-border">
                {effective.ready || mappings.length > 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Required argument satisfied
                  </div>
                ) : effective.value &&
                  effective.value !== "" &&
                  !effective.ready &&
                  mappings.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Value provided but not marked as 'ready' - won't be used in
                    workflow
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Required argument needs either a value OR broker mapping
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-4">
      {/* Required Arguments */}
      {requiredArgs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Required Arguments
            </h3>
            <Badge variant="destructive" className="text-xs">
              Must be configured
            </Badge>
          </div>
          <div className="space-y-4">{requiredArgs.map(renderArgument)}</div>
        </div>
      )}

      {/* Optional Arguments */}
      {optionalArgs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Optional Arguments
            </h3>
            <Badge variant="secondary" className="text-xs">
              Can be left empty
            </Badge>
          </div>
          <div className="space-y-4">{optionalArgs.map(renderArgument)}</div>
        </div>
      )}

      {/* Help section */}
      <Card className="bg-muted/30 border-muted">
        <CardContent className="p-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Data Type Guide:
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                • <strong>str/url:</strong> Text values
              </div>
              <div>
                • <strong>int:</strong> Whole numbers (1, 42, -10)
              </div>
              <div>
                • <strong>float:</strong> Decimal numbers (3.14, -0.5)
              </div>
              <div>
                • <strong>bool:</strong> True/False values
              </div>
              <div>
                • <strong>dict:</strong> JSON objects {"{"}"key": "value"{"}"}
              </div>
              <div>
                • <strong>list:</strong> JSON arrays ["item1", "item2"]
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Use the "Clean JSON" button to automatically format and validate
              dict/list values.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ArgumentsTab;
