"use client";

import React, { useState } from "react";
import { FieldDefinition } from "@/types/customAppTypes";
import HelpIcon from "@/components/official/HelpIcon";
import { FileUploadWithStorage } from "@/components/ui/file-upload/FileUploadWithStorage";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { normalizeFieldDefinition } from "@/features/applet/utils/field-normalization";

interface FieldDefWithDisabled extends FieldDefinition {
  disabled?: boolean;
}

interface FieldRendererProps {
  field: FieldDefWithDisabled;
}

export const FieldRenderer: React.FC<FieldRendererProps> = ({
  field: rawField,
}) => {
  // Normalize the field to ensure all properties exist
  const field = normalizeFieldDefinition(rawField) as FieldDefWithDisabled;

  const [value, setValue] = useState(field.defaultValue);
  const [otherValue, setOtherValue] = useState("");
  const [rangeValues, setRangeValues] = useState(() => {
    if (Array.isArray(field.defaultValue) && field.defaultValue.length === 2) {
      return field.defaultValue;
    }
    const min = field.componentProps?.min ?? 0;
    const max = field.componentProps?.max ?? 100;
    return [min, max];
  });

  const handleChange = (e) => {
    const newValue =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setValue(newValue);
  };

  const handleOtherChange = (e) => {
    setOtherValue(e.target.value);
  };

  const handleJsonChange = (e) => {
    try {
      // Allow any input, but try to format it as JSON if possible
      setValue(e.target.value);
    } catch (error) {
      // Silently fail and just keep the raw input
      setValue(e.target.value);
    }
  };

  const renderComponent = () => {
    // @ts-ignore - Type mismatch: field.component may be ComponentType but switch handles string literals
    switch (field.component) {
      case "input":
        return (
          <input
            id={field.id}
            type="text"
            value={value || ""}
            onChange={handleChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            required={field.required}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        );

      case "textarea":
        return (
          <textarea
            id={field.id}
            value={value || ""}
            onChange={handleChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            required={field.required}
            rows={field.componentProps.rows}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        );

      case "select":
        return (
          <div className="space-y-2">
            <select
              id={field.id}
              value={value || ""}
              onChange={handleChange}
              disabled={field.disabled}
              required={field.required}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
            >
              <option value="">{field.placeholder}</option>
              {field.options?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              {field.includeOther && <option value="other">Other</option>}
            </select>

            {/* Render the "Other" text field if that option is selected */}
            {field.includeOther && value === "other" && (
              <input
                type="text"
                value={otherValue}
                onChange={handleOtherChange}
                placeholder="Enter custom value"
                className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            )}
          </div>
        );

      case "multiselect":
        return (
          <div className="space-y-2">
            <select
              id={field.id}
              value={Array.isArray(value) ? value : []}
              onChange={(e) => {
                const selected = Array.from(
                  e.target.selectedOptions,
                  (option) => option.value,
                );
                setValue(selected);
              }}
              disabled={field.disabled}
              required={field.required}
              multiple
              size={field.componentProps?.rows || 5}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 appearance-none [&>option]:p-2 [&>option:checked]:bg-blue-600 [&>option:checked]:dark:bg-blue-700 [&>option:checked]:text-white [&>option:checked]:dark:text-white"
              style={{ overflow: "auto" }}
            >
              {field.options?.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  className="py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {option.label}
                </option>
              ))}
              {field.includeOther && (
                <option
                  value="other"
                  className="py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Other
                </option>
              )}
            </select>

            {/* Render the "Other" text field if that option is selected */}
            {field.includeOther &&
              Array.isArray(value) &&
              value.includes("other") && (
                <input
                  type="text"
                  value={otherValue}
                  onChange={handleOtherChange}
                  placeholder="Enter custom value"
                  className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              )}
          </div>
        );

      case "radio":
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <div key={option.id} className="flex items-center">
                <input
                  type="radio"
                  id={`${field.id}-${option.id}`}
                  name={field.id}
                  value={option.id}
                  checked={value === option.id}
                  onChange={handleChange}
                  disabled={field.disabled}
                  required={field.required}
                  className="mr-2 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-700"
                />
                <label
                  htmlFor={`${field.id}-${option.id}`}
                  className="text-sm text-gray-800 dark:text-gray-200"
                >
                  {option.label}
                </label>
              </div>
            ))}

            {/* "Other" option for radio buttons */}
            {field.includeOther && (
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id={`${field.id}-other`}
                    name={field.id}
                    value="other"
                    checked={value === "other"}
                    onChange={handleChange}
                    disabled={field.disabled}
                    className="mr-2 text-blue-600 dark:text-blue-400 border-gray-300 dark:border-gray-700"
                  />
                  <label
                    htmlFor={`${field.id}-other`}
                    className="text-sm text-gray-800 dark:text-gray-200"
                  >
                    Other
                  </label>
                </div>

                {value === "other" && (
                  <input
                    type="text"
                    value={otherValue}
                    onChange={handleOtherChange}
                    placeholder="Enter custom value"
                    className="w-full ml-6 p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                )}
              </div>
            )}
          </div>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <label
                key={option.id}
                className={`flex items-center gap-2 cursor-pointer ${field.disabled ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <Checkbox
                  checked={Array.isArray(value) && value.includes(option.id)}
                  disabled={field.disabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setValue([
                        ...(Array.isArray(value) ? value : []),
                        option.id,
                      ]);
                    } else {
                      setValue(
                        Array.isArray(value)
                          ? value.filter((v) => v !== option.id)
                          : [],
                      );
                    }
                  }}
                  className="shrink-0"
                />
                <span className="text-sm text-gray-800 dark:text-gray-200">
                  {option.label}
                </span>
              </label>
            ))}

            {/* "Other" option for checkboxes */}
            {field.includeOther && (
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2 cursor-pointer ${field.disabled ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <Checkbox
                    checked={Array.isArray(value) && value.includes("other")}
                    disabled={field.disabled}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setValue([
                          ...(Array.isArray(value) ? value : []),
                          "other",
                        ]);
                      } else {
                        setValue(
                          Array.isArray(value)
                            ? value.filter((v) => v !== "other")
                            : [],
                        );
                      }
                    }}
                    className="shrink-0"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    Other
                  </span>
                </label>

                {Array.isArray(value) && value.includes("other") && (
                  <input
                    type="text"
                    value={otherValue}
                    onChange={handleOtherChange}
                    placeholder="Enter custom value"
                    className="w-full ml-6 p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                )}
              </div>
            )}
          </div>
        );

      case "slider":
        return (
          <div>
            <input
              type="range"
              id={field.id}
              min={field.componentProps.min}
              max={field.componentProps.max}
              step={field.componentProps.step}
              value={value || field.componentProps.min}
              onChange={handleChange}
              disabled={field.disabled}
              className="w-full accent-blue-600 dark:accent-blue-400"
            />
            <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300">
              <span>{field.componentProps.min}</span>
              <span>{value || field.componentProps.min}</span>
              <span>{field.componentProps.max}</span>
            </div>
          </div>
        );

      case "number":
        return (
          <input
            type="number"
            id={field.id}
            min={field.componentProps.min}
            max={field.componentProps.max}
            step={field.componentProps.step}
            value={value || ""}
            onChange={handleChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            required={field.required}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        );

      case "date":
        return (
          <input
            type="date"
            id={field.id}
            min={field.componentProps.minDate}
            max={field.componentProps.maxDate}
            value={value || ""}
            onChange={handleChange}
            disabled={field.disabled}
            required={field.required}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        );

      case "switch":
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={field.id}
              checked={!!value}
              onCheckedChange={setValue}
              disabled={field.disabled}
            />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {value
                ? field.componentProps.onLabel || "Yes"
                : field.componentProps.offLabel || "No"}
            </span>
          </div>
        );

      // @ts-ignore - field.component is ComponentType but switch handles string literals
      case "button":
        return (
          <div className="flex flex-wrap gap-2">
            {field.options?.map((option) => (
              <button
                key={option.id}
                id={`${field.id}-${option.id}`}
                type="button"
                onClick={() => {
                  if (Array.isArray(value)) {
                    // If it's already in the array, remove it, otherwise add it
                    if (value.includes(option.id)) {
                      setValue(value.filter((v) => v !== option.id));
                    } else {
                      setValue([...value, option.id]);
                    }
                  } else {
                    // Initialize array with this option
                    setValue([option.id]);
                  }
                }}
                disabled={field.disabled}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors border ${
                  Array.isArray(value) && value.includes(option.id)
                    ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white border-blue-600 dark:border-blue-700"
                    : "bg-textured border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750"
                } focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {option.label}
              </button>
            ))}
          </div>
        );

      case "rangeSlider":
        return (
          <div className="space-y-4">
            <div className="relative pt-6">
              <div className="absolute left-0 right-0 h-1 bg-gray-300 dark:bg-gray-700 rounded">
                <div
                  className="absolute h-1 bg-blue-600 dark:bg-blue-500 rounded"
                  style={{
                    left: `${((rangeValues[0] - (field.componentProps?.min || 0)) / ((field.componentProps?.max || 100) - (field.componentProps?.min || 0))) * 100}%`,
                    right: `${100 - ((rangeValues[1] - (field.componentProps?.min || 0)) / ((field.componentProps?.max || 100) - (field.componentProps?.min || 0))) * 100}%`,
                  }}
                />
              </div>
              <input
                type="range"
                id={`${field.id}-min`}
                min={field.componentProps?.min || 0}
                max={field.componentProps?.max || 100}
                step={field.componentProps?.step || 1}
                value={rangeValues[0]}
                onChange={(e) => {
                  const newMin = Math.min(
                    Number(e.target.value),
                    rangeValues[1],
                  );
                  setRangeValues([newMin, rangeValues[1]]);
                }}
                className="absolute top-0 left-0 w-full h-6 appearance-none bg-transparent"
                style={{
                  background: "transparent",
                  zIndex: 2,
                }}
                disabled={field.disabled}
              />
              <input
                type="range"
                id={`${field.id}-max`}
                min={field.componentProps?.min || 0}
                max={field.componentProps?.max || 100}
                step={field.componentProps?.step || 1}
                value={rangeValues[1]}
                onChange={(e) => {
                  const newMax = Math.max(
                    Number(e.target.value),
                    rangeValues[0],
                  );
                  setRangeValues([rangeValues[0], newMax]);
                }}
                className="absolute top-0 left-0 w-full h-6 appearance-none bg-transparent"
                style={{
                  background: "transparent",
                  zIndex: 3,
                }}
                disabled={field.disabled}
              />
            </div>
            <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300">
              <span>{field.componentProps?.min || 0}</span>
              <div className="flex space-x-4">
                <div className="text-blue-600 dark:text-blue-400">
                  Min: {rangeValues[0]}
                </div>
                <div className="text-blue-600 dark:text-blue-400">
                  Max: {rangeValues[1]}
                </div>
              </div>
              <span>{field.componentProps?.max || 100}</span>
            </div>
          </div>
        );

      case "numberPicker":
        return (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                const currentValue = Number(value) || 0;
                const min =
                  field.componentProps?.min !== undefined
                    ? field.componentProps.min
                    : Number.MIN_SAFE_INTEGER;
                setValue(
                  Math.max(
                    currentValue - (field.componentProps?.step || 1),
                    min,
                  ),
                );
              }}
              disabled={
                field.disabled ||
                value <= (field.componentProps?.min || Number.MIN_SAFE_INTEGER)
              }
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Decrease</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            </button>
            <input
              type="number"
              id={field.id}
              min={field.componentProps?.min}
              max={field.componentProps?.max}
              step={field.componentProps?.step || 1}
              value={value || 0}
              onChange={handleChange}
              disabled={field.disabled}
              className="w-20 text-center p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={() => {
                const currentValue = Number(value) || 0;
                const max =
                  field.componentProps?.max !== undefined
                    ? field.componentProps.max
                    : Number.MAX_SAFE_INTEGER;
                setValue(
                  Math.min(
                    currentValue + (field.componentProps?.step || 1),
                    max,
                  ),
                );
              }}
              disabled={
                field.disabled ||
                value >= (field.componentProps?.max || Number.MAX_SAFE_INTEGER)
              }
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Increase</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        );

      case "jsonField":
        return (
          <div className="space-y-2">
            <textarea
              id={field.id}
              value={
                typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : value || ""
              }
              onChange={handleJsonChange}
              placeholder={field.placeholder || "Enter JSON data"}
              rows={field.componentProps?.rows || 5}
              disabled={field.disabled}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 font-mono text-sm placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(value);
                  setValue(JSON.stringify(parsed, null, 2));
                } catch (e) {
                  // Silently fail if JSON is invalid
                }
              }}
              disabled={field.disabled}
              className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Format JSON
            </button>
          </div>
        );

      case "fileUpload":
        return (
          <FileUploadWithStorage
            saveTo="public"
            multiple={true}
            useMiniUploader={true}
            onUploadComplete={(results) => {
              // Store the array of file details in the field value
              setValue(results);
            }}
            onUploadStatusChange={(isUploading) => {
              // Optional: if you want to track upload status
              console.log("Upload status:", isUploading);
            }}
          />
        );

      default:
        return (
          <input
            type="text"
            id={field.id}
            value={value || ""}
            onChange={handleChange}
            placeholder={field.placeholder}
            disabled={field.disabled}
            required={field.required}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100 placeholder:text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        );
    }
  };

  return (
    <div className="w-full min-w-96 p-4 bg-white rounded-xl dark:bg-gray-800 border dark:border-gray-700">
      <div>
        <div className="mb-6 last:mb-0">
          <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
            {field.label}
            <HelpIcon text={field.helpText} />
            {field.required && (
              <span className="text-red-500 dark:text-red-400 ml-1">*</span>
            )}
          </label>
          {renderComponent()}
        </div>
      </div>
    </div>
  );
};

export default FieldRenderer;
