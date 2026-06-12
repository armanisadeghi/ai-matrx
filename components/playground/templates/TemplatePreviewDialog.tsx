"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Code, Eye, Plus, FileText } from "lucide-react";
import { ContentBlock } from "@/features/rich-text-editor/config/contentBlocks";
import MarkdownStream from "@/components/MarkdownStream";
import { cn } from "@/lib/utils";

interface TemplatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ContentBlock | null;
  onInsert?: (template: ContentBlock) => void;
  onCopy?: (template: ContentBlock) => void;
}

export function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  onInsert,
  onCopy,
}: TemplatePreviewDialogProps) {
  const [activeTab, setActiveTab] = React.useState<"preview" | "raw">(
    "preview",
  );

  if (!template) return null;

  const handleInsert = () => {
    onInsert?.(template);
    onOpenChange(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(template.template);
    onCopy?.(template);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "structure":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "formatting":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "special":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300";
      case "ai-prompts":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90dvh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl mb-2">
                {template.label}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {template.description}
              </DialogDescription>
              {/* Removed category/subcategory badges - deprecated fields */}
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "preview" | "raw")}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preview">
              <Eye className="w-4 h-4 mr-2" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="raw">
              <Code className="w-4 h-4 mr-2" />
              Raw
            </TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-full rounded-md border-border bg-white dark:bg-gray-900">
              <div className="p-6">
                <MarkdownStream
                  content={template.template}
                  className="bg-transparent dark:bg-transparent p-4"
                  isStreamActive={false}
                  analysisData={null}
                  messageId={null}
                  allowFullScreenEditor={false}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-full rounded-md border-border bg-gray-50 dark:bg-gray-900">
              <pre className="p-6 text-sm text-gray-800 dark:text-gray-200 font-mono">
                {template.template}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-2" />
            Copy
          </Button>
          <Button onClick={handleInsert}>
            <Plus className="w-4 h-4 mr-2" />
            Insert Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
