"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import type { Database, Json } from "@/types/database.types";
import { toast } from "@/lib/toast-service";
import { ContentEditorStack } from "@/components/official/content-editor/ContentEditorStack";
import { RecipeEditHeader } from "@/components/layout/new-layout/PageSpecificHeader";

interface CompiledVersion {
  id: string;
  recipe_id: string;
  version: number | null;
  compiled_recipe: any;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

interface RecipeEditContentProps {
  recipeId: string;
  recipeName: string;
  compiledVersions: CompiledVersion[];
  userId: string;
}

export function RecipeEditContent({
  recipeId,
  recipeName,
  compiledVersions,
  userId,
}: RecipeEditContentProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    compiledVersions.length > 0 ? compiledVersions[0].id : "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // State for message contents and metadata
  const [messageContents, setMessageContents] = useState<string[]>([]);
  const [messageRoles, setMessageRoles] = useState<string[]>([]);
  const [brokers, setBrokers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [settingsJson, setSettingsJson] = useState("");

  const selectedVersion = compiledVersions.find(
    (v) => v.id === selectedVersionId,
  );

  // Load content when version changes
  useEffect(() => {
    if (selectedVersion) {
      const compiledRecipe = selectedVersion.compiled_recipe;
      const messages = compiledRecipe?.messages || [];

      setMessageContents(messages.map((msg: any) => msg.content));
      setMessageRoles(messages.map((msg: any) => msg.role));
      setBrokers(compiledRecipe?.brokers || []);
      setSettings(compiledRecipe?.settings || []);
      setSettingsJson(JSON.stringify(compiledRecipe?.settings || [], null, 2));
      setIsDirty(false);
    }
  }, [selectedVersionId, selectedVersion]);

  const handleContentsChange = (newContents: string[]) => {
    setMessageContents(newContents);
    setIsDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const supabase = createClient();
      const latestVersion = compiledVersions[0]?.version || 0;
      const newVersion = latestVersion + 1;

      // Reconstruct messages with roles
      const finalMessages = messageContents.map((content, index) => ({
        role: messageRoles[index] || "user",
        content: content,
      }));

      const updatedCompiledRecipe = {
        messages: finalMessages,
        brokers: brokers,
        settings: settings,
      };

      const insertRow: Database["graveyard"]["Tables"]["compiled_recipe"]["Insert"] =
        {
          recipe_id: recipeId,
          version: newVersion,
          compiled_recipe: updatedCompiledRecipe as Json,
          user_id: userId,
          is_public: false,
        };

      const { error } = await graveyardDb(supabase)
        .from("compiled_recipe")
        .insert(insertRow);

      if (error) throw error;

      toast.success(`Saved as version ${newVersion}!`);
      setIsDirty(false);
      window.location.reload();
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSettingsSave = () => {
    try {
      const parsed = JSON.parse(settingsJson);
      setSettings(parsed);
      setIsDirty(true);
      setIsSettingsOpen(false);
      toast.success("Settings updated!");
    } catch (error) {
      toast.error("Invalid JSON format");
    }
  };

  if (!selectedVersion) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      {/* Compact header in portal */}
      <RecipeEditHeader
        recipeId={recipeId}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onSettingsClick={() => setIsSettingsOpen(true)}
        nextVersion={(compiledVersions[0]?.version || 0) + 1}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar - Single scroll area for all content */}
        <div className="w-52 border-r flex flex-col flex-shrink-0 overflow-hidden">
          {/* Version Selector - Fixed at top */}
          <div className="p-2 border-b flex-shrink-0">
            <Select
              value={selectedVersionId}
              onValueChange={setSelectedVersionId}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compiledVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">
                    v{v.version || "N/A"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scrollable area for Brokers and Settings */}
          <ScrollArea className="flex-1">
            <div className="flex flex-col">
              {/* Brokers */}
              <div className="p-2 border-b">
                <div className="text-xs font-medium text-muted-foreground uppercase mb-1.5">
                  Brokers ({brokers.length})
                </div>
                <div className="space-y-1">
                  {brokers.map((broker, i) => (
                    <div
                      key={i}
                      className="text-xs px-1.5 py-1 bg-muted rounded truncate"
                    >
                      {broker.name}
                    </div>
                  ))}
                  {brokers.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">
                      No brokers
                    </div>
                  )}
                </div>
              </div>

              {/* Settings */}
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground uppercase mb-1.5">
                  Settings
                </div>
                <pre className="text-[9px] leading-tight whitespace-pre-wrap break-words">
                  {JSON.stringify(settings, null, 1)}
                </pre>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Main Content - Independent scroll area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <ContentEditorStack
                contents={messageContents}
                onContentsChange={handleContentsChange}
                availableModes={["plain", "wysiwyg", "markdown", "preview"]}
                initialMode="plain"
                collapsible={true}
                defaultCollapsed={false}
                generateTitle={(index) =>
                  `${messageRoles[index] || "Message"} ${index + 1}`
                }
                showModeSelector={true}
                spacing="sm"
              />
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Settings Modal */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-3xl max-h-[80dvh]">
          <DialogHeader>
            <DialogTitle>Edit Settings JSON</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            <Textarea
              value={settingsJson}
              onChange={(e) => setSettingsJson(e.target.value)}
              className="min-h-[480px] font-mono text-xs"
            />
          </ScrollArea>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSettingsOpen(false)}
              size="sm"
            >
              Cancel
            </Button>
            <Button onClick={handleSettingsSave} size="sm">
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
