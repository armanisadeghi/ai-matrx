"use client";

import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

// Initial field definition with all basic properties
const initialFieldDefinition = {
  // Core field properties
  id: "occupation-field",
  label: "What is your field of work?",
  description:
    "This helps us cater your resume for the industry for which it will be used.",
  helpText:
    "It's best to use the most specific industry, but if you're unsure, this can be changed later.",
  group: "personal-info",
  iconName: "briefcase",

  // Basic component properties
  component: "select",
  required: true,
  disabled: false,
  placeholder: "Select your industry",
  defaultValue: "",

  // Options (same structure as core field)
  options: [
    {
      id: "tech",
      label: "Technology",
      description: "Software, IT, Hardware",
      helpText: "Includes all tech-related fields",
      iconName: "computer",
    },
    {
      id: "healthcare",
      label: "Healthcare",
      description: "Medical, Pharmacy, Nursing",
      helpText: "For medical and health professionals",
      iconName: "heart",
    },
    {
      id: "finance",
      label: "Finance",
      description: "Banking, Insurance, Investment",
      helpText: "Financial services and institutions",
      iconName: "dollar",
    },
    {
      id: "education",
      label: "Education",
      description: "Teaching, Administration, Research",
      helpText: "Both academic and educational roles",
      iconName: "book",
    },
  ],

  // Component-specific properties (simplified)
  componentProps: {
    // For text inputs
    maxLength: 100,
    minLength: 2,

    // For number inputs and sliders
    min: 0,
    max: 100,
    step: 1,

    // For textarea
    rows: 4,

    // For date
    minDate: "2020-01-01",
    maxDate: "2025-12-31",
  },
};

// Component rendering based on the field type
const DynamicField = ({ field }) => {
  const [value, setValue] = useState(field.defaultValue);

  const handleChange = (e) => {
    const newValue =
      e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setValue(newValue);
  };

  const renderComponent = () => {
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
            maxLength={field.componentProps.maxLength}
            minLength={field.componentProps.minLength}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
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
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
          />
        );

      case "select":
        return (
          <select
            id={field.id}
            value={value || ""}
            onChange={handleChange}
            disabled={field.disabled}
            required={field.required}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
          >
            <option value="">{field.placeholder}</option>
            {field.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "multiselect":
        return (
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
            className="w-full p-2 border border-border rounded h-32 bg-textured text-gray-900 dark:text-gray-100"
          >
            {field.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "radio":
        return (
          <div className="space-y-2">
            {field.options.map((option) => (
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
          </div>
        );

      case "checkbox":
        return (
          <div className="space-y-2">
            {field.options.map((option) => (
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
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
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
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
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
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
          />
        );
    }
  };

  return (
    <div className="mb-4">
      {field.label && (
        <label
          htmlFor={field.id}
          className="block mb-1 font-medium text-gray-900 dark:text-gray-100"
        >
          {field.label}
          {field.required && (
            <span className="text-red-500 dark:text-red-400 ml-1">*</span>
          )}
        </label>
      )}

      {field.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {field.description}
        </p>
      )}

      {renderComponent()}

      {field.helpText && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {field.helpText}
        </p>
      )}
    </div>
  );
};

// Editor for basic field properties
const FieldEditor = ({ field, onChange }) => {
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? checked : value;

    onChange({
      ...field,
      [name]: newValue,
    });
  };

  const handleComponentPropsChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? checked : value;

    onChange({
      ...field,
      componentProps: {
        ...field.componentProps,
        [name]: newValue,
      },
    });
  };

  return (
    <div className="space-y-4 p-4 border border-border rounded bg-gray-50 dark:bg-gray-800">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
        Field Definition Editor
      </h2>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
          Component Type
        </label>
        <select
          name="component"
          value={field.component}
          onChange={handleChange}
          className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
        >
          <option value="input">Input</option>
          <option value="textarea">Textarea</option>
          <option value="select">Select</option>
          <option value="multiselect">Multiselect</option>
          <option value="radio">Radio</option>
          <option value="checkbox">Checkbox</option>
          <option value="slider">Slider</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
          Label
        </label>
        <input
          type="text"
          name="label"
          value={field.label}
          onChange={handleChange}
          className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
          Description
        </label>
        <input
          type="text"
          name="description"
          value={field.description}
          onChange={handleChange}
          className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
          Help Text
        </label>
        <input
          type="text"
          name="helpText"
          value={field.helpText}
          onChange={handleChange}
          className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
          Placeholder
        </label>
        <input
          type="text"
          name="placeholder"
          value={field.placeholder}
          onChange={handleChange}
          className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={field.required}
          onCheckedChange={(v) =>
            onChange({
              ...field,
              required: v === true,
            })
          }
        />
        <span className="text-sm text-gray-800 dark:text-gray-200">
          Required
        </span>
      </label>

      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={field.disabled}
          onCheckedChange={(v) =>
            onChange({
              ...field,
              disabled: v === true,
            })
          }
        />
        <span className="text-sm text-gray-800 dark:text-gray-200">
          Disabled
        </span>
      </label>

      {/* Component-specific properties based on the type */}
      {(field.component === "slider" || field.component === "number") && (
        <div className="space-y-2 p-2 border border-border rounded bg-textured">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Range Properties
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs mb-1 text-gray-700 dark:text-gray-300">
                Min
              </label>
              <input
                type="number"
                name="min"
                value={field.componentProps.min}
                onChange={handleComponentPropsChange}
                className="w-full p-1 border border-border rounded text-sm bg-textured text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-700 dark:text-gray-300">
                Max
              </label>
              <input
                type="number"
                name="max"
                value={field.componentProps.max}
                onChange={handleComponentPropsChange}
                className="w-full p-1 border border-border rounded text-sm bg-textured text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-700 dark:text-gray-300">
                Step
              </label>
              <input
                type="number"
                name="step"
                value={field.componentProps.step}
                onChange={handleComponentPropsChange}
                className="w-full p-1 border border-border rounded text-sm bg-textured text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </div>
      )}

      {field.component === "textarea" && (
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
            Rows
          </label>
          <input
            type="number"
            name="rows"
            value={field.componentProps.rows}
            onChange={handleComponentPropsChange}
            className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
          />
        </div>
      )}

      {(field.component === "input" || field.component === "textarea") && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
              Min Length
            </label>
            <input
              type="number"
              name="minLength"
              value={field.componentProps.minLength}
              onChange={handleComponentPropsChange}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
              Max Length
            </label>
            <input
              type="number"
              name="maxLength"
              value={field.componentProps.maxLength}
              onChange={handleComponentPropsChange}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      )}

      {field.component === "date" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
              Min Date
            </label>
            <input
              type="date"
              name="minDate"
              value={field.componentProps.minDate}
              onChange={handleComponentPropsChange}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-gray-100">
              Max Date
            </label>
            <input
              type="date"
              name="maxDate"
              value={field.componentProps.maxDate}
              onChange={handleComponentPropsChange}
              className="w-full p-2 border border-border rounded bg-textured text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Demo component with split view of editor and rendered components
const DemoComponent = () => {
  const [fieldDefinition, setFieldDefinition] = useState(
    initialFieldDefinition,
  );
  const componentTypes = [
    "input",
    "textarea",
    "select",
    "multiselect",
    "radio",
    "checkbox",
    "slider",
    "number",
    "date",
  ];

  return (
    <div className="p-4 max-w-6xl mx-auto bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        Interactive Field Definition Demo
      </h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left side: Field Editor */}
        <div>
          <FieldEditor field={fieldDefinition} onChange={setFieldDefinition} />
        </div>

        {/* Right side: Preview of current component */}
        <div className="border border-border rounded p-4 bg-textured shadow-sm">
          <h2 className="text-lg font-semibold mb-3 capitalize text-gray-900 dark:text-gray-100">
            {fieldDefinition.component} Component (Current Selection)
          </h2>
          <DynamicField field={fieldDefinition} />
        </div>
      </div>

      {/* Bottom section: All component types with the same definition */}
      <h2 className="text-xl font-bold mt-8 mb-4 text-gray-900 dark:text-gray-100">
        All Component Renderings
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        {componentTypes.map((type) => {
          // Create a modified field definition for each component type
          const modifiedField = {
            ...fieldDefinition,
            component: type,
          };

          return (
            <div
              key={type}
              className="border border-border rounded p-4 bg-textured shadow-sm"
            >
              <h3 className="text-md font-semibold mb-2 capitalize text-gray-900 dark:text-gray-100">
                {type}
              </h3>
              <DynamicField field={modifiedField} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DemoComponent;
