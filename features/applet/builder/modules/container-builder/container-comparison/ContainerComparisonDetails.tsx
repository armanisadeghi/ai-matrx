import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, XCircle, AlertCircle, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { selectContainerComparisonResult } from "@/lib/redux/app-builder/selectors/containerMatchSelectors";
import { selectAppletById } from "@/lib/redux/app-builder/selectors/appletSelectors";
import { selectContainerById } from "@/lib/redux/app-builder/selectors/containerSelectors";
import { selectAllFields } from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { useAppDispatch } from "@/lib/redux/hooks";
import { saveFieldThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { toast } from "@/components/ui/use-toast";

interface ContainerComparisonModalProps {
  appletId: string;
  containerId: string;
  onRecompile?: () => void;
  onSetAsIdentical?: () => void;
  onCancel?: () => void;
  onDetach?: (event: React.MouseEvent) => void;
}

// Normalize string for display comparison
const normalizeForDisplay = (value: any): string => {
  if (value === null || value === undefined || value === "") {
    return "(empty)";
  }
  return String(value).trim();
};

// Status Badge Component
const StatusBadge = ({
  status,
  label,
}: {
  status: boolean;
  label: string;
}) => (
  <Badge
    variant={status ? "default" : "destructive"}
    className="gap-1 text-xs"
  >
    {status ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : (
      <XCircle className="h-3 w-3" />
    )}
    {label}
  </Badge>
);

// Property Row Component
const PropertyRow = ({
  label,
  appletValue,
  coreValue,
  isMatch,
}: {
  label: string;
  appletValue: any;
  coreValue: any;
  isMatch?: boolean;
}) => {
  // Normalize values for comparison if isMatch not explicitly provided
  const normalizedAppletValue = normalizeForDisplay(appletValue);
  const normalizedCoreValue = normalizeForDisplay(coreValue);
  const actualMatch =
    isMatch !== undefined
      ? isMatch
      : normalizedAppletValue === normalizedCoreValue ||
        (normalizedAppletValue === "(empty)" &&
          normalizedCoreValue === "(empty)");

  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b dark:border-zinc-700 text-sm">
      <div>
        <span className="font-medium text-muted-foreground">{label}:</span>
        <div
          className={cn(
            "mt-1",
            !actualMatch && "text-orange-600 dark:text-orange-400",
          )}
        >
          {normalizedAppletValue}
        </div>
      </div>
      <div>
        <div
          className={cn(
            "mt-1",
            !actualMatch && "text-blue-600 dark:text-blue-400",
          )}
        >
          {normalizedCoreValue}
        </div>
      </div>
      <div className="flex items-center">
        {actualMatch ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        )}
      </div>
    </div>
  );
};

// Field Difference Row Component
const FieldDifferenceRow = ({
  label,
  coreValue,
  appletValue,
  match,
  type = "string",
}: {
  label: string;
  coreValue: any;
  appletValue: any;
  match: boolean;
  type?: "string" | "number" | "component";
}) => {
  const displayValue = (value: any) => {
    if (type === "string") {
      return normalizeForDisplay(value);
    }
    if (type === "component") {
      return value || "—";
    }
    return value?.toString() || "0";
  };

  return (
    <div className="grid grid-cols-4 gap-2 py-1.5 text-sm border-b dark:border-zinc-700">
      <div className="font-medium text-muted-foreground">{label}</div>
      <div className={cn(!match && "text-orange-600 dark:text-orange-400")}>
        {displayValue(appletValue)}
      </div>
      <div className={cn(!match && "text-blue-600 dark:text-blue-400")}>
        {displayValue(coreValue)}
      </div>
      <div className="flex items-center justify-center">
        {match ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
        )}
      </div>
    </div>
  );
};

// Field Details Component
const FieldDetails = ({
  field,
  differences,
}: {
  field: any;
  differences: any;
}) => {
  const dispatch = useAppDispatch();
  const allFields = useSelector(selectAllFields);

  // Check if the field is dirty
  const fieldFromState = allFields.find((f) => f.id === field?.id);
  const isFieldDirty = fieldFromState?.isDirty;

  // Handle saving a dirty field
  const handleSaveField = () => {
    if (!field?.id) return;

    dispatch(saveFieldThunk(field.id))
      .unwrap()
      .then(() => {
        toast({
          title: "Field Saved",
          description: "Field has been saved successfully",
        });
      })
      .catch((error) => {
        toast({
          title: "Save Failed",
          description: error || "Failed to save field",
          variant: "destructive",
        });
      });
  };

  return (
    <div className="space-y-3">
      {isFieldDirty && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950 dark:text-amber-100 rounded text-sm flex items-center justify-between">
          <div>
            <div className="font-medium">Unsaved Field Changes Detected</div>
            <div className="text-xs mt-1">
              This field has unsaved changes. Save the field to resolve
              comparison differences.
            </div>
          </div>
          <Button size="sm" className="gap-1" onClick={handleSaveField}>
            <Save className="h-3.5 w-3.5" />
            Save Field
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <FieldDifferenceRow
          label="Component"
          appletValue={differences.component.appletValue}
          coreValue={differences.component.coreValue}
          match={differences.component.match}
          type="component"
        />
        <FieldDifferenceRow
          label="Label"
          appletValue={differences.label.appletValue}
          coreValue={differences.label.coreValue}
          match={differences.label.match}
        />
        <FieldDifferenceRow
          label="Description"
          appletValue={differences.description.appletValue}
          coreValue={differences.description.coreValue}
          match={differences.description.match}
        />
        <FieldDifferenceRow
          label="Options Count"
          appletValue={differences.optionCount.appletValue}
          coreValue={differences.optionCount.coreValue}
          match={differences.optionCount.match}
          type="number"
        />
        <FieldDifferenceRow
          label="Props Size"
          appletValue={differences.propsSize.appletValue}
          coreValue={differences.propsSize.coreValue}
          match={differences.propsSize.match}
          type="number"
        />
      </div>

      {differences.hasOtherDifferences && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950 dark:text-amber-100 rounded text-sm">
          <div className="font-medium">Other Differences Detected</div>
          <div className="text-xs mt-1">
            Additional property differences exist but are not shown in detail.
          </div>
        </div>
      )}
    </div>
  );
};

export const ContainerComparisonDetails: React.FC<
  ContainerComparisonModalProps
> = ({ appletId, containerId }) => {
  const comparisonResult = useSelector((state: RootState) =>
    selectContainerComparisonResult(state, appletId, containerId),
  );

  const applet = useSelector((state: RootState) =>
    selectAppletById(state, appletId),
  );

  const coreContainer = useSelector((state: RootState) =>
    selectContainerById(state, containerId),
  );

  const appletContainer = applet?.containers?.find((c) => c.id === containerId);

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          status={comparisonResult.coreContainerExists}
          label="Core Container Exists"
        />
        <StatusBadge
          status={comparisonResult.appletExists}
          label="Applet Exists"
        />
        <StatusBadge
          status={comparisonResult.containerExistsInApplet}
          label="Container in Applet"
        />
        <StatusBadge
          status={comparisonResult.stringPropertiesMatch}
          label="Properties Match"
        />
        <StatusBadge
          status={comparisonResult.fieldIdsMatch}
          label="Field IDs Match"
        />
        <StatusBadge
          status={comparisonResult.fieldsAreSimilar}
          label="Fields Similar"
        />
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 gap-4 font-semibold text-sm border-b dark:border-zinc-700 pb-2">
        <div>Applet Container</div>
        <div>Core Container</div>
        <div>Comparison</div>
      </div>

      {/* Property Comparisons */}
      <div className="space-y-1">
        <PropertyRow
          label="Label"
          appletValue={appletContainer?.label}
          coreValue={coreContainer?.label}
        />
        <PropertyRow
          label="Short Label"
          appletValue={appletContainer?.shortLabel}
          coreValue={coreContainer?.shortLabel}
        />
        <PropertyRow
          label="Description"
          appletValue={appletContainer?.description}
          coreValue={coreContainer?.description}
        />
        <PropertyRow
          label="Hide Description"
          appletValue={appletContainer?.hideDescription ? "Yes" : "No"}
          coreValue={coreContainer?.hideDescription ? "Yes" : "No"}
          isMatch={
            appletContainer?.hideDescription === coreContainer?.hideDescription
          }
        />
        <PropertyRow
          label="Help Text"
          appletValue={appletContainer?.helpText}
          coreValue={coreContainer?.helpText}
        />
      </div>

      {/* Field Comparison */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">Field Analysis</h3>

        {/* Field Comparison Table */}
        <div className="rounded-md border dark:border-zinc-700 overflow-hidden">
          {/* Table Headers */}
          <div className="grid grid-cols-5 gap-4 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 p-2">
            <div>Field ID</div>
            <div>Applet Label</div>
            <div>Core Label</div>
            <div className="text-center">Status</div>
            <div className="text-center">Action</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y dark:divide-zinc-700">
            {(() => {
              // Create a set of all unique field IDs from both containers
              const appletFieldIds = new Set(
                appletContainer?.fields?.map((f) => f.id) || [],
              );
              const coreFieldIds = new Set(
                coreContainer?.fields?.map((f) => f.id) || [],
              );
              const allFieldIds = new Set([...appletFieldIds, ...coreFieldIds]);

              // Convert to array for rendering
              return Array.from(allFieldIds).map((fieldId) => {
                const appletField = appletContainer?.fields?.find(
                  (f) => f.id === fieldId,
                );
                const coreField = coreContainer?.fields?.find(
                  (f) => f.id === fieldId,
                );
                const inApplet = !!appletField;
                const inCore = !!coreField;
                const labelsMatch =
                  inApplet && inCore && appletField.label === coreField.label;

                // Determine status styling
                let statusEl;
                if (inApplet && inCore) {
                  statusEl = labelsMatch ? (
                    <span className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Match
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1 text-yellow-600 dark:text-yellow-400">
                      <AlertCircle className="h-3.5 w-3.5" /> Different
                    </span>
                  );
                } else if (inApplet) {
                  statusEl = (
                    <span className="flex items-center justify-center gap-1 text-orange-600 dark:text-orange-400">
                      <XCircle className="h-3.5 w-3.5" /> Missing in Core
                    </span>
                  );
                } else {
                  statusEl = (
                    <span className="flex items-center justify-center gap-1 text-red-600 dark:text-red-400">
                      <XCircle className="h-3.5 w-3.5" /> Missing in Applet
                    </span>
                  );
                }

                return (
                  <div
                    key={fieldId}
                    className="grid grid-cols-5 gap-4 text-xs p-2 items-center"
                  >
                    <div
                      className="font-mono text-[10px] text-muted-foreground truncate"
                      title={fieldId}
                    >
                      {fieldId}
                    </div>
                    <div
                      className={cn(
                        !inApplet && "italic text-muted-foreground",
                        inApplet &&
                          inCore &&
                          !labelsMatch &&
                          "text-orange-600 dark:text-orange-400",
                      )}
                    >
                      {inApplet ? appletField.label : "—"}
                    </div>
                    <div
                      className={cn(
                        !inCore && "italic text-muted-foreground",
                        inApplet &&
                          inCore &&
                          !labelsMatch &&
                          "text-blue-600 dark:text-blue-400",
                      )}
                    >
                      {inCore ? coreField.label : "—"}
                    </div>
                    <div className="text-center">{statusEl}</div>
                    <div className="text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() =>
                          console.log("Action clicked for field:", fieldId)
                        }
                      >
                        Resolve
                      </Button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Field Summary */}
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm space-y-2">
          <div className="font-medium">Field Summary</div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="p-2 bg-white dark:bg-gray-700 rounded">
                <div className="font-medium">Similarity Score</div>
                <div className="text-2xl font-bold">
                  {(comparisonResult.details.similarityScore * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {comparisonResult.details.missingFieldIds.length > 0 && (
                <div className="p-2 bg-red-50 dark:bg-red-950 dark:text-red-100 rounded">
                  <div className="font-medium mb-1">Missing in Applet:</div>
                  <div className="text-[10px] max-h-16 overflow-y-auto">
                    {comparisonResult.details.missingFieldIds.map((id) => (
                      <div key={id} className="ml-2 truncate" title={id}>
                        • {id}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {comparisonResult.details.extraFieldIds.length > 0 && (
                <div className="p-2 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-100 rounded">
                  <div className="font-medium mb-1">Extra in Applet:</div>
                  <div className="text-[10px] max-h-16 overflow-y-auto">
                    {comparisonResult.details.extraFieldIds.map((id) => (
                      <div key={id} className="ml-2 truncate" title={id}>
                        • {id}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Field Details Modal */}
        {comparisonResult.fieldIdsMatch &&
          comparisonResult.details.fieldDifferences &&
          Object.keys(comparisonResult.details.fieldDifferences).length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-sm mb-3">
                Field Differences Detail
              </h4>
              <Tabs
                defaultValue={
                  Object.keys(comparisonResult.details.fieldDifferences)[0]
                }
                className="w-full"
              >
                <TabsList className="flex flex-wrap h-auto p-1">
                  {Object.entries(
                    comparisonResult.details.fieldDifferences,
                  ).map(([fieldId, differences]) => {
                    const coreField = coreContainer?.fields?.find(
                      (f) => f.id === fieldId,
                    );
                    const hasAnyDifference =
                      !differences.component.match ||
                      !differences.label.match ||
                      !differences.description.match ||
                      !differences.optionCount.match ||
                      !differences.propsSize.match ||
                      differences.hasOtherDifferences;

                    return (
                      <TabsTrigger
                        key={fieldId}
                        value={fieldId}
                        className={cn(
                          "text-xs",
                          hasAnyDifference &&
                            "data-[state=active]:bg-red-100 dark:data-[state=active]:bg-red-900",
                        )}
                      >
                        {coreField?.label || fieldId.slice(0, 8)}
                        {hasAnyDifference && (
                          <XCircle className="h-3 w-3 ml-1 text-red-600 dark:text-red-400" />
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>

                {Object.entries(comparisonResult.details.fieldDifferences).map(
                  ([fieldId, differences]) => {
                    const coreField = coreContainer?.fields?.find(
                      (f) => f.id === fieldId,
                    );

                    return (
                      <TabsContent
                        key={fieldId}
                        value={fieldId}
                        className="mt-4"
                      >
                        <div className="space-y-4">
                          <div className="grid grid-cols-4 gap-2 text-sm font-medium border-b dark:border-zinc-700 pb-1">
                            <div>Property</div>
                            <div>Applet Value</div>
                            <div>Core Value</div>
                            <div className="text-center">Match</div>
                          </div>
                          <FieldDetails
                            field={coreField}
                            differences={differences}
                          />
                        </div>
                      </TabsContent>
                    );
                  },
                )}
              </Tabs>
            </div>
          )}
      </div>

      {/* Overall Result */}
      <div
        className={cn(
          "p-4 rounded-lg text-sm font-medium text-center",
          comparisonResult.overallMatch
            ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
            : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300",
        )}
      >
        {comparisonResult.overallMatch
          ? "Containers Match"
          : "Containers Do Not Match"}
      </div>
    </div>
  );
};

export default ContainerComparisonDetails;
