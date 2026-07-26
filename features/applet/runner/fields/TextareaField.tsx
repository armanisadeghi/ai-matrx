"use client";

import React, { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { CommonFieldProps } from "./core/types";

const TextareaField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, placeholder, componentProps } = field;
    const { rows, maxLength, width, spellCheck, customContent } = componentProps;

    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));
    const textareaValue = typeof stateValue === "string" ? stateValue : undefined;

    const updateBrokerValue = useCallback(
        (updatedValue: any) => {
            dispatch(
                brokerActions.setValue({
                    brokerId,
                    value: updatedValue,
                })
            );
        },
        [dispatch, brokerId]
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateBrokerValue(e.target.value);
    };

    const textareaClassName =
        "w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 border border-border text-gray-700 dark:text-gray-300 bg-inherit placeholder-gray-400 dark:placeholder-gray-400 placeholder-text-xs";

    const resizeStyle: React.CSSProperties = { resize: "vertical" };

    if (customContent) {
        return <>{customContent}</>;
    }

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <textarea
                id={`${id}-textarea`}
                className={textareaClassName}
                value={textareaValue}
                onChange={handleChange}
                placeholder={placeholder}
                rows={rows}
                maxLength={maxLength}
                spellCheck={spellCheck}
                style={resizeStyle}
                disabled={disabled}
            />
        </div>
    );
};

export default TextareaField;
