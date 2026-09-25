// StructuredPlanViewer.tsx
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  CheckCheck,
  FileText,
  Hash,
  AlignJustify
} from "lucide-react";

interface StructuredPlanViewerProps {
  content: string;
  hideTitle?: boolean;
  onCopySection?: (text: string) => void;
}

const StructuredPlanViewer: React.FC<StructuredPlanViewerProps> = ({
  content,
  hideTitle = false,
  onCopySection = () => {}
}) => {
  const [stats, setStats] = useState({ 
    sectionCount: 0, 
    bulletPoints: 0,
    wordCount: 0 
  });
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Calculate stats from content
  useEffect(() => {
    if (!content) return;
    
    // Count headings (bolded text)
    const headingCount = (content.match(/\*\*[^*]+\*\*/g) || []).length;
    
    // Count bullet points
    const bulletCount = (content.match(/^\s*\*/gm) || []).length;
    
    // Count words
    const wordCount = content
      .replace(/\*\*/g, '')  // Remove ** formatting
      .split(/\s+/)
      .filter(word => word.trim().length > 0)
      .length;
    
    setStats({
      sectionCount: headingCount,
      bulletPoints: bulletCount,
      wordCount
    });
  }, [content]);

  // Handle copy section
  const handleCopy = () => {
    onCopySection(content);
    navigator.clipboard.writeText(content).then(() => {
      setCopiedSection('full');
      setTimeout(() => setCopiedSection(null), 2000);
    });
  };

  return (
    <TooltipProvider>
      <Card className="w-full bg-transparent border-none">
        <CardHeader className="pb-2">
          {!hideTitle && (
            <CardTitle>
              <div className="flex justify-between items-center">
                <span>Structured Information</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleCopy}
                  className="h-7 text-xs flex items-center gap-1"
                >
                  {copiedSection === 'full' ? (
                    <>
                      <CheckCheck className="h-3.5 w-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy All
                    </>
                  )}
                </Button>
              </div>
            </CardTitle>
          )}
          
          <div className="flex justify-between items-center mt-2">
            <div className="flex gap-4 text-xs text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <Hash className="h-3.5 w-3.5" />
                    <span>{stats.sectionCount} sections</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Number of sections</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <AlignJustify className="h-3.5 w-3.5" />
                    <span>{stats.bulletPoints} bullet points</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Number of bullet points</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <FileText className="h-3.5 w-3.5" />
                    <span>{stats.wordCount.toLocaleString()} words</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total word count</TooltipContent>
              </Tooltip>
            </div>
          </div>
          
          <Separator className="my-2" />
        </CardHeader>
        
        <CardContent className="pt-2">
          <div className="structured-plan-content">
            <BasicMarkdownContent imagePolicy="inherit" content={content} />
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default StructuredPlanViewer;