"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  AppWindow,
  Plus,
  ExternalLink,
  BarChart3,
  Globe,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast-service";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/utils/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Json } from "@/types/database.types";
import type { PromptApp, VariableSchemaItem } from "../types/promptAppTypes";
import { requireUserId } from "@/utils/auth/getUserId";

interface PromptVariable {
  name: string;
  defaultValue?: string;
  default_value?: string;
}

type ModalMode =
  | "from-prompt" // Coming from prompt editor — check for existing apps
  | "from-app"; // Coming from app editor — update prompt in this app

interface UpdatePromptAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId: string;
  promptName: string;
  mode: ModalMode;
  app?: PromptApp;
  onSuccess?: () => void;
  onCreateNew?: () => void;
}

type FlowStep =
  | "checking"
  | "app-choice"
  | "variable-comparison"
  | "processing"
  | "complete";

function normalizeVar(v: PromptVariable): {
  name: string;
  defaultValue: string;
} {
  return {
    name: (v.name || "").trim(),
    defaultValue: ((v.defaultValue ?? v.default_value ?? "") as string).trim(),
  };
}

function compareVariables(
  oldVars: PromptVariable[] | undefined,
  newVars: PromptVariable[] | undefined,
): {
  added: PromptVariable[];
  removed: PromptVariable[];
  changed: Array<{ old: PromptVariable; new: PromptVariable }>;
} {
  const oldMap = new Map((oldVars || []).map((v) => [v.name, v]));
  const newMap = new Map((newVars || []).map((v) => [v.name, v]));

  const added: PromptVariable[] = [];
  const removed: PromptVariable[] = [];
  const changed: Array<{ old: PromptVariable; new: PromptVariable }> = [];

  for (const [name, newVar] of newMap) {
    const oldVar = oldMap.get(name);
    if (!oldVar) {
      added.push(newVar);
    } else {
      const oldNorm = normalizeVar(oldVar);
      const newNorm = normalizeVar(newVar);
      if (oldNorm.defaultValue !== newNorm.defaultValue) {
        changed.push({ old: oldVar, new: newVar });
      }
    }
  }

  for (const [name] of oldMap) {
    if (!newMap.has(name)) {
      removed.push(oldMap.get(name)!);
    }
  }

  return { added, removed, changed };
}

function schemaToPromptVars(
  schema: VariableSchemaItem[] | Json | null | undefined,
): PromptVariable[] {
  if (!Array.isArray(schema)) return [];
  const out: PromptVariable[] = [];
  for (const item of schema) {
    if (!item || typeof item !== "object" || !("name" in item)) continue;
    const s = item as VariableSchemaItem;
    if (typeof s.name !== "string") continue;
    out.push({
      name: s.name,
      defaultValue: s.default != null ? String(s.default) : "",
    });
  }
  return out;
}

export function UpdatePromptAppModal({
  isOpen,
  onClose,
  promptId,
  promptName,
  mode,
  app: initialApp,
  onSuccess,
  onCreateNew,
}: UpdatePromptAppModalProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [step, setStep] = useState<FlowStep>("checking");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [existingApps, setExistingApps] = useState<PromptApp[]>([]);
  const [selectedApp, setSelectedApp] = useState<PromptApp | null>(null);
  const [appAction, setAppAction] = useState<"update" | "create-new">("update");
  const [updatedApp, setUpdatedApp] = useState<PromptApp | null>(null);
  const [variableComparison, setVariableComparison] = useState<ReturnType<
    typeof compareVariables
  > | null>(null);
  const [promptVariables, setPromptVariables] = useState<PromptVariable[]>([]);
  const [hasStructuralChanges, setHasStructuralChanges] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("checking");
      setError("");
      setUpdatedApp(null);
      setSelectedApp(null);
      setVariableComparison(null);
      setHasStructuralChanges(false);

      if (mode === "from-prompt") {
        checkForExistingApps();
      } else {
        checkPromptChangesForApp();
      }
    } else {
      setExistingApps([]);
      setSelectedApp(null);
      setAppAction("update");
      setUpdatedApp(null);
      setPromptVariables([]);
    }
  }, [isOpen, promptId, mode]);

  const fetchPromptVariables = async (): Promise<PromptVariable[]> => {
    try {
      const response = await fetch(`/api/prompts/${promptId}`);
      if (!response.ok) throw new Error("Failed to fetch prompt data");
      const data = await response.json();
      const variables = data.variable_defaults || [];
      setPromptVariables(variables);
      return variables;
    } catch (err) {
      console.error("Error fetching prompt data:", err);
      setPromptVariables([]);
      return [];
    }
  };

  const checkForExistingApps = async () => {
    try {
      const vars = await fetchPromptVariables();

      const userId = requireUserId();

      const { data: apps, error: queryError } = await supabase
        .from("prompt_apps")
        .select("*")
        .eq("prompt_id", promptId)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (queryError) throw queryError;

      setExistingApps(apps || []);

      if (apps && apps.length > 0) {
        setSelectedApp(apps[0]);
        setAppAction("update");
      } else {
        setAppAction("create-new");
      }
      setStep("app-choice");
    } catch (err: any) {
      console.error("Error checking for existing apps:", err);
      setError(err.message || "Failed to check for existing apps");
      setAppAction("create-new");
      setStep("app-choice");
    }
  };

  const checkPromptChangesForApp = async () => {
    if (!initialApp) return;
    try {
      const vars = await fetchPromptVariables();

      const currentAppVars = schemaToPromptVars(initialApp.variable_schema);
      const comparison = compareVariables(currentAppVars, vars);

      const structural =
        comparison.added.length > 0 || comparison.removed.length > 0;
      setHasStructuralChanges(structural);

      if (
        comparison.added.length > 0 ||
        comparison.removed.length > 0 ||
        comparison.changed.length > 0
      ) {
        setVariableComparison(comparison);
        setSelectedApp(initialApp);
        setStep("variable-comparison");
      } else {
        setSelectedApp(initialApp);
        await performSync(initialApp, vars, false);
      }
    } catch (err: any) {
      console.error("Error checking prompt changes:", err);
      setError(err.message || "Failed to check prompt changes");
      setStep("app-choice");
    }
  };

  const handleAppAction = async () => {
    if (appAction === "create-new") {
      onClose();
      if (onCreateNew) {
        onCreateNew();
      } else {
        router.push(`/prompt-apps/new?promptId=${promptId}`);
      }
      return;
    }

    if (!selectedApp) return;

    if (step === "app-choice") {
      const currentAppVars = schemaToPromptVars(selectedApp.variable_schema);
      const comparison = compareVariables(currentAppVars, promptVariables);

      if (
        comparison.added.length > 0 ||
        comparison.removed.length > 0 ||
        comparison.changed.length > 0
      ) {
        const structural =
          comparison.added.length > 0 || comparison.removed.length > 0;
        setHasStructuralChanges(structural);
        setVariableComparison(comparison);
        setStep("variable-comparison");
        return;
      }
    }

    await performSync(selectedApp, promptVariables, hasStructuralChanges);
  };

  const performSync = async (
    targetApp: PromptApp,
    newVars: PromptVariable[],
    markAsDraft: boolean,
  ) => {
    setIsProcessing(true);
    setError("");
    setStep("processing");

    try {
      const updatedSchema: VariableSchemaItem[] = newVars.map((v) => ({
        name: v.name,
        type: "string",
        label: v.name
          .split("_")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        default: v.defaultValue ?? v.default_value ?? "",
        required: false,
      }));

      const updatePayload: Record<string, any> = {
        variable_schema: updatedSchema,
      };

      if (markAsDraft && targetApp.status === "published") {
        updatePayload.status = "draft";
        updatePayload.published_at = null;
      }

      const response = await fetch(`/api/prompt-apps/${targetApp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Update failed (${response.status})`);
      }

      const data = await response.json();
      setUpdatedApp(data);

      const draftMsg =
        markAsDraft && targetApp.status === "published"
          ? " App has been moved to draft status."
          : "";
      toast.success(`App variables synced!${draftMsg}`);

      setStep("complete");
    } catch (err: any) {
      console.error("App sync error:", err);
      setError(err.message || "An unexpected error occurred");
      setStep(mode === "from-prompt" ? "app-choice" : "variable-comparison");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = () => {
    onSuccess?.();
    onClose();
  };

  const handleResetAndClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  const currentVars = useMemo(() => {
    if (mode === "from-app" && initialApp) {
      return schemaToPromptVars(initialApp.variable_schema);
    }
    if (selectedApp) {
      return schemaToPromptVars(selectedApp.variable_schema);
    }
    return [];
  }, [mode, initialApp, selectedApp]);

  const renderContent = () => {
    switch (step) {
      case "checking":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              {mode === "from-prompt"
                ? "Checking for existing apps..."
                : "Checking for prompt changes..."}
            </p>
          </div>
        );

      case "app-choice": {
        const hasExistingApps = existingApps.length > 0;

        return (
          <div className="space-y-3">
            {hasExistingApps && (
              <Alert className="border-primary/30 bg-primary/5">
                <AppWindow className="h-4 w-4 text-primary" />
                <AlertDescription className="text-foreground">
                  <strong>
                    Found {existingApps.length} existing app
                    {existingApps.length > 1 ? "s" : ""}
                  </strong>{" "}
                  built from this prompt. You can update one or create a new
                  app.
                </AlertDescription>
              </Alert>
            )}

            <RadioGroup
              value={appAction}
              onValueChange={(v) => setAppAction(v as "update" | "create-new")}
            >
              <div className="space-y-2">
                <div
                  className={`flex items-center space-x-2 p-2 rounded border ${hasExistingApps ? "bg-card" : "bg-muted/50 opacity-60"}`}
                >
                  <RadioGroupItem
                    value="update"
                    id="update-app"
                    disabled={!hasExistingApps}
                  />
                  <Label
                    htmlFor="update-app"
                    className={`font-medium flex-1 ${hasExistingApps ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    Update Existing App
                    {!hasExistingApps && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (none found)
                      </span>
                    )}
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-2 rounded border bg-card">
                  <RadioGroupItem value="create-new" id="create-new-app" />
                  <Label
                    htmlFor="create-new-app"
                    className="font-medium cursor-pointer flex-1"
                  >
                    Create New App
                  </Label>
                </div>
              </div>
            </RadioGroup>

            {appAction === "update" && hasExistingApps && (
              <div className="space-y-2">
                <Label className="text-sm">Select App to Update</Label>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-1.5">
                    {existingApps.map((existingApp) => (
                      <div
                        key={existingApp.id}
                        onClick={() => setSelectedApp(existingApp)}
                        className={`p-2.5 border rounded cursor-pointer transition-colors ${
                          selectedApp?.id === existingApp.id
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/50 hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <AppWindow className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <span className="font-medium text-sm truncate">
                              {existingApp.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge
                              variant={
                                existingApp.status === "published"
                                  ? "default"
                                  : "secondary"
                              }
                              className={`text-[10px] px-1.5 py-0 ${
                                existingApp.status === "published"
                                  ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                  : ""
                              }`}
                            >
                              {existingApp.status === "published" ? (
                                <>
                                  <Globe className="w-2.5 h-2.5 mr-0.5" />
                                  Live
                                </>
                              ) : (
                                "Draft"
                              )}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <BarChart3 className="w-2.5 h-2.5" />
                              {existingApp.total_executions}
                            </span>
                          </div>
                        </div>
                        {existingApp.tagline && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1 ml-6">
                            {existingApp.tagline}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );
      }

      case "variable-comparison": {
        const updatedVars = promptVariables || [];
        const willMarkDraft =
          hasStructuralChanges &&
          (selectedApp?.status === "published" ||
            initialApp?.status === "published");

        return (
          <div className="space-y-3">
            <Alert variant="default" className="border-warning bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-foreground">
                <strong>Variable Changes Detected</strong> — Review carefully
                before updating.
                {hasStructuralChanges && (
                  <span className="block mt-1 text-sm">
                    Variables were added or removed. The app&apos;s component
                    code likely references these variables and{" "}
                    <strong>may break</strong> after this update.
                  </span>
                )}
              </AlertDescription>
            </Alert>

            {willMarkDraft && (
              <Alert
                variant="default"
                className="border-destructive/50 bg-destructive/5"
              >
                <AlertCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-foreground text-sm">
                  This app is currently <strong>published</strong>. Because
                  variables are being added/removed, the app will be{" "}
                  <strong>moved to draft</strong> to prevent broken experiences
                  for users.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <h4 className="font-semibold text-xs">
                  Current App Variables ({currentVars.length})
                </h4>
                <ScrollArea className="h-[200px] border rounded p-2 bg-muted/30">
                  {currentVars.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No variables
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {currentVars.map((v) => {
                        const isRemoved = variableComparison?.removed.some(
                          (rv) => rv.name === v.name,
                        );
                        const isChanged = variableComparison?.changed.some(
                          (cv) => cv.old.name === v.name,
                        );

                        return (
                          <div
                            key={v.name}
                            className={`p-1.5 rounded border text-xs ${
                              isRemoved
                                ? "bg-destructive/10 border-destructive/30"
                                : isChanged
                                  ? "bg-warning/10 border-warning/30"
                                  : "bg-background border-border"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <code className="font-mono font-semibold">
                                {v.name}
                              </code>
                              {isRemoved && (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] px-1 py-0"
                                >
                                  REMOVED
                                </Badge>
                              )}
                              {isChanged && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 bg-warning/20 border-warning"
                                >
                                  CHANGED
                                </Badge>
                              )}
                            </div>
                            {v.defaultValue && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                                {v.defaultValue}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="space-y-1.5">
                <h4 className="font-semibold text-xs">
                  Updated Prompt Variables ({updatedVars.length})
                </h4>
                <ScrollArea className="h-[200px] border rounded p-2 bg-muted/30">
                  {updatedVars.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No variables
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {updatedVars.map((v) => {
                        const isAdded = variableComparison?.added.some(
                          (av) => av.name === v.name,
                        );
                        const isChanged = variableComparison?.changed.some(
                          (cv) => cv.new.name === v.name,
                        );

                        return (
                          <div
                            key={v.name}
                            className={`p-1.5 rounded border text-xs ${
                              isAdded
                                ? "bg-success/10 border-success/30"
                                : isChanged
                                  ? "bg-warning/10 border-warning/30"
                                  : "bg-background border-border"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <code className="font-mono font-semibold">
                                {v.name}
                              </code>
                              {isAdded && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 bg-success/20 border-success"
                                >
                                  NEW
                                </Badge>
                              )}
                              {isChanged && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 bg-warning/20 border-warning"
                                >
                                  CHANGED
                                </Badge>
                              )}
                            </div>
                            {v.defaultValue && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                                {v.defaultValue}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {variableComparison &&
              (variableComparison.added.length > 0 ||
                variableComparison.removed.length > 0 ||
                variableComparison.changed.length > 0) && (
                <div className="p-2 bg-muted rounded border">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {variableComparison.added.length > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span>
                          <strong>{variableComparison.added.length}</strong>{" "}
                          added
                        </span>
                      </div>
                    )}
                    {variableComparison.removed.length > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                        <span>
                          <strong>{variableComparison.removed.length}</strong>{" "}
                          removed
                        </span>
                      </div>
                    )}
                    {variableComparison.changed.length > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                        <span>
                          <strong>{variableComparison.changed.length}</strong>{" "}
                          modified
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );
      }

      case "processing":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              Syncing app with prompt changes...
            </p>
          </div>
        );

      case "complete":
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-success/10 rounded-full p-4 mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">App Updated!</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {hasStructuralChanges && updatedApp?.status === "draft"
                ? "Variables synced. The app has been moved to draft — review the component code before republishing."
                : "Variables synced with the latest prompt changes."}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  const renderActions = () => {
    switch (step) {
      case "checking":
        return null;

      case "app-choice":
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleResetAndClose}
              disabled={isProcessing}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleAppAction()}
              disabled={
                isProcessing || (appAction === "update" && !selectedApp)
              }
              size="sm"
            >
              {appAction === "update" ? (
                <>
                  Update <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Create New <Plus className="ml-1.5 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        );

      case "variable-comparison":
        return (
          <div className="flex justify-between">
            {mode === "from-prompt" && (
              <Button
                variant="outline"
                onClick={() => setStep("app-choice")}
                disabled={isProcessing}
                size="sm"
              >
                Back
              </Button>
            )}
            <div
              className={`flex gap-2 ${mode === "from-app" ? "ml-auto" : ""}`}
            >
              <Button
                variant="outline"
                onClick={handleResetAndClose}
                disabled={isProcessing}
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  performSync(
                    selectedApp || initialApp!,
                    promptVariables,
                    hasStructuralChanges,
                  )
                }
                disabled={isProcessing}
                size="sm"
              >
                {hasStructuralChanges
                  ? "Confirm & Move to Draft"
                  : "Confirm Update"}
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );

      case "processing":
        return null;

      case "complete":
        return (
          <div className="flex justify-end gap-2">
            <Button onClick={handleComplete} size="sm">
              Close
            </Button>
            {updatedApp && (
              <Button
                variant="outline"
                onClick={() => {
                  handleComplete();
                  router.push(`/prompt-apps/${updatedApp.id}`);
                }}
                size="sm"
              >
                Open App
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case "checking":
        return mode === "from-prompt"
          ? "Checking for existing apps..."
          : "Checking for prompt changes...";
      case "app-choice":
        return existingApps.length > 0
          ? `Found ${existingApps.length} existing app${existingApps.length > 1 ? "s" : ""} — update or create new`
          : "No existing apps found — create a new one";
      case "variable-comparison":
        return "Review variable changes before updating";
      case "processing":
        return "Syncing...";
      case "complete":
        return "Completed successfully";
      default:
        return "";
    }
  };

  const title =
    mode === "from-prompt" ? "Create / Update App" : "Update App from Prompt";

  const content = (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3">{renderContent()}</div>
      <div className="px-4 pb-3 pt-2 border-t">{renderActions()}</div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={handleResetAndClose}>
        <DrawerContent className="max-h-[85dvh] flex flex-col">
          <DrawerHeader className="border-b">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{getStepDescription()}</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleResetAndClose}>
      <DialogContent
        className="max-w-2xl max-h-[90dvh] flex flex-col p-0"
        onPointerDownOutside={(e) => isProcessing && e.preventDefault()}
      >
        <DialogHeader className="px-4 pt-3 pb-2 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{getStepDescription()}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
