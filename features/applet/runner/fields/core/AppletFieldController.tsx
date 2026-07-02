"use client";

import React from "react";
import RadioGroupField from "../RadioGroupField";
import DirectMultiSelectField from "../DirectMultiSelectField";
import SearchableSelectField from "../SearchableSelectField";
import MultiSearchableSelectField from "../MultiSearchableSelectField";
import CheckboxGroupField from "../CheckboxGroupField";
import DateField from "../DateField";
import MultiDateField from "../MultiDateField";
import TextareaField from "../TextareaField";
import SelectField from "../SelectField";
import SimpleNumberField from "../SimpleNumberField";
import SwitchField from "../SwitchField";
import ButtonColumnField from "../ButtonGroupField";
import StepperNumberField from "../StepperNumberField";
import SliderField from "../SliderField";
import InputField from "../InputField";
import SortableField from "../SortableField";
import JsonField from "../JSONField";
import FileUploadField from "../FileUploadField";
import ButtonSelectionField from "../ButtonSelectionField";
import TagInputField from "../TagInputField";
import DependentDropdownField from "../DependentDropdownField";
import AddressBlockField from "../AddressBlockField";
import StarRatingField from "../StarRatingField";
import PhoneNumberField from "../PhoneNumberField";
import RangeSliderField from "../RangeSlider";
import NumberInputField from "../NumberInputField";
import DraggableTableField from "../concepts/DraggableTableField";
import DraggableEditableTableField from "../concepts/DraggableEditableTableField";
import DragEditModifyTableField from "../concepts/DragEditModifyTableField";
import DragTableRowAndColumnField from "../concepts/DragTableRowAndColumnField";

import ConceptBrokerOptionsField from "../concept-broker-options/SearchableSelectField";

export type { CommonFieldProps } from "./types";

export const AppletFieldController = ({
  field,
  sourceId,
  isMobile,
  source = "applet",
  disabled = false,
  className = "",
}: CommonFieldProps) => {
  // Legacy configs (e.g. sample-config.json, older builder output) can still
  // carry `component: "button"` — a name later renamed to "buttonSelection".
  // Read as `string` here so that legacy value is tolerated without widening
  // the shared `ComponentType` union used everywhere else.
  const componentKey: string = field.component;
  switch (componentKey) {
    case "textarea": {
      return (
        <TextareaField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "select": {
      return (
        <SelectField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }
    case "radio": {
      return (
        <RadioGroupField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "checkbox": {
      return (
        <CheckboxGroupField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }
    case "date": {
      return (
        <DateField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "multiDate": {
      return (
        <MultiDateField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "searchableSelect": {
      return (
        <SearchableSelectField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "directMultiSelect": {
      return (
        <DirectMultiSelectField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "multiselect": {
      console.log(
        `Field Controller Rendered: 'multiselect' using MultiSearchableSelectField`,
      );
      return (
        <MultiSearchableSelectField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "dependentDropdown": {
      return (
        <DependentDropdownField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    // ===== "button" is a legacy alias for "buttonSelection"; needs a data
    // backfill for all components and then removal. =====
    case "button":
      console.log(
        "========== button. not buttonSelection using ButtonSelectionField ==========",
      );

    case "buttonSelection": {
      return (
        <ButtonSelectionField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "sortable": {
      return (
        <SortableField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "draggableTable": {
      return (
        <DraggableTableField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "draggableEditableTable": {
      return (
        <DraggableEditableTableField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "dragEditModifyTable": {
      return (
        <DragEditModifyTableField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "dragTableRowAndColumn": {
      return (
        <DragTableRowAndColumnField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "buttonColumn": {
      return (
        <ButtonColumnField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "number": {
      console.log(
        `Field Controller Rendered: 'number' using StepperNumberField`,
      );
      return (
        <StepperNumberField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "simpleNumber": {
      return (
        <SimpleNumberField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "numberInput": {
      return (
        <NumberInputField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "slider": {
      return (
        <SliderField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }
    case "switch": {
      return (
        <SwitchField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "jsonField": {
      return (
        <JsonField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "fileUpload": {
      return (
        <FileUploadField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "addressBlock": {
      return (
        <AddressBlockField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "starRating": {
      return (
        <StarRatingField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "phoneNumber": {
      return (
        <PhoneNumberField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "rangeSlider": {
      return (
        <RangeSliderField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "tagInput": {
      return (
        <TagInputField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "input": {
      return (
        <InputField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    case "conceptBrokerOptions": {
      return (
        <ConceptBrokerOptionsField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }

    default: {
      console.log(
        `ERROR!!!!!! Invalid field component: '${field.component || "default"}' using InputField ============`,
      );
      return (
        <InputField
          field={field}
          sourceId={sourceId}
          isMobile={isMobile}
          source={source}
          disabled={disabled}
          className={className}
        />
      );
    }
  }
};

export default AppletFieldController;
