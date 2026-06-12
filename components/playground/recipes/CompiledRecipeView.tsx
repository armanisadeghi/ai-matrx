import { useCompiledRecipeWithFetch } from "@/lib/redux/entity/hooks/entityUsedHooks";
import { InitialTableSchema } from "@/utils/schema/initialSchemas";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MarkdownStream from "@/components/MarkdownStream";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { User, Boxes, Settings } from "lucide-react";

type CompiledRecipeRecord = Record<
  string,
  {
    id: string;
    compiledRecipe: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    authenticatedRead: boolean;
    recipeId?: string;
    userId?: string;
    version?: number;
    recipeReference?: InitialTableSchema[];
    appletInverse?: InitialTableSchema[];
    customAppletConfigsInverse?: InitialTableSchema[];
  }
>;

export const CompiledRecipeView = ({ recipeId }: { recipeId: string }) => {
  const {
    fetchCompiledRecipePaginated,
    compiledRecipeRecords,
    compiledRecipeIsLoading,
    compiledRecipeIsError,
  } = useCompiledRecipeWithFetch();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (recipeId) {
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
  }, [recipeId]);

  // Auto-select the first version when records load
  useEffect(() => {
    const records = Object.values(compiledRecipeRecords || {});
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
  }, [compiledRecipeRecords, selectedVersionId]);

  if (compiledRecipeIsLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (compiledRecipeIsError) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-sm text-destructive">
          Error loading compiled recipe
        </p>
      </div>
    );
  }

  // Filter records to only show the ones matching the current recipeId
  const records = Object.values(compiledRecipeRecords || {}).filter(
    (record) => record.recipeId === recipeId,
  );
  if (records.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No compiled recipe found
        </p>
      </div>
    );
  }

  // Sort records by version or date (ascending order)
  const sortedRecords = records.sort((a, b) => {
    if (a.version && b.version) {
      return a.version - b.version;
    }
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  });

  const selectedRecord =
    records.find((r) => r.id === selectedVersionId) || sortedRecords[0];
  const compiledRecipe = selectedRecord.compiledRecipe as any;

  const renderMessage = (message: any, index: number) => {
    const isSystem = message.role === "system";
    const isUser = message.role === "user";

    return (
      <div
        key={index}
        className="max-w-[1200px] w-full p-6 border border-blue-500 rounded-xl shadow-sm min-h-full"
      >
        <div className="flex gap-2">
          <div className="flex-shrink-0 mt-1">
            {isSystem ? (
              <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : isUser ? (
              <User className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <Boxes className="h-4 w-4 text-gray-600 dark:text-gray-400" />
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
              className="bg-textured p-4"
              allowFullScreenEditor={false}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderBroker = (broker: any, index: number) => (
    <Badge
      key={index}
      variant="outline"
      className={`text-xs px-2 py-1 bg-${broker.color}-500 text-white border-${broker.color}-500`}
    >
      {broker.name}
    </Badge>
  );

  return (
    <div className="w-full h-full flex flex-col gap-2 p-2">
      {/* Header with IDs and Version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-white">ID:</span>
          <code className="text-sm text-white px-4 rounded break-all">
            {selectedRecord.id}
          </code>
          <span className="text-sm text-white">Recipe:</span>
          <code className="text-sm text-white px-4 rounded break-all">
            {selectedRecord.recipeId}
          </code>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            v{selectedRecord.version || 1}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(selectedRecord.updatedAt).toLocaleDateString()}
          </span>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {records.length} versions
        </div>
      </div>

      {/* Version Selector */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <div className="flex flex-wrap gap-1">
          {sortedRecords.map((record) => (
            <button
              key={record.id}
              onClick={() => setSelectedVersionId(record.id)}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                selectedVersionId === record.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              v{record.version || "N/A"}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3">
          {/* Brokers Section */}
          {compiledRecipe?.brokers && compiledRecipe.brokers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Brokers</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {compiledRecipe.brokers.map(renderBroker)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Messages Section */}
          {compiledRecipe?.messages && compiledRecipe.messages.length > 0 && (
            <Card>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {compiledRecipe.messages.map(renderMessage)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Settings Section */}
          {compiledRecipe?.settings && compiledRecipe.settings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Settings</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {compiledRecipe.settings.map(
                    (setting: any, index: number) => (
                      <div
                        key={index}
                        className="p-2 rounded-lg bg-gray-50 dark:bg-gray-950/30"
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
                            <span className="text-muted-foreground">Temp:</span>
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
  );
};

interface CompiledRecipeOverlayProps {
  recipeRecord: any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  className?: string;
  title?: string;
}

export const CompiledRecipeOverlay: React.FC<CompiledRecipeOverlayProps> = ({
  recipeRecord,
  isOpen,
  onOpenChange,
  trigger,
  className,
  title,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className={cn(
          "w-[95vw] sm:w-[50vw] h-[90dvh] sm:h-[95dvh] max-w-none p-4 gap-0 flex flex-col overflow-hidden",
          className,
        )}
      >
        <DialogTitle className="text-lg font-semibold mb-4">
          {recipeRecord.name}
        </DialogTitle>
        <div className="flex-1 min-h-0 overflow-hidden">
          <CompiledRecipeView recipeId={recipeRecord.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
