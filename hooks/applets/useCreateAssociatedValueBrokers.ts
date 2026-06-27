// @ts-nocheck

"use client";

import { useUser } from "@/lib/hooks/useUser";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { v4 as uuidv4 } from "uuid";
import {
  useBrokerValuesWithFetch,
  UseBrokerValuesWithFetchReturn,
  useDataBrokersWithFetch,
  UseDataBrokersWithFetchReturn,
} from "@/lib/redux/entity/hooks/useAllData";
import { MatrxRecordId } from "@/types/records";

export type BrokerValuePayload = {
  tempId: string;
  initialData: {
    userId: string;
    dataBroker: string;
    data: { value: any };
  };
};

export type BrokerValueInfo = {
  tempId: string;
  dataType: string;
  value: any;
};

const DEBUG_MODE = true;

interface UseCreateAssociatedValueBrokersProps {
  dataBrokerHook: UseDataBrokersWithFetchReturn;
  brokerValueHook: UseBrokerValuesWithFetchReturn;
}

export const useCreateAssociatedValueBrokers = ({
  dataBrokerHook,
  brokerValueHook,
}: UseCreateAssociatedValueBrokersProps) => {
  const dispatch = useAppDispatch();
  const [isInitialized, setIsInitialized] = useState(false);
  const allTempIdsRef = useRef<Set<string>>(new Set());
  const pendingTempIdsRef = useRef<Set<string>>(new Set());
  const pendingBrokerMatrxIdsRef = useRef<Set<MatrxRecordId>>(new Set());
  const pendingPayloadsRef = useRef<Map<string, BrokerValuePayload>>(new Map());
  const brokerToValueAssociationRef = useRef<Map<string, BrokerValueInfo>>(
    new Map(),
  );

  const [updateCounter, forceUpdate] = useReducer((x) => x + 1, 0);

  const { userId } = useUser();

  const { dataBrokerRecords, addDataBrokerMatrxId, dataBrokerIsLoading } =
    dataBrokerHook;

  const {
    brokerValueActions,
    brokerValueUnsavedRecords,
    brokerValueIsLoading,
  } = brokerValueHook;

  const allTempIds = allTempIdsRef.current;
  const pendingTempIds = pendingTempIdsRef.current;
  const pendingBrokerMatrxIds = pendingBrokerMatrxIdsRef.current;
  const pendingPayloads = pendingPayloadsRef.current;
  const brokerToValueAssociation = brokerToValueAssociationRef.current;

  const isWaitingForStart = allTempIds.size === 0;
  const isPending =
    pendingTempIds.size > 0 ||
    pendingBrokerMatrxIds.size > 0 ||
    pendingPayloads.size > 0;

  // 1. STEP ONE: Add a broker and create a temp ID (ONLY place temp IDs are created)
  const addBroker = useCallback(
    (brokerMatrxId: MatrxRecordId) => {
      const tempRecordId = `new-record-${uuidv4()}`;
      allTempIds.add(tempRecordId);
      pendingTempIds.add(tempRecordId);
      pendingBrokerMatrxIds.add(brokerMatrxId);
      addDataBrokerMatrxId(brokerMatrxId);
      forceUpdate();

      return tempRecordId;
    },
    [addDataBrokerMatrxId],
  );

  // 2. STEP TWO: Check for available broker records when dependencies change
  useEffect(() => {
    if (pendingBrokerMatrxIds.size === 0) return;
    const availableBrokerIds = Array.from(pendingBrokerMatrxIds).filter(
      (id) => !!dataBrokerRecords[id],
    );

    if (availableBrokerIds.length === 0) return;

    // 3. STEP THREE: For each available broker, create a payload
    for (const brokerId of availableBrokerIds) {
      const brokerRecord = dataBrokerRecords[brokerId];
      if (!brokerRecord) continue;

      // Find a pending temp ID to use for this broker
      const tempId = Array.from(pendingTempIds)[0];
      if (!tempId) continue;

      // Create the payload
      const payload = {
        tempId: tempId,
        initialData: {
          id: tempId.replace("new-record-", ""),
          userId,
          dataBroker: brokerRecord.id,
          data: { value: brokerRecord.defaultValue },
          dataType: brokerRecord.dataType,
        },
      };

      // Add to pending payloads
      pendingPayloads.set(tempId, payload);

      // Track the association
      brokerToValueAssociation.set(brokerRecord.id, {
        tempId: tempId,
        dataType: brokerRecord.dataType,
        value: brokerRecord.defaultValue,
      });

      // Remove from pending
      pendingTempIds.delete(tempId);
      pendingBrokerMatrxIds.delete(brokerId);
    }

    // Force update to reflect changes
    forceUpdate();
  }, [dataBrokerRecords, pendingBrokerMatrxIds, userId, updateCounter]);

  // 4. STEP FOUR: Process pending payloads
  useEffect(() => {
    // Skip if nothing to do
    if (pendingPayloads.size === 0) return;

    // Process each pending payload
    for (const [tempId, payload] of pendingPayloads.entries()) {
      // Dispatch the action
      dispatch(brokerValueActions.startCreateWithInitialData(payload));

      // Remove from pending
      pendingPayloads.delete(tempId);
    }

    // Force update to reflect changes
    forceUpdate();
  }, [pendingPayloads, brokerValueActions, dispatch, updateCounter]);

  const matchingBrokerValueUnsavedRecords = useMemo(() => {
    if (isWaitingForStart) return [];
    return Array.from(allTempIds)
      .map((id) => brokerValueUnsavedRecords[id])
      .filter((record) => !!record);
  }, [brokerValueUnsavedRecords, allTempIds, isWaitingForStart]);

  const isLoading = dataBrokerIsLoading || brokerValueIsLoading || isPending;

  useEffect(() => {
    if (isWaitingForStart) return;
    if (isLoading) return;
    if (isInitialized) return;
    if (isPending) return;
    setIsInitialized(true);
  }, [isWaitingForStart, isLoading, isInitialized, isPending]);

  if (DEBUG_MODE) {
    printDebug(
      isWaitingForStart,
      isPending,
      isInitialized,
      allTempIds,
      pendingTempIds,
      pendingBrokerMatrxIds,
      pendingPayloads,
      brokerToValueAssociation,
      dataBrokerRecords,
      brokerValueUnsavedRecords,
    );
  }

  return {
    addBroker,
    initializedRecords: matchingBrokerValueUnsavedRecords,
    dataBrokerRecords,
    isInitialized,
    brokerValueActions,
    brokerToValueAssociation,
  };
};

const printDebug = (
  isWaitingForStart,
  isPending,
  isInitialized,
  allTempIds,
  pendingTempIds,
  pendingBrokerMatrxIds,
  pendingPayloads,
  brokerToValueAssociation,
  dataBrokerRecords,
  brokerValueUnsavedRecords,
) => {
  console.log(
    "--------------- useCreateAssociatedValueBrokers DEBUG-----------------",
  );
  console.log("isWaitingForStart", isWaitingForStart);
  console.log("isPending", isPending);
  console.log("isInitialized", isInitialized);
  console.log("All Temp Ids", Array.from(allTempIds));
  console.log("Pending Temp Ids", Array.from(pendingTempIds));
  console.log("Pending Broker Matrx Ids", Array.from(pendingBrokerMatrxIds));
  console.log("Pending Payloads", Array.from(pendingPayloads.entries()));
  console.log("dataBrokerRecords", dataBrokerRecords);
  console.log("brokerValueUnsavedRecords", brokerValueUnsavedRecords);
  console.log(
    "brokerToValueAssociation",
    Array.from(brokerToValueAssociation.entries()),
  );
  console.log(
    "-----------------------------------------------------------------------",
  );
};
