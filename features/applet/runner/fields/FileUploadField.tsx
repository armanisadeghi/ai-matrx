"use client";

import React, { useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice/selectors";
import { brokerActions } from "@/lib/redux/brokerSlice/slice";
import { ensureValidWidthClass } from "@/features/applet/constants/field-constants";
import { cn } from "@/lib/utils";
import { FileUploadWithStorage } from "@/components/ui/file-upload/FileUploadWithStorage";
import { EnhancedFileDetails } from "@/utils/file-operations/constants";
import { FieldValidation, useFieldValidation } from "./common/FieldValidation";
import { CommonFieldProps } from "./core/types";
import type { UploadedFileResult } from "@/components/ui/file-upload/types";

function isUploadedFileResult(value: unknown): value is UploadedFileResult {
    return (
        typeof value === "object" &&
        value !== null &&
        "url" in value &&
        typeof value.url === "string" &&
        "type" in value &&
        typeof value.type === "string"
    );
}

const FileUploadField: React.FC<CommonFieldProps> = ({ field, sourceId="no-applet-id", isMobile, source = "applet", disabled = false, className = "" }) => {
    const { id, label, componentProps, required } = field;

    const {
        width,
        customContent,
        multiSelect = false,
        maxItems = undefined,
        minItems = undefined, // Add support for minItems
    } = componentProps;

    const safeWidthClass = ensureValidWidthClass(width);

    const dispatch = useAppDispatch();
    const brokerId = useAppSelector((state) => brokerSelectors.selectBrokerId(state, { source, mappedItemId: id }));
    const stateValue = useAppSelector((state) => brokerSelectors.selectValue(state, brokerId));

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

    // Track the upload status
    const [isUploading, setIsUploading] = React.useState(false);

    // Use the validation hook
    const { hasBlurred, handleBlur, showValidation } = useFieldValidation();

    // Initialize from defaultValue if available and no current state
    useEffect(() => {
        if (stateValue === undefined && field.defaultValue) {
            updateBrokerValue(field.defaultValue);
        }
    }, [dispatch, field.defaultValue, id, stateValue]);

    // Handle upload completion
    const handleUploadComplete = (results: { url: string; type: string; details?: EnhancedFileDetails }[]) => {
        if (results && results.length > 0) {
            // For single file upload, just store the first result
            if (!multiSelect) {
                updateBrokerValue(results[0]);
                return;
            }

            // For multiple files, handle differently depending on what's already in state
            let updatedValue;

            if (!stateValue) {
                // No existing value, just use the results array
                updatedValue = results;
            } else if (Array.isArray(stateValue)) {
                // Existing array, append the new results (respecting maxItems if set)
                const combinedResults = [...stateValue, ...results];
                updatedValue = maxItems ? combinedResults.slice(0, maxItems) : combinedResults;
            } else {
                // Existing single value, convert to array with new results
                updatedValue = [stateValue, ...results];
                if (maxItems) {
                    updatedValue = updatedValue.slice(0, maxItems);
                }
            }

            updateBrokerValue(updatedValue);
        }
    };

    // Handle upload status changes
    const handleUploadStatusChange = (uploading: boolean) => {
        setIsUploading(uploading);
    };

    // Render custom content if provided
    if (customContent) {
        return <>{customContent}</>;
    }

    // Determine if we have reached the maximum items (only applies for multiple)
    const hasReachedMaxItems = multiSelect && maxItems !== undefined && Array.isArray(stateValue) && stateValue.length >= maxItems;

    // Prepare initialFiles based on the current state
    const initialFiles = (Array.isArray(stateValue) ? stateValue : [stateValue]).filter(isUploadedFileResult);

    return (
        <div className={`${safeWidthClass} ${className}`}>
            <div
                className={cn("w-full", disabled && "opacity-60 pointer-events-none")}
                onBlur={handleBlur} // Add blur handler to the wrapper
            >
                {/* Show the existing files count if any */}
                {initialFiles.length > 0 && (
                    <div className="mb-2 text-sm text-gray-700 dark:text-gray-300">
                        {`${initialFiles.length} file${initialFiles.length !== 1 ? "s" : ""} uploaded`}
                        {maxItems && <span className="ml-1 text-gray-500 dark:text-gray-400">(Max: {maxItems})</span>}
                    </div>
                )}

                {/* Only show the uploader if we haven't reached max items or if single upload */}
                {(!hasReachedMaxItems || !multiSelect) && (
                    <FileUploadWithStorage
                        saveTo="public"
                        multiple={multiSelect}
                        useMiniUploader={true}
                        onUploadComplete={handleUploadComplete}
                        onUploadStatusChange={handleUploadStatusChange}
                        initialFiles={initialFiles}
                    />
                )}

                {/* Show message if max items reached */}
                {hasReachedMaxItems && (
                    <div className="text-amber-600 dark:text-amber-400 text-sm mt-1">
                        Maximum number of files reached ({maxItems}). Remove files to upload more.
                    </div>
                )}
            </div>

            {/* Use the FieldValidation component */}
            <FieldValidation
                value={stateValue}
                required={required}
                minSelections={minItems}
                maxSelections={maxItems}
                multiSelect={multiSelect}
                showValidation={showValidation && !isUploading}
                fieldType="file"
            />
        </div>
    );
};

export default FileUploadField;
