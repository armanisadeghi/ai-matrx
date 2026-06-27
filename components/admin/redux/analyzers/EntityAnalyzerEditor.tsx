import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { EntityData, EntityKeys } from "@/types/entityTypes";
import { selectFormattedEntityOptions } from "@/lib/redux/schema/globalCacheSelectors";
import { createEntitySelectors } from "@/lib/redux/entity/selectors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { UniversalJsonGroup } from "@/components/ui/JsonComponents/UniversalJsonGroup";
import { MatrxRecordId } from "@/types/records";
import { getEntitySlice } from "@/lib/redux/entity/entitySlice";
import { QueryOptions } from "@/lib/redux/entity/types/stateTypes";

interface EntityAnalyzerEditorProps {
  className?: string;
  defaultExpanded?: boolean;
  selectedEntityKey?: EntityKeys | null;
  onEntityChange?: (entity: EntityKeys | null) => void;
}

const EntityAnalyzerEditor: React.FC<EntityAnalyzerEditorProps> = ({
  className = "",
  defaultExpanded = false,
  selectedEntityKey,
  onEntityChange,
}) => {
  const [localSelectedEntity, setLocalSelectedEntity] =
    useState<EntityKeys | null>(selectedEntityKey ?? null);
  const [showEntityList, setShowEntityList] = useState(true);
  const [lastError, setLastError] = useState<any>(null);

  useEffect(() => {
    if (selectedEntityKey !== undefined) {
      setLocalSelectedEntity(selectedEntityKey);
    }
  }, [selectedEntityKey]);

  const dispatch = useAppDispatch();
  const entityOptions = useAppSelector(selectFormattedEntityOptions);

  const selectors = useMemo(
    () =>
      localSelectedEntity ? createEntitySelectors(localSelectedEntity) : null,
    [localSelectedEntity],
  );

  const { actions } = useMemo(
    () =>
      localSelectedEntity
        ? getEntitySlice(localSelectedEntity)
        : { actions: null },
    [localSelectedEntity],
  );

  const entityState = useAppSelector((state) =>
    // @ts-ignore
    localSelectedEntity ? state.entities[localSelectedEntity] : null,
  );

  const safeDispatch = useCallback(
    (action: any) => {
      try {
        dispatch(action);
        return true;
      } catch (error) {
        console.error(
          `Error dispatching action for ${localSelectedEntity}:`,
          error,
        );
        setLastError(error);
        return false;
      }
    },
    [dispatch, localSelectedEntity],
  );

  const handleEntitySelect = (entity: EntityKeys) => {
    setLocalSelectedEntity(entity);
    setShowEntityList(false);
    onEntityChange?.(entity);
  };

  const handleCreateRecord = async (data: object) => {
    if (!localSelectedEntity || !actions) return false;
    return safeDispatch(
      actions.createRecord(data as EntityData<typeof localSelectedEntity>),
    );
  };

  const handleUpdateRecord = async (data: object) => {
    if (
      !localSelectedEntity ||
      !actions ||
      !entityState?.entityMetadata?.primaryKeyMetadata
    )
      return false;

    const primaryKeys = entityState.entityMetadata.primaryKeyMetadata.fields;
    const primaryKeyValues = primaryKeys.reduce(
      (acc, key) => ({
        ...acc,
        [key]: (data as any)[key],
      }),
      {} as Record<string, MatrxRecordId>,
    );

    return safeDispatch(
      actions.updateRecord({
        primaryKeyValues,
        data: data as Partial<EntityData<typeof localSelectedEntity>>,
      }),
    );
  };

  const handleUpdateMetadata = async (data: object) => {
    if (!localSelectedEntity || !actions) return false;
    return safeDispatch(actions.updateEntityMetadata(data));
  };

  const handleUpdateFilters = async (data: object) => {
    if (!localSelectedEntity || !actions) return false;
    return safeDispatch(actions.setFilters(data));
  };

  const handleFetchRecords = async (data: object) => {
    if (!localSelectedEntity || !actions) return false;
    const { page = 1, pageSize = 10, ...options } = data as any;
    return safeDispatch(
      actions.fetchRecords({
        page,
        pageSize,
        options: options as QueryOptions<typeof localSelectedEntity>,
      }),
    );
  };

  const getEntityComponents = () => {
    if (!entityState) return [];

    const components = [
      // Editable components with actions
      {
        id: "records",
        type: "editor" as const,
        title: "Records Management",
        data: {
          currentRecords: entityState.records,
          queryOptions: {
            page: entityState.pagination?.pageIndex || 1,
            pageSize: entityState.pagination?.pageSize || 10,
            ...entityState.filters,
          },
        },
        allowMinimize: true,
        onSave: handleFetchRecords,
        description: "Edit query options and fetch records",
      },
      {
        id: "entityMetadata",
        type: "editor" as const,
        title: "Entity Metadata",
        data: entityState.entityMetadata,
        allowMinimize: true,
        onSave: handleUpdateMetadata,
        description: "Update entity metadata configuration",
      },
      {
        id: "filters",
        type: "editor" as const,
        title: "Filter State",
        data: entityState.filters,
        allowMinimize: true,
        onSave: handleUpdateFilters,
        description: "Modify active filters",
      },

      // Read-only state viewers
      {
        id: "selection",
        type: "viewer" as const,
        title: "Selection State",
        data: entityState.selection,
        allowMinimize: true,
      },
      {
        id: "pagination",
        type: "viewer" as const,
        title: "Pagination State",
        data: entityState.pagination,
        allowMinimize: true,
      },
      {
        id: "loading",
        type: "viewer" as const,
        title: "Loading State",
        data: {
          ...entityState.loading,
          lastError: lastError,
        },
        allowMinimize: true,
      },
      {
        id: "cache",
        type: "viewer" as const,
        title: "Cache State",
        data: entityState.cache,
        allowMinimize: true,
      },
      {
        id: "history",
        type: "viewer" as const,
        title: "History State",
        data: entityState.history,
        allowMinimize: true,
      },
      {
        id: "quickReference",
        type: "viewer" as const,
        title: "Quick Reference",
        data: entityState.quickReference,
        allowMinimize: true,
      },
      {
        id: "subscription",
        type: "viewer" as const,
        title: "Subscription Config",
        data: entityState.subscription,
        allowMinimize: true,
      },
      {
        id: "flags",
        type: "viewer" as const,
        title: "Entity Flags",
        data: entityState.flags,
        allowMinimize: true,
      },
      {
        id: "metrics",
        type: "viewer" as const,
        title: "Entity Metrics",
        data: entityState.metrics,
        allowMinimize: true,
      },
    ].filter((component) => component.data !== undefined);

    return components;
  };

  return (
    <div className="space-y-4">
      {!showEntityList && (
        <div className="flex items-center border-b border-border pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEntityList(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            <span className="text-sm font-medium">
              {
                entityOptions.find((e) => e.value === localSelectedEntity)
                  ?.label
              }
            </span>
          </Button>
        </div>
      )}

      <CardContent className="p-4 pt-0">
        {showEntityList ? (
          <div className="flex gap-2 flex-wrap">
            {entityOptions.map((entity) => (
              <Button
                key={entity.value}
                variant={
                  localSelectedEntity === entity.value ? "default" : "outline"
                }
                onClick={() => handleEntitySelect(entity.value)}
                className="text-sm"
                size="sm"
              >
                {entity.label}
              </Button>
            ))}
          </div>
        ) : (
          <UniversalJsonGroup
            components={getEntityComponents()}
            layout="autoGrid"
            minimizedPosition="top"
            className="min-h-0"
            gridMinWidth="350px"
            compact={true}
          />
        )}
      </CardContent>
    </div>
  );
};

export default EntityAnalyzerEditor;
