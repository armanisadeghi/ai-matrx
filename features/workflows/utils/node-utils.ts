import {
  DbFunctionNode,
  WorkflowNodePersistShape,
  ArgumentOverride,
  ArgumentMapping,
  WorkflowDependency,
  DbNodeData,
  isUserInputNode,
  isBrokerRelayNode,
  isBaseFunctionNode,
  DbUserInput,
  DbBrokerRelayData,
} from "@/features/workflows/types";
import { v4 as uuidv4 } from "uuid";
import { cloneDeep } from "lodash";
import {
  DEFAULT_EXCLUDE_ARG_NAMES,
  ALL_HIDDEN_CONNECTIONS,
  getRegisteredFunctions,
} from "@/features/workflows/react-flow/node-editor/workflow-node-editor/utils/arg-utils";
import { Connection } from "reactflow";

export function getNormalizedRegisteredFunctionNode(
  function_id: string,
  workflowId?: string,
): DbFunctionNode {
  const function_data = getRegisteredFunctions().find(
    (f) => f.id === function_id,
  );
  if (!function_data) {
    throw new Error(`Function with id ${function_id} not found`);
  }

  const arg_overrides: ArgumentOverride[] = function_data.args
    .filter((arg) => !DEFAULT_EXCLUDE_ARG_NAMES.includes(arg.name))
    .map((arg) => ({
      name: arg.name,
      default_value: cloneDeep(arg.default_value),
      ready: arg.ready,
      required: arg.required,
    }));

  const now = new Date().toISOString();
  const node = {
    id: uuidv4(),
    created_at: now,
    updated_at: now,
    function_id: function_data.id,
    function_type: "registered_function",
    step_name: `New ${function_data.name} Step`,
    execution_required: true,
    additional_dependencies: [],
    arg_mapping: [],
    return_broker_overrides: [function_data.return_broker],
    arg_overrides: arg_overrides,
    workflow_id: workflowId ?? null,
    status: "pending",
    node_type: "functionNode",
    user_id: null,
    metadata: {},
    is_public: null,
    public_read: null,
    ui_node_data: null,
  } as unknown as DbFunctionNode;
  return node;
}

export function validateNodeUpdate(node: WorkflowNodePersistShape): boolean {
  // Ensure function_id exists and is valid
  if (!node.function_id) {
    throw new Error("Node must have a valid function_id");
  }

  const functionData = getRegisteredFunctions().find(
    (f) => f.id === node.function_id,
  );
  if (!functionData) {
    throw new Error(`Function with id ${node.function_id} not found`);
  }

  // Get valid argument names from the registered function
  const validArgNames = new Set(functionData.args.map((arg) => arg.name));

  const argOverrides = node.arg_overrides as
    | ArgumentOverride[]
    | null
    | undefined;
  const argMapping = node.arg_mapping as ArgumentMapping[] | null | undefined;

  // Validate arg_overrides
  if (argOverrides) {
    for (const override of argOverrides) {
      if (!validArgNames.has(override.name)) {
        throw new Error(
          `Invalid argument override name: ${override.name}. Must be one of: ${Array.from(validArgNames).join(", ")}`,
        );
      }
      if (DEFAULT_EXCLUDE_ARG_NAMES.includes(override.name)) {
        throw new Error(
          `Argument override name '${override.name}' is in the excluded list and cannot be used`,
        );
      }
    }
  }

  // Validate arg_mapping
  if (argMapping) {
    for (const mapping of argMapping) {
      if (!validArgNames.has(mapping.target_arg_name)) {
        throw new Error(
          `Invalid argument mapping name: ${mapping.target_arg_name}. Must be one of: ${Array.from(validArgNames).join(", ")}`,
        );
      }
      if (DEFAULT_EXCLUDE_ARG_NAMES.includes(mapping.target_arg_name)) {
        throw new Error(
          `Argument mapping name '${mapping.target_arg_name}' is in the excluded list and cannot be used`,
        );
      }
    }
  }

  // Validate basic node structure
  if (node.function_type !== "registered_function") {
    throw new Error('Node function_type must be "registered_function"');
  }

  if (!node.id) {
    throw new Error("Node must have a valid id");
  }

  return true;
}

// Adds a broker mapping to a node for a specific argument
export function addBrokerMapping(
  node: DbFunctionNode,
  brokerId: string,
  argName: string,
): DbFunctionNode {
  if (!node.function_id) {
    throw new Error("Node must have a valid function_id");
  }

  const functionData = getRegisteredFunctions().find(
    (f) => f.id === node.function_id,
  );
  if (!functionData) {
    throw new Error(`Function with id ${node.function_id} not found`);
  }

  // Validate the argument name
  const validArgNames = new Set(functionData.args.map((arg) => arg.name));
  if (!validArgNames.has(argName)) {
    throw new Error(
      `Invalid argument name: ${argName}. Must be one of: ${Array.from(validArgNames).join(", ")}`,
    );
  }

  // Check if the argument is in the excluded list
  if (DEFAULT_EXCLUDE_ARG_NAMES.includes(argName)) {
    throw new Error(
      `Argument name '${argName}' is in the excluded list and cannot be used`,
    );
  }

  // Create a deep copy of the node to avoid mutating the original
  const updatedNode = cloneDeep(node);

  const rawArgMapping = updatedNode.arg_mapping as
    | ArgumentMapping[]
    | null
    | undefined;
  const mappings: ArgumentMapping[] = [...(rawArgMapping ?? [])];
  const existingMappingIndex = mappings.findIndex(
    (mapping) => mapping.target_arg_name === argName,
  );

  const newMapping: ArgumentMapping = {
    source_broker_id: brokerId,
    target_arg_name: argName,
  };

  if (existingMappingIndex !== -1) {
    mappings[existingMappingIndex] = newMapping;
  } else {
    mappings.push(newMapping);
  }
  updatedNode.arg_mapping = mappings as DbFunctionNode["arg_mapping"];

  // Validate the updated node
  validateNodeUpdate(updatedNode);

  return updatedNode;
}

export interface SelectOption {
  value: string; // The function ID
  label: string; // The function name
}

// Returns registered functions formatted as select component options
export function getRegisteredFunctionSelectOptions(): SelectOption[] {
  return getRegisteredFunctions().map((func) => ({
    value: func.id,
    label: func.name,
  }));
}

export function isNodeConnected(node: DbFunctionNode): boolean {
  if (!node) return false;
  const args = node.arg_overrides as ArgumentOverride[] | null | undefined;
  if (args === null || args === undefined) {
    return false;
  }

  const mappings =
    (node.arg_mapping as ArgumentMapping[] | null | undefined) ?? [];

  // Check each argument
  for (const arg of args) {
    // Skip if arg is not explicitly required
    if (arg.required !== true) {
      continue;
    }

    // If arg is ready, it's satisfied
    if (arg.ready) {
      continue;
    }

    // If arg is not ready, check for a valid mapping
    const mapping = mappings.find((m) => m.target_arg_name === arg.name);

    // If no mapping exists or mapping has no valid source_broker_id, return false
    if (!mapping || !mapping.source_broker_id) {
      return false;
    }
  }

  // All arguments are either ready or have valid mappings
  return true;
}

export interface Input {
  id: string;
  label: string;
  type: "direct_broker" | "argument" | "dependency" | "arg_mapping";
  node_id?: string;
  handleId?: string;
}

export interface Output {
  id: string;
  label: string;
  type:
    | "direct_broker"
    | "dependency"
    | "return_broker"
    | "modified_return_broker";
  node_id?: string;
  handleId?: string;
}

export interface MatrxEdge {
  source: Output;
  target: Input;
}

/**
 * Formats an input identifier into a human-readable label.
 * First checks for known broker data, then falls back to parsing logic.
 * For argument names, converts from snake_case/SNAKE_CASE/kabob-case to Title Case.
 * For broker IDs with UUID_text pattern, extracts and formats the text part.
 * Shows UUID directly if it's a plain UUID with no additional text.
 */
function formatInputLabel(inputId: string, fallbackLabel?: string): string {
  // If we have a fallback label, use it
  if (fallbackLabel && fallbackLabel !== inputId) {
    return fallbackLabel;
  }

  // Check for known broker data first
  const enrichedBrokers = (window as any).workflowEnrichedBrokers || [];
  const broker = enrichedBrokers?.find((b: any) => b.id === inputId);
  const knownBrokerName = broker?.knownBrokerData?.name;
  if (knownBrokerName) {
    return knownBrokerName;
  }

  // Check if it's a plain UUID (pattern: 8-4-4-4-12 hexadecimal digits)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(inputId)) {
    return inputId;
  }

  // Check if it's a UUID followed by underscore and text (UUID_text pattern)
  const uuidWithTextPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_(.+)$/i;
  const uuidMatch = inputId.match(uuidWithTextPattern);
  if (uuidMatch) {
    // Extract the part after the UUID and underscore
    const namePart = uuidMatch[1];
    const formatted = namePart
      .replace(/[-_]/g, " ") // Replace hyphens and underscores with spaces
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    return formatted || inputId;
  }

  // For regular argument names, convert snake_case/SNAKE_CASE/kabob-case to Title Case
  const formatted = inputId
    .replace(/[-_]/g, " ") // Replace hyphens and underscores with spaces
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return formatted || inputId;
}

export function getNodePotentialInputs(node: DbFunctionNode): Input[] {
  const inputs: Input[] = [];
  const dependencies =
    (node.additional_dependencies as WorkflowDependency[] | null | undefined) ??
    [];
  const argMappings =
    (node.arg_mapping as ArgumentMapping[] | null | undefined) ?? [];
  const argOverrides =
    (node.arg_overrides as ArgumentOverride[] | null | undefined) ?? [];

  // Process dependencies
  dependencies.forEach((dep) => {
    if (dep.source_broker_id) {
      inputs.push({
        id: dep.source_broker_id,
        label: formatInputLabel(dep.source_broker_id, dep.source_broker_name),
        type: "dependency",
        handleId: `input--dependency--${dep.source_broker_id}`,
      });
    }
  });

  // Process argument mappings
  argMappings.forEach((mapping) => {
    if (mapping.source_broker_id && mapping.target_arg_name) {
      inputs.push({
        id: mapping.source_broker_id,
        label: formatInputLabel(mapping.target_arg_name),
        type: "arg_mapping",
        handleId: `input--arg_mapping--${mapping.source_broker_id}`,
      });
    }
  });

  argOverrides.forEach((arg) => {
    const argName = arg.name;
    if (
      !inputs.some((input) => input.label === formatInputLabel(argName)) &&
      !ALL_HIDDEN_CONNECTIONS.includes(argName)
    ) {
      inputs.push({
        id: argName,
        label: formatInputLabel(argName),
        type: "argument",
        handleId: `input--argument--${argName}`,
      });
    }
  });

  return inputs;
}

/**
 * Formats a broker ID into a human-readable label.
 * First checks for known broker data, then falls back to parsing logic.
 * Extracts text after the first underscore and converts from snake_case/SNAKE_CASE/kabob-case to Title Case.
 * Shows UUID directly if it's a valid UUID with no additional text.
 * Falls back to "Result {index + 1}" if no underscore or invalid pattern.
 */
function formatBrokerLabel(brokerId: string, index: number): string {
  // Check for known broker data first
  const enrichedBrokers = (window as any).workflowEnrichedBrokers || [];
  const broker = enrichedBrokers?.find((b: any) => b.id === brokerId);
  const knownBrokerName = broker?.knownBrokerData?.name;
  if (knownBrokerName) {
    return knownBrokerName;
  }

  // Check if the broker ID contains an underscore
  const underscoreIndex = brokerId.indexOf("_");
  if (underscoreIndex === -1) {
    // Check if it's a UUID (pattern: 8-4-4-4-12 hexadecimal digits)
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(brokerId)) {
      return brokerId;
    }
    return `Result ${index + 1}`;
  }

  // Extract the part after the first underscore
  const namePart = brokerId.substring(underscoreIndex + 1);

  // If the name part is empty, fall back to default
  if (!namePart.trim()) {
    return `Result ${index + 1}`;
  }

  // Convert snake_case, SNAKE_CASE, and kabob-case to Title Case
  const formatted = namePart
    .replace(/[-_]/g, " ") // Replace hyphens and underscores with spaces
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return formatted || `Result ${index + 1}`;
}

export function getNodePotentialOutputs(node: DbFunctionNode): Output[] {
  const outputs: Output[] = [];
  const dependencies =
    (node.additional_dependencies as WorkflowDependency[] | null | undefined) ??
    [];
  const returnBrokers =
    (node.return_broker_overrides as string[] | null | undefined) ?? [];

  // Process workflow dependencies
  dependencies.forEach((dep) => {
    if (dep.target_broker_id) {
      outputs.push({
        id: dep.target_broker_id,
        label: dep.target_broker_name || dep.target_broker_id,
        type: "dependency",
        handleId: `input--dependency--${dep.target_broker_id}`,
      });
    }
  });

  // Process return broker overrides
  returnBrokers.forEach((brokerId, index) => {
    outputs.push({
      id: brokerId,
      label: formatBrokerLabel(brokerId, index),
      type: "return_broker",
      handleId: `output--return_broker--${brokerId}`,
    });
  });
  return outputs;
}

export function getNodePotentialInputsAndOutputs(
  node: DbNodeData,
  type: string,
): { inputs: Input[]; outputs: Output[] } {
  if (type === "userInput") {
    const userInputData = node as DbUserInput;
    return {
      inputs: [],
      outputs: [
        {
          id: userInputData.broker_id,
          label: userInputData.label,
          type: "direct_broker",
          handleId: `output--direct_broker--${userInputData.broker_id}`,
        },
      ],
    };
  }

  if (type === "brokerRelay") {
    const brokerRelayData = node as DbBrokerRelayData;
    return {
      inputs: [
        {
          id: brokerRelayData.source_broker_id,
          label: formatInputLabel(brokerRelayData.source_broker_id),
          type: "direct_broker",
          handleId: `input--direct_broker--${brokerRelayData.source_broker_id}`,
        },
      ],
      outputs: (Array.isArray(brokerRelayData.target_broker_ids)
        ? (brokerRelayData.target_broker_ids as string[])
        : []
      ).map((brokerId) => ({
        id: brokerId,
        label: formatInputLabel(brokerId),
        type: "direct_broker",
        handleId: `output--direct_broker--${brokerId}`,
      })),
    };
  } else if (
    type === "workflowNode" ||
    type === "functionNode" ||
    type === "recipeNode" ||
    type === "registeredFunction"
  ) {
    const functionNodeData = node as DbFunctionNode;
    return {
      inputs: getNodePotentialInputs(functionNodeData),
      outputs: getNodePotentialOutputs(functionNodeData),
    };
  } else {
    console.error(`Invalid node type: ${JSON.stringify(node, null, 2)}`);
    return {
      inputs: [],
      outputs: [],
    };
  }
}

export interface NodeWithInputsAndOutputs extends DbFunctionNode {
  inputs: Input[];
  outputs: Output[];
}

export function getNodeWithInputsAndOutputs(
  node: DbFunctionNode,
): NodeWithInputsAndOutputs {
  return {
    ...node,
    inputs: getNodePotentialInputs(node),
    outputs: getNodePotentialOutputs(node),
  };
}

export function parseEdge(data: Connection): MatrxEdge {
  const sourceParts = data.sourceHandle.split("--");
  const targetParts = data.targetHandle.split("--");

  if (sourceParts.length !== 3 || targetParts.length !== 3) {
    throw new Error("Invalid handle format");
  }

  const [, sourceLabel, sourceId] = sourceParts;
  const [, targetLabel, targetId] = targetParts;

  return {
    source: {
      id: sourceId,
      label: sourceLabel,
      type: sourceLabel as Output["type"],
      handleId: data.sourceHandle,
      node_id: data.source,
    },
    target: {
      id: targetId,
      label: targetLabel,
      type: targetLabel as Input["type"],
      handleId: data.targetHandle,
      node_id: data.target,
    },
  };
}
