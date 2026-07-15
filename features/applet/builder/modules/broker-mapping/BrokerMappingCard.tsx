"use client";

import React, { useEffect, useState } from "react";
import SectionCard from "@/components/official/cards/SectionCard";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import {
  selectFieldLoading,
  selectActiveFieldId,
  selectFieldsHasFetched,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { Broker, BrokerMapping } from "@/types/customAppTypes";
import { fetchFieldsThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import FieldListTable from "@/features/applet/builder/modules/field-builder/FieldListTable";
import { LoadingSpinner } from "@/components/ui/spinner";
import EmptyStateCard from "@/components/official/cards/EmptyStateCard";
import {
  CheckCircle2,
  LocateOff,
  Variable,
  Plus,
  ListFilter,
  X,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { addBrokerMapping } from "@/lib/redux/app-builder/slices/appletBuilderSlice";
import FieldEditor from "../field-builder/editor/FieldEditor";
import { setActiveField } from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import {
  selectFieldLabelByBrokerId,
  selectIsBrokerMapped,
} from "@/lib/redux/app-builder/selectors/appletSelectors";

interface BrokerMappingCardProps {
  selectedBroker: Broker | null;
  appletId: string;
  onMappingCreated: (mapping: BrokerMapping) => void;
}

const BrokerMappingCard = ({
  selectedBroker,
  appletId,
  onMappingCreated,
}: BrokerMappingCardProps) => {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector(selectFieldLoading);
  const hasFetched = useAppSelector(selectFieldsHasFetched);
  const [mode, setMode] = useState<"create" | "edit" | "list">("list");
  const isMappingComplete = useAppSelector((state) =>
    selectedBroker
      ? selectIsBrokerMapped(state, appletId, selectedBroker.id)
      : false,
  );
  const fieldLabel = useAppSelector((state) =>
    selectedBroker
      ? selectFieldLabelByBrokerId(state, appletId, selectedBroker.id)
      : null,
  );

  const activeFieldId = useAppSelector(selectActiveFieldId);

  useEffect(() => {
    if (!hasFetched && !isLoading) {
      dispatch(fetchFieldsThunk());
    }
  }, [dispatch, hasFetched, isLoading]);

  // Create mapping between broker and field
  const handleCreateMapping = (id: string) => {
    if (!selectedBroker) return;
    const mapping: BrokerMapping = {
      appletId: appletId,
      fieldId: id,
      brokerId: selectedBroker.id,
    };

    dispatch(addBrokerMapping({ id: appletId, brokerMapping: mapping }));

    onMappingCreated(mapping);
    setMode("list");
  };

  const handleCreateField = () => {
    setMode("create");
  };

  const handleCancel = () => {
    setMode("list");
  };

  const handleFieldEdit = (id: string) => {
    if (id && id !== activeFieldId) {
      dispatch(setActiveField(id));
    }
    setMode("edit");
  };

  if (!selectedBroker) {
    return (
      <EmptyStateCard
        title="Broker & Field Mapping"
        description="Select a broker from the list of Needed Brokers."
        icon={Variable}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24">
        <LoadingSpinner />
      </div>
    );
  }

  const getDescription = () => {
    return (
      <div className="flex flex-col mb-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {isMappingComplete ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Mapping Complete:{" "}
                  <span className="mx-1 text-green-600 dark:text-green-400">
                    {selectedBroker.name}
                  </span>{" "}
                  <ArrowRight className="inline w-5 h-5 mx-1 text-blue-600 dark:text-blue-400" />{" "}
                  <span className="text-green-600 dark:text-green-400">
                    {fieldLabel}
                  </span>
                </span>
              </>
            ) : (
              <>
                <LocateOff className="w-5 h-5 text-gray-400 mr-2" />
                <span className="text-sm font-medium text-gray-400">
                  Please select or create a field for{" "}
                  <span className="text-purple-600 dark:text-purple-400">
                    {selectedBroker.name}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <SectionCard
        title="Broker Mapping"
        descriptionNode={getDescription()}
        color="gray"
        minHeight="640px"
        scrollable={true}
      >
        <div
          className={cn(
            "bg-transparent mt-4",
            isMappingComplete && "border-blue-300 dark:border-blue-700",
          )}
        >
          {/* Field Dropdown */}
          <div className="space-y-3">
            {(mode === "create" || mode === "edit") && (
              <FieldEditor
                key={selectedBroker.id}
                fieldId={activeFieldId ?? undefined}
                isCreatingNew={mode === "create"}
                onSaveSuccess={handleCreateMapping}
                onCancel={handleCancel}
                broker={selectedBroker}
                showBackButton={mode === "edit"}
              />
            )}
            {mode === "list" && (
              <FieldListTable
                onFieldSelect={handleCreateMapping}
                onFieldEdit={handleFieldEdit}
                onFieldCreate={handleCreateField}
              />
            )}
          </div>
        </div>
      </SectionCard>
    </>
  );
};

export default BrokerMappingCard;
