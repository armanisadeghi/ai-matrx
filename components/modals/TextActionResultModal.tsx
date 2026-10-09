'use client';

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import React, { useState } from 'react';
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Replace, 
  Plus, 
  X, 
  Copy, 
  Check,
  ArrowDownToLine,
  ArrowUpToLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TextActionResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  aiResponse: string;
  onReplace?: (newText: string) => void;
  onInsertBefore?: (textToInsert: string) => void;
  onInsertAfter?: (textToInsert: string) => void;
  promptName?: string;
}

export function TextActionResultModal({
  isOpen,
  onClose,
  originalText,
  aiResponse,
  onReplace,
  onInsertBefore,
  onInsertAfter,
  promptName,
}: TextActionResultModalProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!(await copyText(kindTextToMarkdown(aiResponse)))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReplace = () => {
    onReplace?.(aiResponse);
    onClose();
  };

  const handleInsertBefore = () => {
    onInsertBefore?.(aiResponse);
    onClose();
  };

  const handleInsertAfter = () => {
    onInsertAfter?.(aiResponse);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Replace className="h-5 w-5" />
            {promptName ? `${promptName} Result` : 'AI Result'}
          </DialogTitle>
          <DialogDescription>
            Choose how to apply the AI-generated result to your text
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="result" className="flex-1 flex flex-col overflow-hidden">
          {/* phone-ok: three short segments fit a 390px strip; stacking tabs vertically reads as a menu */}
          <TabsList fill>
            <TabsTrigger value="result">AI Result</TabsTrigger>
            <TabsTrigger value="original">Original Text</TabsTrigger>
            <TabsTrigger value="compare">Side-by-Side</TabsTrigger>
          </TabsList>

          <TabsContent value="result" className="flex-1 overflow-hidden mt-4">
            <div className="flex items-center justify-between mb-2">
              <Badge>AI Generated</Badge>
              <Button
                variant="quiet"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/30">
              <div className="text-sm"><RichContent source={aiResponse ?? ""} level="standard" /></div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="original" className="flex-1 overflow-hidden mt-4">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline">Original</Badge>
            </div>
            <ScrollArea className="h-[400px] border rounded-lg p-4 bg-muted/30">
              <div /* rich-content-exempt: original text the user selected, shown verbatim */ className="whitespace-pre-wrap text-sm font-mono">
                {originalText}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="compare" className="flex-1 overflow-hidden mt-4">
            <div className="grid grid-cols-2 gap-4 h-[400px]">
              <div>
                <div className="mb-2">
                  <Badge variant="outline">Original</Badge>
                </div>
                <ScrollArea className="h-full border rounded-lg p-4 bg-muted/30">
                  <div /* rich-content-exempt: original text the user selected, shown verbatim */ className="whitespace-pre-wrap text-sm font-mono">
                    {originalText}
                  </div>
                </ScrollArea>
              </div>
              <div>
                <div className="mb-2">
                  <Badge>AI Result</Badge>
                </div>
                <ScrollArea className="h-full border rounded-lg p-4 bg-muted/30">
                  <div className="text-sm"><RichContent source={aiResponse ?? ""} level="standard" /></div>
                </ScrollArea>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button
            icon={<X />}
            variant="quiet"
            onClick={onClose}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {onInsertBefore && (
              <Button
                icon={<ArrowUpToLine />}
                variant="outline"
                onClick={handleInsertBefore}
              >
                Insert Before
              </Button>
            )}

            {onInsertAfter && (
              <Button
                icon={<ArrowDownToLine />}
                variant="outline"
                onClick={handleInsertAfter}
              >
                Insert After
              </Button>
            )}

            {onReplace && (
              <Button
                icon={<Replace />}
                variant="primary"
                onClick={handleReplace}
              >
                Replace Text
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

