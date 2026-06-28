"use client";

import React, { useState, useEffect } from "react";
import { SaveIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { DebugLog } from "@/components/admin/debug-log-component";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectContainerById,
  selectContainerLoading,
} from "@/lib/redux/app-builder/selectors/containerSelectors";
import {
  setLabel,
  setShortLabel,
  setDescription,
} from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import {
  saveContainerThunk,
  saveOrUpdateContainerToAppletThunk,
} from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import { ContainerLabelAndHelpText } from "@/constants/app-builder-help-text";
import QuickRefSelect from "@/features/applet/components/stubs/QuickRefSelectFloatingLabel";
import ContainerFieldDisplay from "../../container-builder/ContainerFieldDisplay";

interface ContainerFormComponentProps {
  containerId: string | null;
  onSaveSuccess?: (containerId: string) => void;
  onCancelCreateNewContainer?: (containerId: string) => void;
  title?: string;
  initialAppletId?: string;
  mode?: "edit" | "new" | "list";
}

const ContainerFormComponent: React.FC<ContainerFormComponentProps> = ({
  containerId,
  onSaveSuccess,
  onCancelCreateNewContainer,
  title = "Container Details",
  initialAppletId,
  mode = "list",
}) => {
  const { toast } = useToast();
  const dispatch = useAppDispatch();
  const [isSaving, setIsSaving] = useState(false);
  const container = useAppSelector((state) =>
    containerId ? selectContainerById(state, containerId) : null,
  );
  const isLoading = useAppSelector(selectContainerLoading);
  const isDirty = container?.isDirty || false;

  const [selectedApplet, setSelectedApplet] = useState<string | null>(null);
  const [appletRecordKey, setAppletRecordKey] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);

  useEffect(() => {
    if (initialAppletId) {
      setSelectedApplet(initialAppletId);
      setAppletRecordKey(`id:${initialAppletId}`);
    } else if (appletRecordKey) {
      // Extract the applet ID from the record key if available
      const appletId = appletRecordKey.split(":")[1];
      if (appletId) {
        setSelectedApplet(appletId);
      }
    }
  }, [initialAppletId, appletRecordKey]);

  // Handle the case when appletRecordKey is set initially but selectedApplet isn't
  useEffect(() => {
    if (appletRecordKey && !selectedApplet) {
      const appletId = appletRecordKey.split(":")[1];
      if (appletId) {
        setSelectedApplet(appletId);
      }
    }
  }, [appletRecordKey, selectedApplet]);

  const allDisabled =
    isLoading || isSaving || isCompiling || !containerId || mode === "list";

  useEffect(() => {
    if (mode === "list") {
      setSelectedApplet(null);
    }
  }, [mode]);

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!containerId) return;

    dispatch(
      setLabel({
        id: containerId,
        label: e.target.value,
      }),
    );
  };

  const handleShortLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!containerId) return;

    dispatch(
      setShortLabel({
        id: containerId,
        shortLabel: e.target.value,
      }),
    );
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    if (!containerId) return;

    dispatch(
      setDescription({
        id: containerId,
        description: e.target.value,
      }),
    );
  };

  const handleSaveContainer = async () => {
    if (!containerId) return;

    setIsSaving(true);

    try {
      const result = await dispatch(saveContainerThunk(containerId)).unwrap();

      console.log(
        "ContainerFormComponent handleSaveContainer result",
        JSON.stringify(result, null, 2),
      );

      toast({
        title: "Success",
        description: "Container saved successfully.",
      });

      if (onSaveSuccess) {
        onSaveSuccess(result.id);
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          typeof error === "string" ? error : "Failed to save container.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAppletSelect = async (appletRecordKey: string) => {
    const appletId = appletRecordKey.split(":")[1];
    setSelectedApplet(appletId);
    setAppletRecordKey(appletRecordKey);
  };

  const handleCompileContainer = async () => {
    if (!containerId) return;

    setIsCompiling(true);

    try {
      await dispatch(
        saveOrUpdateContainerToAppletThunk({
          appletId: selectedApplet,
          containerId,
        }),
      ).unwrap();
    } catch (error) {
      toast({
        title: "Error",
        description:
          typeof error === "string" ? error : "Failed to compile container.",
        variant: "destructive",
      });
    } finally {
      setIsCompiling(false);
    }
  };

  if (!containerId) {
    return (
      <Card className="border-border bg-textured shadow-lg">
        <CardContent className="p-6 text-center text-gray-500 dark:text-gray-400">
          No container selected.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-textured shadow-lg">
      <CardHeader className="bg-gray-50 dark:bg-gray-800/50 border-b border-border">
        <CardTitle className="text-lg font-medium text-gray-800 dark:text-gray-200">
          {title}
          {isDirty && container?.label && (
            <span className="text-xs text-red-500 ml-2">(unsaved changes)</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <ContainerLabelAndHelpText
              fieldName="label"
              fieldLabel="Label"
              required={true}
            />
            <Input
              id="label"
              name="label"
              placeholder="Enter a label for this container"
              value={container?.label || ""}
              onChange={handleLabelChange}
              className="border-gray-300 dark:border-gray-700"
              disabled={allDisabled}
            />
          </div>

          <div className="space-y-2">
            <ContainerLabelAndHelpText
              fieldName="shortLabel"
              fieldLabel="Short Label (Optional)"
            />
            <Input
              id="shortLabel"
              name="shortLabel"
              placeholder="e.g. 'Personal' for 'Personal Information'"
              value={container?.shortLabel || ""}
              onChange={handleShortLabelChange}
              className="border-gray-300 dark:border-gray-700"
              disabled={allDisabled}
            />
          </div>

          <div className="space-y-2">
            <ContainerLabelAndHelpText
              fieldName="description"
              fieldLabel="Description (Optional)"
            />
            <Textarea
              id="description"
              name="description"
              placeholder="Enter a description for this container"
              value={container?.description || ""}
              onChange={handleDescriptionChange}
              className="border-gray-300 dark:border-gray-700 h-24 resize-none"
              disabled={allDisabled}
            />
          </div>

          {/* Fields Section */}
          <ContainerFieldDisplay
            containerId={containerId}
            fields={container?.fields || []}
            disabled={allDisabled}
          />

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => onCancelCreateNewContainer?.(containerId)}
              disabled={allDisabled}
              variant="outline"
              className="border-amber-500 text-amber-500"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SaveIcon className="mr-2 h-4 w-4" />
              )}
              Cancel
            </Button>
            <Button
              onClick={handleSaveContainer}
              disabled={allDisabled || !isDirty}
              variant="outline"
              className="border-blue-500 text-blue-500"
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SaveIcon className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <QuickRefSelect
              entityKey="customAppletConfigs"
              onSelect={handleAppletSelect}
              customSelectText="Choose Applet"
              disabled={allDisabled || isDirty}
              initialSelectedRecordKey={appletRecordKey}
            />
            {/* <DebugLog 
                            title="Button disable conditions"
                            values={{
                                isLoading,
                                isSaving,
                                isCompiling,
                                containerId,
                                hasContainerId: !!containerId,
                                selectedApplet,
                                hasSelectedApplet: !!selectedApplet,
                                isDirty,
                                appletRecordKey,
                            }}
                        /> */}
            <Button
              onClick={handleCompileContainer}
              disabled={
                isLoading ||
                isSaving ||
                isCompiling ||
                !containerId ||
                !selectedApplet ||
                isDirty
              }
              variant="outline"
              className="border-blue-500 text-blue-500"
            >
              {isCompiling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SaveIcon className="mr-2 h-4 w-4" />
              )}
              Compile
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ContainerFormComponent;
