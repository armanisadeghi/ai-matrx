"use client";

import * as React from "react";
import {
  FetchMode,
  GetOrFetchSelectedRecordsPayload,
} from "@/lib/redux/entity/actions";
import { getRecordIdByRecord } from "@/lib/redux/entity/utils/stateHelpUtils";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  MatrxRecordId,
  SelectionMode,
} from "@/lib/redux/entity/types/stateTypes";
import { EntityKeys, EntityData } from "@/types/entityTypes";

const useAreArraysEqual = (a: MatrxRecordId[], b: MatrxRecordId[]) => {
  return React.useMemo(
    () => a.length === b.length && a.every((val, idx) => val === b[idx]),
    [a, b],
  );
};

const useHasOnlyNewRecords = (selectedRecordIds: MatrxRecordId[]) => {
  return React.useMemo(
    () =>
      selectedRecordIds.every(
        (recordId) =>
          // Add null check before accessing startsWith
          recordId != null &&
          typeof recordId === "string" &&
          recordId.startsWith("new-record-"),
      ),
    [selectedRecordIds],
  );
};

export function useSelectQuickRef<TEntity extends EntityKeys>(
  entityKey: TEntity,
) {
  const dispatch = useAppDispatch();
  const { actions, selectors } = useEntityTools(entityKey);
  const [fetchMode, setFetchMode] = React.useState<FetchMode>("native");
  const [lastProcessedIds, setLastProcessedIds] = React.useState<
    MatrxRecordId[]
  >([]);

  const selectedRecordIds = useAppSelector(selectors.selectSelectedRecordIds);
  const selectionMode = useAppSelector(selectors.selectSelectionMode);
  const hasOnlyNewRecords = useHasOnlyNewRecords(selectedRecordIds);
  const isEqual = useAreArraysEqual(lastProcessedIds, selectedRecordIds);
  const quickReferenceRecords = useAppSelector(selectors.selectQuickReference);
  const activeRecord = useAppSelector(selectors.selectActiveRecord);
  const activeRecordId = useAppSelector(selectors.selectActiveRecordId);

  const payload: GetOrFetchSelectedRecordsPayload = React.useMemo(
    () => ({
      matrxRecordIds: selectedRecordIds,
      fetchMode,
    }),
    [selectedRecordIds, fetchMode],
  );

  React.useEffect(() => {
    if (
      !Array.isArray(selectedRecordIds) ||
      selectedRecordIds.length === 0 ||
      hasOnlyNewRecords ||
      isEqual
    ) {
      return;
    }
    dispatch(actions.getOrFetchSelectedRecords(payload));
    setLastProcessedIds(selectedRecordIds);
  }, [
    selectedRecordIds,
    hasOnlyNewRecords,
    isEqual,
    payload,
    dispatch,
    actions,
  ]);

  const isSelected = React.useCallback(
    (recordKey: MatrxRecordId) =>
      recordKey != null && // Add null check
      Array.isArray(selectedRecordIds) &&
      selectedRecordIds.includes(recordKey),
    [selectedRecordIds],
  );

  const handleToggleSelection = React.useCallback(
    (recordKey: MatrxRecordId) => {
      if (!recordKey) return; // Early return if recordKey is null/undefined

      if (isSelected(recordKey)) {
        dispatch(actions.removeFromSelection(recordKey));
      } else {
        dispatch(actions.addToSelection(recordKey));
      }
    },
    [dispatch, actions, isSelected],
  );

  const handleSingleSelection = React.useCallback(
    (recordKey: MatrxRecordId) => {
      if (!recordKey) return; // Early return if recordKey is null/undefined
      dispatch(actions.setSwitchSelectedRecord(recordKey));
    },
    [dispatch, actions],
  );

  const toggleSelectionMode = React.useCallback(
    () => dispatch(actions.setToggleSelectionMode()),
    [dispatch, actions],
  );

  const setSelectionMode = React.useCallback(
    (mode: SelectionMode) => dispatch(actions.setSelectionMode(mode)),
    [dispatch, actions],
  );

  const handleRecordSelect = React.useCallback(
    (recordKey: MatrxRecordId) => {
      if (!recordKey) return; // Early return if recordKey is null/undefined

      if (selectionMode === "multiple") {
        handleToggleSelection(recordKey);
      } else {
        handleSingleSelection(recordKey);
      }
      dispatch(actions.setActiveRecord(recordKey));
    },
    [
      selectionMode,
      handleToggleSelection,
      handleSingleSelection,
      dispatch,
      actions,
    ],
  );

  return React.useMemo(
    () => ({
      selectionMode,
      setSelectionMode,
      handleRecordSelect,
      toggleSelectionMode,
      setFetchMode,
      quickReferenceRecords,
      selectedRecordIds,
      activeRecord,
      activeRecordId,
    }),
    [
      selectionMode,
      setSelectionMode,
      handleRecordSelect,
      toggleSelectionMode,
      setFetchMode,
      quickReferenceRecords,
      selectedRecordIds,
      activeRecord,
      activeRecordId,
    ],
  );
}

export type useQuickRefReturn = ReturnType<typeof useSelectQuickRef>;
