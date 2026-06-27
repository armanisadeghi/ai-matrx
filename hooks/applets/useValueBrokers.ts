"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useThrottle } from "@uidotdev/usehooks";
import { useCreateAssociatedValueBrokers } from "./useCreateAssociatedValueBrokers";
import { MatrxRecordId } from "@/types/records";
import { UseDataBrokersWithFetchReturn, UseBrokerValuesWithFetchReturn } from "@/lib/redux/entity/hooks/useAllData";

const DEBUG_MODE = false;

type LocalValue = {
    tempId: string;
    dataType: string;
    value: any;
};

const convertValue = (value: any, dataType: string): any => {
    switch (dataType) {
        case "bool":
            return Boolean(value);
        case "int":
            return parseInt(value);
        case "float":
            return parseFloat(value);
        case "list":
            return Array.isArray(value) ? value : [value];
        case "dict":
            return typeof value === "object" ? value : {};
        default:
            return String(value);
    }
};

interface UseValueBrokersDataProps {
    dataBrokerHook: UseDataBrokersWithFetchReturn;
    brokerValueHook: UseBrokerValuesWithFetchReturn;
}

export const useValueBrokersData = ({ dataBrokerHook, brokerValueHook }: UseValueBrokersDataProps) => {
    const dispatch = useAppDispatch();
    const { addBroker, initializedRecords, dataBrokerRecords, isInitialized, brokerValueActions, brokerToValueAssociation } =
        useCreateAssociatedValueBrokers({ dataBrokerHook, brokerValueHook });

    const [localValues, setLocalValues] = useState<Map<string, LocalValue>>(new Map());
    const pendingBrokerMatrxIds = new Map<MatrxRecordId, string>();

    const createBrokerValue = useCallback(
        (brokerId: string) => {
            const tempRecordId = addBroker(brokerId);
            pendingBrokerMatrxIds.set(`id:${brokerId}`, tempRecordId);
            setLocalValues(new Map(localValues.set(tempRecordId, { tempId: tempRecordId, dataType: "str", value: null })));
        },
        [addBroker, localValues]
    );

    const updateDataType = useCallback(
        (tempId: string, dataType: string) => {
            setLocalValues(new Map(localValues.set(tempId, { ...localValues.get(tempId), dataType })));
        },
        [localValues]
    );

    const matchingPendingBrokerRecords = useMemo(() => {
        if (pendingBrokerMatrxIds.size === 0) return [];
        return Array.from(pendingBrokerMatrxIds.keys()).map((id) => dataBrokerRecords[id]);
    }, [dataBrokerRecords, pendingBrokerMatrxIds]);

    useEffect(() => {
        if (matchingPendingBrokerRecords.length === 0) return;
        for (const brokerRecord of matchingPendingBrokerRecords) {
            const tempRecordId = pendingBrokerMatrxIds.get(brokerRecord.id);
            if (!tempRecordId) continue;

            updateDataType(tempRecordId, brokerRecord.dataType);
            setValue(tempRecordId, brokerRecord.defaultValue);

            pendingBrokerMatrxIds.delete(brokerRecord.id);
        }
    }, [matchingPendingBrokerRecords, localValues]);

    const throttledValues = useThrottle(localValues, 1000);

    useEffect(() => {
        if (throttledValues.size === 0 || !isInitialized) return;

        for (const [tempRecordId, localValue] of throttledValues.entries()) {
            const dataValue = { value: localValue.value };
            dispatch(
                brokerValueActions.updateUnsavedField({
                    recordId: tempRecordId,
                    field: "data",
                    value: dataValue,
                })
            );
        }
    }, [throttledValues, dispatch, brokerValueActions, isInitialized]);

    const setValue = useCallback(
        (tempId: string, newValue: any) => {
            const convertedValue = convertValue(newValue, localValues.get(tempId)?.dataType || "str");
            setLocalValues(new Map(localValues.set(tempId, { ...localValues.get(tempId), value: convertedValue })));
        },
        [localValues]
    );

    const currentValue = (tempId: string) => localValues.get(tempId)?.value;

    const isReady = useMemo(() => pendingBrokerMatrxIds.size === 0 && isInitialized, [pendingBrokerMatrxIds, isInitialized]);

    return {
        createBrokerValue,
        initializedRecords,
        dataBrokerRecords,
        brokerToValueAssociation,
        isInitialized,
        localValues,
        currentValue,
        setValue,
        isReady,
    };
};
