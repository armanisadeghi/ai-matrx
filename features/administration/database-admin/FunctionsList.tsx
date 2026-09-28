import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { ViewTapButton } from "@ai-matrx/tap-target/buttons";
import { databaseFunctionSignature, type DatabaseFunction } from "./types";
import { readOf } from "@/components/read-state/ReadGate";

interface FunctionsListProps {
  functions: DatabaseFunction[];
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onViewDetails: (func: DatabaseFunction) => void;
}

function TruncatedSignature({
  value,
  width,
}: {
  value: string;
  width: string;
}) {
  if (!value) return <span className="font-mono text-xs">—</span>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`block ${width} truncate font-mono text-xs`}>
            {value}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-lg break-words font-mono text-xs">
          {value}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const FunctionsList = ({
  functions,
  loading,
  isRefreshing,
  error,
  onRefresh,
  onViewDetails,
}: FunctionsListProps) => {
  const columns: MatrxColumnDef<DatabaseFunction>[] = [
    {
      accessorKey: "name",
      header: "Function name",
      filter: "text",
      frozen: true,
      width: 220,
      cell: (func) => (
        <TruncatedSignature value={func.name} width="max-w-[13rem]" />
      ),
    },
    {
      accessorKey: "schema",
      header: "Schema",
      filter: "select",
      width: 140,
      cell: (func) => (
        <TruncatedSignature value={func.schema} width="max-w-[8rem]" />
      ),
    },
    {
      accessorKey: "security_type",
      header: "Security",
      filter: "select",
      width: 135,
      cell: (func) =>
        func.security_type === "SECURITY DEFINER" ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Definer
          </span>
        ) : (
          <span className="text-yellow-600 dark:text-yellow-400">Invoker</span>
        ),
    },
    {
      accessorKey: "arguments",
      header: "Arguments",
      filter: "text",
      width: 330,
      cell: (func) => (
        <TruncatedSignature value={func.arguments} width="max-w-[20rem]" />
      ),
    },
    {
      accessorKey: "returns",
      header: "Returns",
      filter: "text",
      width: 260,
      cell: (func) => (
        <TruncatedSignature value={func.returns} width="max-w-[16rem]" />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <MatrxDataTable
        tableId="administration/database/database-admin/functions"
        data={functions}
        columns={columns}
        getRowId={databaseFunctionSignature}
        searchText={databaseFunctionSignature}
        isLoading={loading && functions.length === 0}
        isFetching={isRefreshing}
        read={readOf({ loading, error }, { what: "the function catalog", onRetry: onRefresh })}
        density="condensed"
        stickyHeader
        copy={false}
        toolbar={{
          title: "Database Functions",
          search: true,
          searchPlaceholder: "Search functions…",
          refresh: { onRefresh },
        }}
        detail={{ enabled: false }}
        window={{ enabled: false }}
        coverage={{ noun: "database function", cap: 1000, answeredBy: "client" }}
        onRowOpen={onViewDetails}
        rowActions={(func) => (
          <ViewTapButton
            variant="transparent"
            ariaLabel={`View details for ${databaseFunctionSignature(func)}`}
            onClick={() => onViewDetails(func)}
          />
        )}
        emptyState={{ title: "No database functions found" }}
      />
    </div>
  );
};
