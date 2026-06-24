// @ts-nocheck

"use client";

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { workflowNodesSelectors } from "@/lib/redux/workflow-nodes/selectors";
import { SectionContainer } from "@/features/workflows-xyflow/common/SectionContainer";
import {
  SectionTable,
  type TableRowData,
} from "@/features/workflows-xyflow/common/SectionTable";
import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toTitleCase } from "@/utils/dataUtils";
import { RegisteredNodeData } from "@/types/AutomationSchemaTypes";
import {
  useNodeCategoryWithFetch,
  useRegisteredNodeWithFetch,
} from "@/lib/redux/entity/hooks/entityUsedHooks";
import { DynamicIcon } from "@/components/official/icons/IconResolver";

interface NodeDefinitionTabProps {
  nodeId: string;
}

const NodeDefinitionTab: React.FC<NodeDefinitionTabProps> = ({ nodeId }) => {
  const nodeData = useAppSelector((state) =>
    workflowNodesSelectors.nodeById(state, nodeId),
  );
  const categoryHook = useNodeCategoryWithFetch();
  const registeredNodeHook = useRegisteredNodeWithFetch();
  const registeredNodeRecords = registeredNodeHook.registeredNodeRecordsById;
  const nodeDefinition =
    registeredNodeRecords[nodeData.metadata?.nodeDefinitionId];

  const categoryRecords = categoryHook.nodeCategoryRecordsById;

  const categoryRecord = categoryRecords[nodeDefinition?.category || "unknown"];
  const categoryName = categoryRecord?.name;

  if (!nodeDefinition) {
    return (
      <div className="text-muted-foreground">Node Definition not found</div>
    );
  }

  // Core information rows
  const coreInfoRows: TableRowData[] = [
    {
      key: "id",
      label: "ID",
      content: (
        <code className="px-2 py-1 rounded text-xs font-mono break-all">
          {nodeDefinition.id}
        </code>
      ),
    },
    {
      key: "name",
      label: "Name",
      content: <span className="font-medium">{nodeDefinition.name}</span>,
    },
    {
      key: "description",
      label: "Description",
      content: (
        <span className="text-sm text-muted-foreground">
          {nodeDefinition.description || "No description"}
        </span>
      ),
    },
    {
      key: "icon",
      label: "Icon",
      content: (
        <DynamicIcon
          name={nodeDefinition.icon}
          color={nodeDefinition.color}
          size={6}
        />
      ),
    },
    {
      key: "color",
      label: "Color",
      content: (
        <Badge variant="outline" className="text-xs">
          {nodeDefinition.color || "None"}
        </Badge>
      ),
    },
    {
      key: "nodeType",
      label: "Node Type",
      content: (
        <Badge variant="secondary" className="text-xs">
          {nodeDefinition.nodeType}
        </Badge>
      ),
    },
    {
      key: "isActive",
      label: "Active",
      content: (
        <Badge
          variant={nodeDefinition.isActive ? "default" : "destructive"}
          className="text-xs"
        >
          {nodeDefinition.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "category",
      label: "Category",
      content: (
        <div className="flex items-center gap-2">
          {categoryRecord?.icon && (
            <DynamicIcon
              name={categoryRecord.icon}
              color={categoryRecord.color}
              size={4}
            />
          )}
          <span className="font-medium">
            {categoryName || "Unknown Category"}
          </span>
        </div>
      ),
    },
  ];

  // Get arrays for tables
  const inputs = (nodeDefinition.inputs || []) as any[];
  const outputs = (nodeDefinition.outputs || []) as any[];
  const args = (nodeDefinition.arguments || []) as any[];
  const dependencies = (nodeDefinition.dependencies || []) as any[];
  const customTabs = ((nodeDefinition.customEditor?.editor as any)
    ?.custom_tabs || []) as any[];

  return (
    <div className="h-full overflow-auto pr-2 space-y-6">
      {/* Core Information */}
      <SectionTable title="Core Information" rows={coreInfoRows} />

      {/* Inputs */}
      <SectionTable
        title="Inputs"
        headers={["Name", "ID", "Type", "Data Type", "Required", "Component"]}
        data={inputs}
        renderRow={(input, index) => (
          <>
            <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
              {toTitleCase(input.name)}
            </TableCell>
            <TableCell className="font-medium text-[10px] w-96 border-r border-border dark:border-border">
              <code className="px-2 py-1 rounded text-xs font-mono break-all">
                {input.id}
              </code>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge variant="outline" className="text-xs">
                {input.input_type}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge variant="secondary" className="text-xs">
                {input.data_type}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge
                variant={input.required ? "destructive" : "secondary"}
                className="text-xs"
              >
                {input.required ? "Required" : "Optional"}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-xs">
              {input.component}
            </TableCell>
          </>
        )}
        emptyMessage="No inputs defined"
      />

      {/* Outputs */}
      <SectionTable
        title="Outputs"
        headers={["Name", "Broker ID", "Data Type", "Output Type", "Component"]}
        data={outputs}
        renderRow={(output, index) => (
          <>
            <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
              {toTitleCase(output.name)}
            </TableCell>
            <TableCell className="font-medium text-[10px] w-96 border-r border-border dark:border-border">
              <code className="px-2 py-1 rounded text-xs font-mono break-all">
                {output.broker_id}
              </code>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge variant="secondary" className="text-xs">
                {output.data_type}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-32 border-r border-border dark:border-border">
              <Badge variant="outline" className="text-xs">
                {output.output_type}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-xs">
              {output.component}
            </TableCell>
          </>
        )}
        emptyMessage="No outputs defined"
      />

      {/* Arguments */}
      <SectionTable
        title="Arguments"
        headers={[
          "Name",
          "Data Type",
          "Required",
          "Managed",
          "Ready",
          "Default Value",
        ]}
        data={args}
        renderRow={(argument, index) => (
          <>
            <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
              {toTitleCase(argument.name)}
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge variant="secondary" className="text-xs">
                {argument.data_type}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge
                variant={argument.required ? "destructive" : "secondary"}
                className="text-xs"
              >
                {argument.required ? "Required" : "Optional"}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-24 border-r border-border dark:border-border">
              <Badge
                variant={argument.managed ? "default" : "outline"}
                className="text-xs"
              >
                {argument.managed ? "Managed" : "Unmanaged"}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-center text-xs w-36 border-r border-border dark:border-border">
              <Badge
                variant={argument.ready ? "default" : "destructive"}
                className="text-xs"
              >
                {argument.ready ? "Ready" : "Not Ready"}
              </Badge>
            </TableCell>
            <TableCell className="font-medium text-xs">
              {argument.default_value?.value !== null ? (
                <Badge
                  variant="secondary"
                  className="text-xs font-mono bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                >
                  {JSON.stringify(argument.default_value.value)}
                </Badge>
              ) : (
                <code className="px-2 py-1 rounded text-xs font-mono text-muted-foreground">
                  null
                </code>
              )}
            </TableCell>
          </>
        )}
        emptyMessage="No arguments defined"
      />

      {/* Custom Editor Tabs */}
      {customTabs.length > 0 && (
        <SectionTable
          title="Custom Editor Tabs"
          headers={["Label", "ID", "Order", "Component", "Replaces"]}
          data={customTabs}
          renderRow={(tab, index) => (
            <>
              <TableCell className="font-medium text-sm w-48 border-r border-border dark:border-border">
                {tab.label}
              </TableCell>
              <TableCell className="font-medium text-xs w-32 border-r border-border dark:border-border">
                <code className="px-2 py-1 rounded text-xs font-mono">
                  {tab.id}
                </code>
              </TableCell>
              <TableCell className="font-medium text-center text-xs w-16 border-r border-border dark:border-border">
                <Badge variant="outline" className="text-xs">
                  {tab.order}
                </Badge>
              </TableCell>
              <TableCell className="font-medium text-xs w-48 border-r border-border dark:border-border">
                {tab.component}
              </TableCell>
              <TableCell className="font-medium text-xs">
                {tab.replaces || "None"}
              </TableCell>
            </>
          )}
          emptyMessage="No custom tabs defined"
        />
      )}

      {/* Dependencies */}
      {dependencies.length > 0 && (
        <SectionTable
          title="Dependencies"
          headers={["Dependency"]}
          data={dependencies}
          renderRow={(dependency, index) => (
            <TableCell className="font-medium text-sm">
              <code className="px-2 py-1 rounded text-xs font-mono break-all">
                {dependency}
              </code>
            </TableCell>
          )}
          emptyMessage="No dependencies defined"
        />
      )}

      {/* Function Description */}
      {nodeDefinition.functionDescription && (
        <SectionContainer title="Function Description">
          <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto whitespace-pre-wrap font-mono">
            {nodeDefinition.functionDescription}
          </pre>
        </SectionContainer>
      )}

      {/* Full JSON Definition */}
      <SectionContainer title="Full JSON Definition">
        <pre className="bg-muted p-4 rounded-lg text-sm overflow-auto h-full">
          {JSON.stringify(nodeDefinition, null, 2)}
        </pre>
      </SectionContainer>
    </div>
  );
};

export default NodeDefinitionTab;
