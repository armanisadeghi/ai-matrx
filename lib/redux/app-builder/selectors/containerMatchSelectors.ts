import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { AppletContainer, FieldDefinition } from "@/types/customAppTypes";
import { getContainerBuilderState } from "./containerSelectors";
import { selectAppletById } from "./appletSelectors";
import { ContainerBuilder } from "../types";

const generateFieldSignature = (field: FieldDefinition): string => {
  // Include key properties that affect field behavior
  const signature = {
    id: field.id,
    component: field.component,
    required: field.required,
    // Include a rough size indicator for componentProps
    propsSize: JSON.stringify(field.componentProps).length,
    // Include option count only (not IDs)
    optionCount: field.options?.length || 0,
    // Include normalized string properties
    label: normalizeString(field.label),
    description: normalizeString(field.description),
    helpText: normalizeString(field.helpText),
    placeholder: normalizeString(field.placeholder),
  };

  return JSON.stringify(signature);
};

// Utility function to get detailed field differences
const getFieldDifferences = (
  coreField: FieldDefinition,
  appletField: FieldDefinition,
): FieldDifferences => {
  const differences: FieldDifferences = {
    id: { match: true, coreValue: coreField.id, appletValue: appletField.id },
    component: {
      match: coreField.component === appletField.component,
      coreValue: coreField.component,
      appletValue: appletField.component,
    },
    label: {
      match:
        normalizeString(coreField.label) === normalizeString(appletField.label),
      coreValue: coreField.label,
      appletValue: appletField.label,
    },
    description: {
      match:
        normalizeString(coreField.description) ===
        normalizeString(appletField.description),
      coreValue: coreField.description,
      appletValue: appletField.description,
    },
    optionCount: {
      match:
        (coreField.options?.length || 0) === (appletField.options?.length || 0),
      coreValue: coreField.options?.length || 0,
      appletValue: appletField.options?.length || 0,
    },
    propsSize: {
      match:
        JSON.stringify(coreField.componentProps).length ===
        JSON.stringify(appletField.componentProps).length,
      coreValue: JSON.stringify(coreField.componentProps).length,
      appletValue: JSON.stringify(appletField.componentProps).length,
    },
    hasOtherDifferences: false,
  };

  // Check for other differences not explicitly tracked — omit compared keys via rest
  const {
    id: _coreId,
    component: _coreComponent,
    label: _coreLabel,
    description: _coreDescription,
    options: _coreOptions,
    componentProps: _coreComponentProps,
    ...coreFieldCopy
  } = coreField;
  const {
    id: _appletId,
    component: _appletComponent,
    label: _appletLabel,
    description: _appletDescription,
    options: _appletOptions,
    componentProps: _appletComponentProps,
    ...appletFieldCopy
  } = appletField;

  // Check if there are other differences
  differences.hasOtherDifferences =
    JSON.stringify(coreFieldCopy) !== JSON.stringify(appletFieldCopy);

  return differences;
};

// Types for field differences
interface FieldDifferenceDetail {
  match: boolean;
  coreValue: any;
  appletValue: any;
}

interface FieldDifferences {
  id: FieldDifferenceDetail;
  component: FieldDifferenceDetail;
  label: FieldDifferenceDetail;
  description: FieldDifferenceDetail;
  optionCount: FieldDifferenceDetail;
  propsSize: FieldDifferenceDetail;
  hasOtherDifferences: boolean;
}

// Utility function to normalize string values for comparison
const normalizeString = (value: any): string => {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value).trim();
};

// Utility function to compare string properties
const compareStringProperties = (
  container1: AppletContainer | ContainerBuilder,
  container2: AppletContainer | ContainerBuilder,
): boolean => {
  const stringProps: (keyof AppletContainer)[] = [
    "label",
    "shortLabel",
    "description",
    "helpText",
  ];

  // Handle hideDescription separately as it's a boolean
  const booleanProps: (keyof AppletContainer)[] = ["hideDescription"];

  const stringsMatch = stringProps.every(
    (prop) =>
      normalizeString(container1[prop]) === normalizeString(container2[prop]),
  );

  const booleansMatch = booleanProps.every(
    (prop) => container1[prop] === container2[prop],
  );

  return stringsMatch && booleansMatch;
};

// Main selector for container comparison
export const selectContainerComparisonResult = createSelector(
  [
    (state: RootState) => state,
    (state: RootState, appletId: string) => appletId,
    (state: RootState, appletId: string, containerId: string) => containerId,
    (state: RootState, appletId: string, containerId: string) =>
      selectAppletById(state, appletId),
    (state: RootState, appletId: string, containerId: string) =>
      getContainerBuilderState(state).containers[containerId],
  ],
  (state, appletId, containerId, applet, coreContainer) => {
    const result = {
      coreContainerExists: false,
      appletExists: false,
      containerExistsInApplet: false,
      stringPropertiesMatch: false,
      fieldIdsMatch: false,
      fieldsAreSimilar: false,
      overallMatch: false,
      details: {
        missingFieldIds: [] as string[],
        extraFieldIds: [] as string[],
        fieldSignatureMatch: false,
        similarityScore: 0,
        fieldDifferences: {} as Record<string, FieldDifferences>,
      },
    };

    // Check 1: Does the core container exist?
    result.coreContainerExists = !!coreContainer;
    if (!result.coreContainerExists) return result;

    // Check 2: Does the applet exist?
    result.appletExists = !!applet;
    if (!result.appletExists) return result;

    // Check 3: Does the container exist in the applet?
    const appletContainer = applet.containers?.find(
      (c) => c.id === containerId,
    );
    if (!appletContainer) return result;
    result.containerExistsInApplet = true;

    // Note: We intentionally ignore container-specific properties like isPublic, isDirty, etc.
    // We only compare the core properties that should match between applet and source containers

    // Check 4: Are the string values identical?
    result.stringPropertiesMatch = compareStringProperties(
      coreContainer,
      appletContainer,
    );

    // Check 5: Field comparison
    const coreFields = coreContainer.fields || [];
    const appletFields = appletContainer.fields || [];

    // Get field IDs
    const coreFieldIds = coreFields.map((f) => f.id).sort();
    const appletFieldIds = appletFields.map((f) => f.id).sort();

    // Check if all field IDs match
    result.fieldIdsMatch =
      coreFieldIds.length === appletFieldIds.length &&
      coreFieldIds.every((id, index) => id === appletFieldIds[index]);

    // Find missing and extra fields
    result.details.missingFieldIds = coreFieldIds.filter(
      (id) => !appletFieldIds.includes(id),
    );
    result.details.extraFieldIds = appletFieldIds.filter(
      (id) => !coreFieldIds.includes(id),
    );

    // Compare field signatures for similarity
    if (result.fieldIdsMatch) {
      // Create maps for easier lookup
      const coreFieldMap = new Map(coreFields.map((f) => [f.id, f]));
      const appletFieldMap = new Map(appletFields.map((f) => [f.id, f]));

      // Compare signatures and get detailed differences
      let matchingSignatures = 0;
      coreFieldIds.forEach((fieldId) => {
        const coreField = coreFieldMap.get(fieldId);
        const appletField = appletFieldMap.get(fieldId);

        if (coreField && appletField) {
          const coreSig = generateFieldSignature(coreField);
          const appletSig = generateFieldSignature(appletField);

          if (coreSig === appletSig) {
            matchingSignatures++;
          }

          // Get detailed differences for each field
          result.details.fieldDifferences[fieldId] = getFieldDifferences(
            coreField,
            appletField,
          );
        }
      });

      result.details.fieldSignatureMatch =
        matchingSignatures === coreFieldIds.length;
      result.details.similarityScore =
        coreFieldIds.length > 0 ? matchingSignatures / coreFieldIds.length : 1;

      // Consider fields similar if at least 80% of signatures match
      result.fieldsAreSimilar = result.details.similarityScore >= 0.8;
    }

    // Overall match determination
    result.overallMatch =
      result.stringPropertiesMatch &&
      result.fieldIdsMatch &&
      result.fieldsAreSimilar;

    return result;
  },
);

// Simplified selector that just returns whether containers match
export const selectDoContainersMatch = createSelector(
  [selectContainerComparisonResult],
  (comparisonResult) => comparisonResult.overallMatch,
);

// Selector to get specific comparison details
export const selectContainerComparisonDetails = createSelector(
  [selectContainerComparisonResult],
  (comparisonResult) => comparisonResult.details,
);
