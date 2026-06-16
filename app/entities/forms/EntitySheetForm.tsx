import React, { useEffect, useState } from "react";
import { UnifiedLayoutProps } from "@/components/matrx/Entity/prewired-components/layouts/types";
import { EntityKeys, MatrxRecordId } from "@/types/entityTypes";
import type { RootState } from "@/lib/redux/store";
import { selectEntityPrettyName } from "@/lib/redux/schema/globalCacheSelectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { Button } from "@/components/ui/button";
import { useCreateRecord } from "../hooks/unsaved-records/useCreateRecord";
import { useUpdateRecord } from "../hooks/crud/useUpdateRecord";
import { getUnifiedLayoutProps } from "../layout/configs";
import { generateTemporaryRecordId } from "@/lib/redux/entity/utils/stateHelpUtils";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import EntityFormMinimalAnyRecord from "./EntityFormMinimalAnyRecord";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDispatch } from "react-redux";
type FormMode = "create" | "edit" | "view";

interface EntitySheetFormProps {
  mode: FormMode;
  entityName: EntityKeys;
  recordId?: MatrxRecordId;
  position?: "left" | "right" | "top" | "bottom";
  size?: "sm" | "default" | "lg" | "xl" | "full";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EntitySheetForm = ({
  mode = "view",
  entityName,
  recordId,
  position = "right",
  size = "default",
  open,
  onOpenChange,
}: EntitySheetFormProps) => {
  const [tempRecordId, setTempRecordId] = useState<MatrxRecordId | undefined>(
    undefined,
  );
  const dispatch = useDispatch();
  const { actions, store } = useEntityTools(entityName);
  const entityState = store.getState()[entityName];
  const entityPrettyName = useAppSelector((state: RootState) =>
    selectEntityPrettyName(state, entityName),
  );

  const unifiedLayoutProps = getUnifiedLayoutProps({
    formComponent: "MINIMAL",
    quickReferenceType: "LIST",
    isExpanded: true,
    handlers: {},
    entityKey: entityName,
  }) as UnifiedLayoutProps;

  const { createRecord } = useCreateRecord(entityName);
  const { updateRecord } = useUpdateRecord(entityName, {
    onComplete: () => onOpenChange(false),
  });

  useEffect(() => {
    if (open) {
      if (mode === "create") {
        const tempId = generateTemporaryRecordId(entityState);
        dispatch(actions.startRecordCreation({ count: 1, tempId }));
        setTempRecordId(tempId);
      } else if (mode === "edit" && recordId) {
        dispatch(actions.startRecordUpdateById(recordId));
      }
    }
  }, [open, mode, recordId, dispatch, actions, entityState]);

  const handleClose = () => {
    dispatch(actions.cancelOperation());
    setTempRecordId(undefined);
    onOpenChange(false);
  };

  const handleSave = () => {
    if (mode === "create" && tempRecordId) {
      createRecord(tempRecordId);
    } else if (mode === "edit" && recordId) {
      updateRecord(recordId);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "create":
        return `New ${entityPrettyName}`;
      case "edit":
        return `Edit ${entityPrettyName}`;
      default:
        return `View ${entityPrettyName}`;
    }
  };

  const panelSize =
    size === "lg" ? 38 : size === "xl" ? 42 : size === "full" ? 88 : 32;

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={getTitle()}
      position={position}
      defaultSize={panelSize}
      contentClassName="flex min-h-0 flex-1 flex-col"
    >
      <ScrollArea className="min-h-0 flex-1">
        <EntityFormMinimalAnyRecord
          recordId={mode === "create" ? tempRecordId : recordId}
          unifiedLayoutProps={unifiedLayoutProps}
        />
      </ScrollArea>
      <div className="flex justify-end space-x-2 mt-4 shrink-0">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        {(mode === "create" || mode === "edit") && (
          <Button onClick={handleSave}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        )}
      </div>
    </MatrxDynamicPanelHost>
  );
};

export default EntitySheetForm;
