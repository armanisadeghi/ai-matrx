"use client";

import { useCompiledRecipeWithFetch } from "@/lib/redux/entity/hooks/entityUsedHooks";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MarkdownStream from "@/components/MarkdownStream";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { User, Cable, Settings, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast-service";

type CompiledRecipeRecord = {
  id: string;
  compiledRecipe: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  authenticatedRead: boolean;
  recipeId?: string;
  userId?: string;
  version?: number;
};

interface RecipeVersionSelectorProps {
  recipeId: string;
  recipeName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConversionSuccess?: (promptId: string) => void;
}

export const RecipeVersionSelector: React.FC<RecipeVersionSelectorProps> = ({
  recipeId,
  recipeName,
  isOpen,
  onOpenChange,
  onConversionSuccess,
}) => {
  const {
    fetchCompiledRecipePaginated,
    compiledRecipeRecords,
    compiledRecipeIsLoading,
    compiledRecipeIsError,
  } = useCompiledRecipeWithFetch();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    if (recipeId && isOpen) {
      fetchCompiledRecipePaginated(1, 100, {
        filters: {
          conditions: [
            {
              field: "recipe_id",
              operator: "eq",
              value: recipeId,
            },
          ],
        },
        sort: {
          field: "version",
          direction: "asc",
        },
      });
    }
  }, [recipeId, isOpen]);

  // Auto-select the latest version when records load
  useEffect(() => {
    const records = Object.values(compiledRecipeRecords || {}).filter(
      (record) => record.recipeId === recipeId,
    );
    if (records.length > 0 && !selectedVersionId) {
      // Sort by version or date and select the latest (highest version)
      const sortedRecords = records.sort((a, b) => {
        if (a.version && b.version) {
          return b.version - a.version;
        }
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
      setSelectedVersionId(sortedRecords[0].id);
    }
  }, [compiledRecipeRecords, selectedVersionId, recipeId]);

  const handleConvert = async (useLatest: boolean = false) => {
    if (!selectedVersionId && !useLatest) {
      toast.error("Please select a version to convert");
      return;
    }

    setIsConverting(true);

    try {
      const body = useLatest
        ? { version: null } // Will use latest version
        : { compiledRecipeId: selectedVersionId };

      const response = await fetch(
        `/api/recipes/${recipeId}/convert-to-prompt`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to convert recipe to prompt",
        );
      }

      const data = await response.json();

      if (data.success && data.promptId) {
        const promptUrl = `/ai/prompts/edit/${data.promptId}`;

        toast.success("Recipe converted to prompt successfully!");
        onConversionSuccess?.(data.promptId);
        onOpenChange(false);

        // Suggest opening the new prompt via an in-app notification (action Toast not supported by toast.success)
        // Consider using a custom component if you want actionable notifications,
        // or leverage a dialog/modal for cross-page navigation.
      } else {
        throw new Error("Conversion succeeded but no prompt ID returned");
      }
    } catch (error) {
      console.error("Error converting recipe to prompt:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to convert recipe to prompt",
      );
    } finally {
      setIsConverting(false);
    }
  };

  if (compiledRecipeIsLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:w-[70vw] h-[90dvh] sm:h-[85dvh] max-w-none p-4 sm:p-6 gap-4 flex flex-col overflow-hidden">
          <DialogTitle className="text-lg font-semibold">
            Convert "{recipeName}" to Prompt
          </DialogTitle>
          <div className="w-full h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading versions...
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (compiledRecipeIsError) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:w-[70vw] h-[90dvh] sm:h-[85dvh] max-w-none p-4 sm:p-6 gap-4 flex flex-col overflow-hidden">
          <DialogTitle className="text-lg font-semibold">
            Convert "{recipeName}" to Prompt
          </DialogTitle>
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-sm text-destructive">
              Error loading compiled recipe versions
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Filter records to only show the ones matching the current recipeId
  const records = Object.values(compiledRecipeRecords || {}).filter(
    (record) => record.recipeId === recipeId,
  );

  if (records.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:w-[70vw] h-[90dvh] sm:h-[85dvh] max-w-none p-4 sm:p-6 gap-4 flex flex-col overflow-hidden">
          <DialogTitle className="text-lg font-semibold">
            Convert "{recipeName}" to Prompt
          </DialogTitle>
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            <p className="text-sm text-muted-foreground">
              No compiled recipe versions found
            </p>
            <p className="text-xs text-muted-foreground">
              This recipe needs to be compiled before it can be converted to a
              prompt.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Sort records by version or date (ascending order for display)
  const sortedRecords = records.sort((a, b) => {
    if (a.version && b.version) {
      return a.version - b.version;
    }
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const selectedRecord =
    records.find((r) => r.id === selectedVersionId) ||
    sortedRecords[sortedRecords.length - 1];
  const compiledRecipe = selectedRecord.compiledRecipe as any;

  const renderMessage = (message: any, index: number) => {
    const isSystem = message.role === "system";
    const isUser = message.role === "user";

    return (
      <div
        key={index}
        className="w-full p-4 border border-border rounded-lg shadow-sm"
      >
        <div className="flex gap-2">
          <div className="flex-shrink-0 mt-1">
            {isSystem ? (
              <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : isUser ? (
              <User className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <Cable className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="text-xs px-2 py-1">
                {message.role}
              </Badge>
            </div>
            <MarkdownStream
              content={message.content}
              className="bg-textured p-3 rounded"
              allowFullScreenEditor={false}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderBroker = (broker: any, index: number) => (
    <Badge key={index} variant="outline" className="text-xs px-2 py-1">
      {broker.name}
    </Badge>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[70vw] h-[90dvh] sm:h-[85dvh] max-w-none p-4 sm:p-6 gap-0 flex flex-col overflow-hidden">
        <DialogTitle className="text-lg font-semibold mb-4">
          Convert "{recipeName}" to Prompt
        </DialogTitle>

        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Header with IDs and Version */}
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Version:</span>
              <Badge variant="outline" className="text-sm">
                v{selectedRecord.version || 1}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(selectedRecord.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {records.length} versions available
            </div>
          </div>

          {/* Version Selector */}
          <div className="flex items-center gap-2 pb-2 border-b">
            <span className="text-sm font-medium">Select Version:</span>
            <div className="flex flex-wrap gap-1">
              {sortedRecords.map((record) => (
                <button
                  key={record.id}
                  onClick={() => setSelectedVersionId(record.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-all",
                    selectedVersionId === record.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background border-border hover:bg-muted hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center gap-1">
                    {selectedVersionId === record.id && (
                      <Check className="h-3 w-3" />
                    )}
                    v{record.version || "N/A"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <ScrollArea className="flex-1">
            <div className="space-y-3 pr-4">
              {/* Brokers Section */}
              {compiledRecipe?.brokers && compiledRecipe.brokers.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      Brokers (Variables)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      {compiledRecipe.brokers.map(renderBroker)}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Messages Section */}
              {compiledRecipe?.messages &&
                compiledRecipe.messages.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Messages
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="space-y-2">
                        {compiledRecipe.messages.map(renderMessage)}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Settings Section */}
              {compiledRecipe?.settings &&
                compiledRecipe.settings.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {compiledRecipe.settings.map(
                          (setting: any, index: number) => (
                            <div
                              key={index}
                              className="p-2 rounded-lg bg-muted/50"
                            >
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">
                                    Model:
                                  </span>
                                  <span className="ml-1 font-medium">
                                    {setting.model}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    Temp:
                                  </span>
                                  <span className="ml-1 font-medium">
                                    {setting.temperature}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    Max Tokens:
                                  </span>
                                  <span className="ml-1 font-medium">
                                    {setting.maxTokens}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    Provider:
                                  </span>
                                  <span className="ml-1 font-medium">
                                    {setting.provider}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 w-full justify-between">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isConverting}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => handleConvert(true)}
                disabled={isConverting}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  "Convert Latest"
                )}
              </Button>
              <Button
                onClick={() => handleConvert(false)}
                disabled={isConverting}
              >
                {isConverting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  "Convert Selected Version"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
