// StructuredPlanBlock.tsx
import React, { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, AlignLeft } from "lucide-react";
import StructuredPlanViewer from "./StructuredPlanViewer";
import { useToast } from "@/components/ui/use-toast";

interface StructuredPlanBlockProps {
  content: string;
}

const StructuredPlanBlock: React.FC<StructuredPlanBlockProps> = ({ content }) => {
  const [isOpen, setIsOpen] = useState(true);
  const { toast } = useToast();

  const handleCopySection = (text: string) => {
    toast({
      title: "Copied to clipboard",
      description: "The content has been copied to your clipboard",
    });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm my-4"
    >
      <CollapsibleTrigger className="relative flex w-full items-center justify-between rounded-t-lg py-3 px-4 font-medium hover:bg-accent/50 hover:shadow-sm">
        <div className="flex items-center gap-2">
          <AlignLeft className="h-4 w-4 text-primary" />
          <span>Structured Information</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-2">
          <StructuredPlanViewer
            content={content}
            hideTitle={false}
            onCopySection={handleCopySection}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default StructuredPlanBlock;