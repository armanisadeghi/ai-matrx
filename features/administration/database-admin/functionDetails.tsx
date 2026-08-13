import React, { useState, type ComponentType, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Save, AlertCircle, Key, Clock, Code, Info } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SyntaxHighlighter from "./SyntaxHighlighter";
import { cn } from "@/lib/utils";
import type { DatabaseFunction } from "./types";
import { enumUrlCodec, useUrlState } from "@/lib/url-state/useUrlState";

interface FunctionDetailsProps {
  func: DatabaseFunction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FunctionDetails = ({
  func,
  open,
  onOpenChange,
}: FunctionDetailsProps) => {
  const [activeTab, setActiveTab] = useUrlState(
    "detailTab",
    enumUrlCodec(
      ["definition", "details", "permissions", "usage"] as const,
      "definition",
    ),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editedDefinition, setEditedDefinition] = useState("");
  const [saveError, setSaveError] = useState(null);

  React.useEffect(() => {
    if (func) {
      setEditedDefinition(func.definition);
      setIsEditing(false);
      setSaveError(null);
    }
  }, [func]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const CodeBlock = ({
    children,
    label,
    actions,
    language = "sql",
  }: {
    children: string;
    label?: string;
    actions?: ReactNode;
    language?: string;
  }) => (
    <div className="space-y-2 w-full">
      {label && (
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
          {actions && (
            <div className="opacity-70 hover:opacity-100 transition-opacity">
              {actions}
            </div>
          )}
        </div>
      )}
      <div className="relative group w-full">
        <SyntaxHighlighter code={children} language={language} />
      </div>
    </div>
  );

  if (!func) return null;

  const DetailItem = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: ReactNode;
  }) => (
    <div className="flex items-start gap-2 p-3 rounded-lg border bg-muted/5 w-full hover:bg-muted/10 transition-colors">
      <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="space-y-1 min-w-0 flex-1">
        <p
          className="text-sm font-medium text-muted-foreground"
          id={`${label.toLowerCase()}-label`}
        >
          {label}
        </p>
        <p
          className="text-sm break-words"
          aria-labelledby={`${label.toLowerCase()}-label`}
        >
          {value}
        </p>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl h-[85dvh] flex flex-col overflow-hidden">
        <DialogHeader className="space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 text-xl">
              <span className="font-mono font-semibold">{func.name}</span>
              <Badge
                variant={
                  func.security_type === "SECURITY DEFINER"
                    ? "default"
                    : "secondary"
                }
              >
                {func.security_type}
              </Badge>
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{func.schema}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Returns {func.returns}</span>
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 mt-4">
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(
                value as "definition" | "details" | "permissions" | "usage",
              )
            }
            className="flex flex-col flex-1"
          >
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger
                value="definition"
                className="flex items-center gap-2"
              >
                <Code className="h-4 w-4" />
                Definition
              </TabsTrigger>
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Info className="h-4 w-4" />
                Details
              </TabsTrigger>
              <TabsTrigger
                value="permissions"
                className="flex items-center gap-2"
              >
                <Key className="h-4 w-4" />
                Permissions
              </TabsTrigger>
              <TabsTrigger value="usage" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Usage
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0">
              <TabsContent
                value="definition"
                className="h-full m-0 data-[state=active]:flex flex-col"
              >
                <div className="relative flex-1 rounded-lg border bg-muted/5">
                  {isEditing ? (
                    <textarea
                      value={editedDefinition}
                      onChange={(e) => setEditedDefinition(e.target.value)}
                      className={cn(
                        "w-full h-full p-4 font-mono text-sm bg-transparent resize-none focus:outline-none",
                        "dark:text-white placeholder:text-muted-foreground",
                      )}
                      spellCheck="false"
                    />
                  ) : (
                    <ScrollArea className="h-full w-full">
                      <div className="p-4">
                        <SyntaxHighlighter code={func.definition} />
                      </div>
                    </ScrollArea>
                  )}
                  <div className="absolute top-2 right-2 space-x-2 bg-background/80 backdrop-blur-sm rounded-lg p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(func.definition)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={isEditing ? "destructive" : "secondary"}
                      size="sm"
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </Button>
                    {isEditing && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          // TODO: Implement save functionality
                          console.log("Save changes");
                        }}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent
                value="details"
                className="h-full m-0 data-[state=active]:flex flex-col"
              >
                <ScrollArea className="flex-1">
                  <div className="space-y-6 pr-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DetailItem
                        icon={Info}
                        label="Schema"
                        value={func.schema}
                      />
                      <DetailItem
                        icon={Key}
                        label="Security"
                        value={func.security_type}
                      />
                    </div>

                    <CodeBlock
                      label="Arguments"
                      actions={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(func.arguments)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      }
                    >
                      {func.arguments}
                    </CodeBlock>

                    <CodeBlock
                      label="Returns"
                      actions={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(func.returns)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      }
                    >
                      {func.returns}
                    </CodeBlock>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="permissions"
                className="h-full m-0 data-[state=active]:flex flex-col"
              >
                <ScrollArea className="flex-1">
                  <div className="space-y-4 pr-4">
                    <Alert variant="default" className="bg-muted/50">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Manage who can execute this function and view its
                        definition.
                      </AlertDescription>
                    </Alert>
                    <div className="p-8 text-center text-muted-foreground">
                      Permission management coming soon
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="usage"
                className="h-full m-0 data-[state=active]:flex flex-col"
              >
                <ScrollArea className="flex-1">
                  <div className="space-y-6 pr-4">
                    <CodeBlock
                      label="Example Usage"
                      actions={
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleCopy(
                              `SELECT * FROM ${func.name}(${func.arguments
                                .split(",")
                                .map((arg) => {
                                  const [name] = arg.trim().split(" ");
                                  return `${name} => 'value'`;
                                })
                                .join(", ")});`,
                            )
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      }
                    >
                      {`-- Example call with parameters
SELECT * FROM ${func.name}(${func.arguments
                        .split(",")
                        .map((arg) => {
                          const [name] = arg.trim().split(" ");
                          return `${name} => 'value'`;
                        })
                        .join(", ")});`}
                    </CodeBlock>

                    <div className="p-8 text-center text-muted-foreground">
                      Usage statistics coming soon
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FunctionDetails;
