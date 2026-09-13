"use client";

import { useState } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { TrashTapButton } from "@ai-matrx/tap-target/buttons";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import type { AiApi, AiEndpoint, AiModel, AiOffering } from "../../types";
import {
  ProviderPriceCell,
  type ProviderPriceField,
} from "../ProviderPriceCell";

interface OfferingTableProps {
  offerings: AiOffering[];
  models: AiModel[];
  endpoints: AiEndpoint[];
  apis: AiApi[];
  loading: boolean;
  onSelect: (offering: AiOffering) => void;
  onDelete: (offering: AiOffering) => void;
  onCreate: () => void;
  onRetry: () => void;
}

function ProviderModelIdCell({ value }: { value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center">
      <code className="min-w-0 truncate font-mono text-xs">{value}</code>
      <CopyButton content={value} size="xs" tooltip="Copy provider model ID" />
    </span>
  );
}

function OfferingRowActions({
  offering,
  modelName,
  endpointName,
  onDelete,
}: {
  offering: AiOffering;
  modelName: string | null;
  endpointName: string;
  onDelete: (offering: AiOffering) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <>
      <TrashTapButton
        variant="solid"
        bgColor="bg-destructive/10"
        iconColor="text-destructive"
        hoverBgColor="hover:bg-destructive/20"
        activeBgColor="active:bg-destructive/25"
        ariaLabel={`Delete offering for ${endpointName}`}
        tooltip="Delete offering"
        onClick={() => setPendingDelete(true)}
      />
      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offering?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the <strong>{endpointName}</strong> offering for{" "}
              <strong>
                <AiModelRef
                  modelId={offering.model_id}
                  name={modelName}
                  showId
                  showIcon={false}
                  disableNavigation
                />
              </strong>
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onDelete(offering);
                setPendingDelete(false);
              }}
            >
              Delete Offering
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function OfferingTable({
  offerings,
  models,
  endpoints,
  apis,
  loading,
  onSelect,
  onDelete,
  onCreate,
  onRetry,
}: OfferingTableProps) {
  const modelName = (id: string) => {
    const model = models.find((item) => item.id === id);
    return model?.common_name || model?.name || `Unknown AI model (${id})`;
  };
  const resolvedModelName = (id: string) => {
    const model = models.find((item) => item.id === id);
    return model?.common_name || model?.name || null;
  };
  const endpointName = (id: string) => {
    const endpoint = endpoints.find((item) => item.id === id);
    return endpoint?.display_name || id;
  };
  const apiName = (id: string) => {
    const api = apis.find((item) => item.id === id);
    return api?.display_name || id;
  };
  const priceFor = (offering: AiOffering, field: ProviderPriceField) =>
    offering.pricing[0]?.[field] ?? null;
  const pricingUsageBasisFor = (offering: AiOffering) =>
    offering.pricing[0]?.usage_basis ?? offering.usage_basis;

  const columns: MatrxColumnDef<AiOffering>[] = [
    {
      id: "model",
      header: "Model",
      label: "Model",
      accessorFn: (offering) => modelName(offering.model_id),
      width: 180,
      cell: (offering) => (
        <AiModelRef
          modelId={offering.model_id}
          name={resolvedModelName(offering.model_id)}
          showId
          showIcon={false}
        />
      ),
    },
    {
      id: "endpoint",
      header: "Endpoint",
      label: "Endpoint",
      accessorFn: (offering) => endpointName(offering.endpoint_id),
      width: 150,
    },
    {
      id: "api",
      header: "API",
      label: "API",
      accessorFn: (offering) => apiName(offering.api_id),
      width: 150,
    },
    {
      accessorKey: "provider_model_id",
      header: "Provider Model ID",
      width: 220,
      cell: (offering) => (
        <ProviderModelIdCell value={offering.provider_model_id} />
      ),
    },
    {
      accessorKey: "priority",
      header: "Priority",
      width: 90,
      cell: (offering) => (
        <span className="block text-right font-mono text-xs tabular-nums">
          {offering.priority}
        </span>
      ),
    },
    {
      id: "input_price",
      header: "Input Price",
      accessorFn: (offering) => priceFor(offering, "input_price"),
      width: 140,
      cell: (offering) => (
        <ProviderPriceCell
          value={priceFor(offering, "input_price")}
          usageBasis={pricingUsageBasisFor(offering)}
          field="input_price"
        />
      ),
    },
    {
      id: "cached_input_price",
      header: "Cached Input",
      accessorFn: (offering) => priceFor(offering, "cached_input_price"),
      width: 150,
      cell: (offering) => (
        <ProviderPriceCell
          value={priceFor(offering, "cached_input_price")}
          usageBasis={pricingUsageBasisFor(offering)}
          field="cached_input_price"
        />
      ),
    },
    {
      id: "output_price",
      header: "Output Price",
      accessorFn: (offering) => priceFor(offering, "output_price"),
      width: 140,
      cell: (offering) => (
        <ProviderPriceCell
          value={priceFor(offering, "output_price")}
          usageBasis={pricingUsageBasisFor(offering)}
          field="output_price"
        />
      ),
    },
    {
      id: "is_available",
      header: "Available",
      accessorFn: (offering) => (offering.is_available ? "Yes" : "No"),
      width: 100,
      cell: (offering) => (
        <Badge
          variant="outline"
          className={
            offering.is_available
              ? "border-green-300 bg-green-50 text-[10px] text-green-700 dark:bg-green-900/20 dark:text-green-300"
              : "bg-muted text-[10px] text-muted-foreground"
          }
        >
          {offering.is_available ? "Available" : "Unavailable"}
        </Badge>
      ),
    },
    {
      id: "usage_basis",
      header: "Usage Basis",
      accessorFn: (offering) => offering.usage_basis ?? "",
      width: 120,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MatrxDataTable<AiOffering>
        data={offerings}
        columns={columns}
        getRowId={(offering) => offering.id}
        isLoading={loading && offerings.length === 0}
        isFetching={loading && offerings.length > 0}
        pageSize={25}
        pageSizeOptions={[10, 25, 50, 100]}
        localPagination={{ mode: "progressive" }}
        defaultSort={{ id: "priority", direction: "asc" }}
        detail={{ enabled: false }}
        onRowOpen={onSelect}
        tableId="ai/offerings"
        emptyState={{ title: "No offerings yet." }}
        toolbar={{
          title: "AI Offerings",
          refresh: { onRefresh: onRetry },
          add: { onAdd: onCreate },
        }}
        copy={{
          label: "AI offering",
          listLabel: "AI offerings",
          location: "AI model administration",
          rowKind: "ai_offering",
          listKind: "ai_offerings",
          humanRow: (offering) =>
            `${modelName(offering.model_id)} via ${endpointName(offering.endpoint_id)} (${offering.provider_model_id})`,
          agentRow: (offering) => offering,
        }}
        rowActions={(offering) => (
          <OfferingRowActions
            offering={offering}
            modelName={resolvedModelName(offering.model_id)}
            endpointName={endpointName(offering.endpoint_id)}
            onDelete={onDelete}
          />
        )}
      />
    </div>
  );
}
