"use client";

import { useState, useTransition, useEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Code,
  Settings,
  Rocket,
  Plus,
  X,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { SmartCodeEditorModal } from "@/features/code-editor/agent-code-editor/components/SmartCodeEditorModal";
import { PROMPT_APP_AGENT_PICKER } from "@/features/code-editor/agent-code-editor/agents";
import { getDefaultImportsForNewApps } from "../utils/allowed-imports";
import getSamplePromptAppCode from "../sample-app-code";
import { requireUserId } from "@/utils/auth/getUserId";

// Lazy-load CodeBlock to avoid circular dependency with Providers
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

interface CreatePromptAppFormProps {
  prompts: Array<{
    id: string;
    name: string;
    description?: string;
    variable_defaults?: Array<{ name: string; defaultValue: string }>;
    settings?: Record<string, any>;
  }>;
  categories: Array<{
    id: string;
    name: string;
    description?: string;
    icon?: string;
  }>;
  /** Pre-select a specific prompt */
  preselectedPromptId?: string;
  /** Callback when app is successfully created */
  onSuccess?: () => void;
}

const DEFAULT_ALLOWED_IMPORTS = getDefaultImportsForNewApps();

export function CreatePromptAppForm({
  prompts,
  categories,
  preselectedPromptId,
  onSuccess,
}: CreatePromptAppFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [promptId, setPromptId] = useState(preselectedPromptId || "");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [componentCode, setComponentCode] = useState(
    getSamplePromptAppCode("simple"),
  );
  const [variableSchema, setVariableSchema] = useState<string>("[]");
  const [allowedImports, setAllowedImports] = useState<string[]>(
    DEFAULT_ALLOWED_IMPORTS,
  );
  const [rateLimitPerIp, setRateLimitPerIp] = useState(5);
  const [rateLimitWindowHours, setRateLimitWindowHours] = useState(24);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showAIEditor, setShowAIEditor] = useState(false);

  // Selected prompt details
  const selectedPrompt = prompts.find((p) => p.id === promptId);

  // Auto-populate from preselected prompt
  useEffect(() => {
    if (preselectedPromptId && prompts.length > 0) {
      handlePromptSelect(preselectedPromptId);
    }
  }, [preselectedPromptId, prompts]);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug) {
      const autoSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .substring(0, 50);
      setSlug(autoSlug);
    }
  };

  // Add tag
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Add import
  const handleAddImport = (importPath: string) => {
    if (importPath && !allowedImports.includes(importPath)) {
      setAllowedImports([...allowedImports, importPath]);
    }
  };

  // Remove import
  const handleRemoveImport = (importPath: string) => {
    setAllowedImports(allowedImports.filter((i) => i !== importPath));
  };

  // Auto-populate variable schema from selected prompt
  const handlePromptSelect = (id: string) => {
    setPromptId(id);
    const prompt = prompts.find((p) => p.id === id);
    if (prompt?.variable_defaults) {
      const schema = prompt.variable_defaults.map((v) => ({
        name: v.name,
        type: "string",
        required: true,
        default: v.defaultValue,
      }));
      setVariableSchema(JSON.stringify(schema, null, 2));
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!promptId) {
      setError("Please select a prompt");
      return;
    }
    if (!slug.match(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/) || slug.length < 3) {
      setError(
        "Slug must be 3-50 characters, lowercase letters, numbers, and hyphens only",
      );
      return;
    }
    if (!componentCode.trim()) {
      setError("Component code is required");
      return;
    }

    // Parse variable schema
    let parsedSchema;
    try {
      parsedSchema = JSON.parse(variableSchema);
      if (!Array.isArray(parsedSchema)) {
        throw new Error("Variable schema must be an array");
      }
    } catch (err) {
      setError(
        "Invalid variable schema JSON: " +
          (err instanceof Error ? err.message : "Unknown error"),
      );
      return;
    }

    startTransition(async () => {
      try {
        // Get current user
        const userId = requireUserId();

        const { data, error: insertError } = await graveyardDb(supabase)
          .from("prompt_apps")
          .insert({
            user_id: userId, // REQUIRED for RLS policy
            prompt_id: promptId,
            slug,
            name,
            tagline: tagline || null,
            description: description || null,
            category: category || null,
            tags,
            component_code: componentCode,
            component_language: "tsx", // TypeScript + JSX for React components
            variable_schema: parsedSchema,
            allowed_imports: allowedImports,
            rate_limit_per_ip: rateLimitPerIp,
            rate_limit_window_hours: rateLimitWindowHours,
            status: "draft", // Start as draft
          })
          .select()
          .single();

        if (insertError) {
          console.error("Supabase insert error:", insertError);
          throw new Error(
            insertError.message || insertError.hint || "Database insert failed",
          );
        }

        if (!data) {
          throw new Error("No data returned from database");
        }

        setSuccess(true);

        // Call onSuccess callback if provided, otherwise redirect
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1500);
        } else {
          // Redirect after brief delay
          setTimeout(() => {
            router.push(`/prompt-apps/${data.id}`);
          }, 1500);
        }
      } catch (err) {
        console.error("Error creating app:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String(err.message)
              : "Failed to create app";
        setError(errorMessage);
      }
    });
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Heading */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Create Prompt App Manually</h2>
        <p className="text-muted-foreground">
          Full control over every aspect of your app
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Success Message */}
        {success && (
          <Card className="border-success bg-success/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-success">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <p className="font-semibold">App Created Successfully!</p>
                  <p className="text-sm">Redirecting to app editor...</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Message */}
        {error && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="pt-4">
              <p className="text-destructive font-semibold">{error}</p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList>
            <TabsTrigger value="basic">
              <Settings className="w-4 h-4 mr-2" />
              Basic Info
            </TabsTrigger>
            <TabsTrigger value="code">
              <Code className="w-4 h-4 mr-2" />
              Component Code
            </TabsTrigger>
            <TabsTrigger value="advanced">
              <Rocket className="w-4 h-4 mr-2" />
              Advanced
            </TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Two-column grid layout - responsive */}
                <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-x-4 gap-y-4 items-start">
                  {/* Prompt Selection */}
                  <Label htmlFor="prompt" className="md:pt-2">
                    Intelligence Prompt
                  </Label>
                  <div className="space-y-2">
                    <Select value={promptId} onValueChange={handlePromptSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a prompt..." />
                      </SelectTrigger>
                      <SelectContent>
                        {prompts.map((prompt) => (
                          <SelectItem key={prompt.id} value={prompt.id}>
                            {prompt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPrompt && (
                      <p className="text-sm text-muted-foreground">
                        {selectedPrompt.description || "No description"}
                      </p>
                    )}
                  </div>

                  {/* Separator spans both columns */}
                  <div className="col-span-1 md:col-span-2">
                    <Separator />
                  </div>

                  {/* Name */}
                  <Label htmlFor="name" className="md:pt-2">
                    App Name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g., Story Generator"
                    required
                  />

                  {/* Slug */}
                  <Label htmlFor="slug" className="md:pt-2">
                    App URL
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      aimatrx.com/p/fast/
                    </span>
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      placeholder="story-generator"
                      minLength={3}
                      maxLength={50}
                      required
                    />
                  </div>

                  {/* Tagline */}
                  <Label htmlFor="tagline" className="md:pt-2">
                    Tagline
                  </Label>
                  <Input
                    id="tagline"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Short description (1-2 sentences)"
                    maxLength={150}
                  />

                  {/* Category */}
                  <Label htmlFor="category" className="md:pt-2">
                    Category
                  </Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Tags */}
                  <Label htmlFor="tags" className="md:pt-2">
                    Tags
                  </Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="tags"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        placeholder="Add tag and press Enter"
                      />
                      <Button
                        type="button"
                        onClick={handleAddTag}
                        variant="outline"
                        size="icon"
                        className="flex-shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tag)}
                              className="ml-2 hover:text-destructive"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Description - Full width with label above */}
                <div className="space-y-2">
                  <Label htmlFor="description">
                    Description (supports markdown)
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Full description of your app..."
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Component Code Tab */}
          <TabsContent value="code" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>React Component Code (JSX/TSX)</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAIEditor(true)}
                  className="ml-auto"
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  AI Edit
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-[500px]">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <CodeBlock
                      code={componentCode}
                      language="tsx"
                      showLineNumbers={true}
                      onCodeChange={(newCode) => setComponentCode(newCode)}
                      className="[&>div:last-child]:min-h-[150px]"
                    />
                  </Suspense>
                  <p className="text-xs text-muted-foreground">
                    Click the edit icon to start coding, or paste your complete
                    React component code here. Must export default function.
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="variables">Variable Schema (JSON)</Label>
                  <Textarea
                    id="variables"
                    value={variableSchema}
                    onChange={(e) => setVariableSchema(e.target.value)}
                    placeholder='[{"name": "topic", "type": "string", "required": true}]'
                    rows={8}
                    className="font-mono text-sm"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    JSON array defining variables your UI will provide to the
                    prompt
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Allowed Imports</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {allowedImports.map((imp) => (
                    <Badge key={imp} variant="outline">
                      <Code className="w-3 h-3 mr-1" />
                      {imp}
                      <button
                        type="button"
                        onClick={() => handleRemoveImport(imp)}
                        className="ml-2 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Tab */}
          <TabsContent value="advanced" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Rate Limiting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rateLimit">Executions per IP</Label>
                    <Input
                      id="rateLimit"
                      type="number"
                      value={rateLimitPerIp}
                      onChange={(e) =>
                        setRateLimitPerIp(parseInt(e.target.value))
                      }
                      min={1}
                      max={100}
                    />
                    <p className="text-xs text-muted-foreground">
                      Free uses for anonymous users
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="window">Window (hours)</Label>
                    <Input
                      id="window"
                      type="number"
                      value={rateLimitWindowHours}
                      onChange={(e) =>
                        setRateLimitWindowHours(parseInt(e.target.value))
                      }
                      min={1}
                      max={168}
                    />
                    <p className="text-xs text-muted-foreground">
                      Reset period in hours
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4 pr-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending || success}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {success ? "Created!" : "Create Draft App"}
          </Button>
        </div>

        {/* AI Code Editor Modal — agent-system replacement of legacy AICodeEditorModal */}
        <SmartCodeEditorModal
          open={showAIEditor}
          onOpenChange={setShowAIEditor}
          agents={PROMPT_APP_AGENT_PICKER}
          defaultPickerAgentId={PROMPT_APP_AGENT_PICKER[0].id}
          initialCode={componentCode}
          language="tsx"
          onCodeChange={(newCode) => setComponentCode(newCode)}
          title="AI Code Editor"
        />
      </form>
    </div>
  );
}
