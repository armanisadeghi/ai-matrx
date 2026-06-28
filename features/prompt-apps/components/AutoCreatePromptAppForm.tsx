"use client";

import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import MarkdownStream from "@/components/MarkdownStream";

interface AutoCreatePromptAppFormProps {
  prompt?: any;
  prompts: any[];
  categories: any[];
  onSuccess?: () => void;
}

type CreationMode = "initial" | "select" | "describe";

export function AutoCreatePromptAppForm({
  prompt,
  prompts,
  categories,
  onSuccess,
}: AutoCreatePromptAppFormProps) {
  const [creationMode, setCreationMode] = useState<CreationMode>("initial");
  const [format, setFormat] = useState<FormatType | null>("form");
  const [displayMode, setDisplayMode] = useState<DisplayMode | null>(
    "matrx-format",
  );
  const [responseMode, setResponseMode] = useState<ResponseMode | null>(
    "stream",
  );
  const [colorMode, setColorMode] = useState<"auto" | "custom">("auto");
  const [primaryColor, setPrimaryColor] = useState<string>("blue");
  const [secondaryColor, setSecondaryColor] = useState<string>("emerald");
  const [accentColor, setAccentColor] = useState<string>("zinc");
  const [additionalComments, setAdditionalComments] = useState("");
  const [describeText, setDescribeText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorModelResponse, setErrorModelResponse] = useState<string | null>(
    null,
  );
  const [showFullResponse, setShowFullResponse] = useState(false);
  const [useLightningMode, setUseLightningMode] = useState(false);

  // Track which variables are included in UI (true) vs using defaults (false)
  const [includedVariables, setIncludedVariables] = useState<
    Record<string, boolean>
  >({});
  const [includeUserInstructions, setIncludeUserInstructions] = useState(true);

  // Debug mode selector
  const isDebugMode = useAppSelector(selectIsDebugMode);

  // Safety check: If no prompt is provided, show a message
  if (!prompt) {
    return (
      <div className="flex items-center justify-center min-h-[40dvh]">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-muted-foreground text-lg">No prompt selected</p>
            <p className="text-sm text-muted-foreground">
              Please select a prompt from the dropdown above to continue
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Auto-create hook
  const {
    createApp,
    retry,
    isCreating,
    progress,
    codeTaskId,
    metadataTaskId,
    wasBackgrounded,
    canRetry,
    errorFullResponse,
    activeStage,
  } = useAutoCreateApp({
    onSuccess: (appId) => {
      console.log("[AutoCreatePromptAppForm] App created successfully:", appId);
      onSuccess?.();
    },
    onError: (errorMessage, fullResponse) => {
      console.error(
        "[AutoCreatePromptAppForm] Error creating app:",
        errorMessage,
      );
      if (fullResponse) {
        console.log(
          "[AutoCreatePromptAppForm] Full model response on failure:\n",
          fullResponse,
        );
      }
      setError(errorMessage);
      setErrorModelResponse(fullResponse ?? null);
      // Auto-expand the response viewer when we have one — most useful for debugging
      setShowFullResponse(!!fullResponse);
      // If failure happened in auto-mode (initial), switch to a mode that shows the ErrorCard
      setCreationMode((prev) => (prev === "initial" ? "describe" : prev));
    },
  });

  // Live streaming text from Redux — same pattern as AutoCreateDebugView
  const liveCodeText = useAppSelector((state) =>
    codeTaskId ? '' : "",
  );
  const liveMetadataText = useAppSelector((state) =>
    metadataTaskId
      ? ''
      : "",
  );
  const isCodeStreamEnded = useAppSelector((state) =>
    codeTaskId ? true : false,
  );

  // Extract variables from prompt
  const promptVariables = prompt?.variable_defaults || [];
  const promptName = prompt?.name || "Prompt";

  // Initialize included variables state when prompt changes
  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    promptVariables.forEach((variable: any) => {
      initialState[variable.name] = true; // All variables included by default
    });
    setIncludedVariables(initialState);
  }, [prompt]);

  // Reset to initial mode when prompt changes
  useEffect(() => {
    setCreationMode("initial");
    setError(null);
    setErrorModelResponse(null);
    setShowFullResponse(false);
  }, [prompt?.id]);

  const handleSubmit = async () => {
    setError(null);

    let finalFormat = format;
    let finalDisplayMode = displayMode;
    let finalResponseMode = responseMode;
    let finalColorMode = colorMode;
    let finalCustomInstructions = additionalComments;

    // Handle different creation modes
    if (creationMode === "describe") {
      // Use defaults but with user's description
      finalFormat = format || "form";
      finalDisplayMode = displayMode || "matrx-format";
      finalResponseMode = responseMode || "stream";
      finalColorMode = "auto";
      finalCustomInstructions = describeText || "";
    }

    if (!finalFormat || !finalDisplayMode || !finalResponseMode) return;

    // Generate builtin variables from configuration
    const builtinVariables = generateBuiltinVariables({
      promptObject: prompt,
      format: finalFormat,
      displayMode: finalDisplayMode,
      responseMode: finalResponseMode,
      includeUserInstructions:
        creationMode === "select" ? includeUserInstructions : true,
      includedVariables: creationMode === "select" ? includedVariables : {},
      variableDefaults: promptVariables,
      colorMode: finalColorMode,
      colors:
        finalColorMode === "custom"
          ? {
              primary: primaryColor,
              secondary: secondaryColor,
              accent: accentColor,
            }
          : undefined,
      customInstructions: finalCustomInstructions,
    });

    console.log(
      "[AutoCreatePromptAppForm] Submitting with builtin variables:",
      builtinVariables,
    );

    // Create the app using the hook
    await createApp({
      prompt,
      builtinVariables,
      mode: useLightningMode ? "lightning" : "standard",
    });
  };

  const isValid =
    (creationMode === "describe" && describeText.trim().length > 0) ||
    (creationMode === "select" && format && displayMode && responseMode);

  const toggleVariable = (variableName: string) => {
    setIncludedVariables((prev) => ({
      ...prev,
      [variableName]: !prev[variableName],
    }));
  };

  const handleAutoCreate = async () => {
    setError(null);

    // Use defaults for everything in auto mode
    const finalFormat = "form";
    const finalDisplayMode = "matrx-format";
    const finalResponseMode = "stream";
    const finalColorMode = "auto";
    const finalCustomInstructions = "Use the best options for this app.";

    // Generate builtin variables from configuration
    const builtinVariables = generateBuiltinVariables({
      promptObject: prompt,
      format: finalFormat,
      displayMode: finalDisplayMode,
      responseMode: finalResponseMode,
      includeUserInstructions: true,
      includedVariables: {},
      variableDefaults: promptVariables,
      colorMode: finalColorMode,
      customInstructions: finalCustomInstructions,
    });

    console.log(
      "[AutoCreatePromptAppForm] Auto-creating with builtin variables:",
      builtinVariables,
    );

    // Create the app using the hook
    await createApp({
      prompt,
      builtinVariables,
      mode: useLightningMode ? "lightning" : "standard",
    });
  };

  // Show loading screen while creating app
  if (isCreating) {
    return (
      <div className="space-y-3 w-full">
        {/* Compact sticky header bar */}
        <div className="flex items-center gap-3 py-2 border-b border-border">
          <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
          <span className="text-sm font-medium flex-1 truncate">
            {progress}
          </span>
          {/* Stage pills */}
          <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
            <span
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full",
                activeStage === "metadata"
                  ? "bg-primary/10 text-primary"
                  : metadataTaskId
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {metadataTaskId && activeStage !== "metadata" ? (
                <Check className="w-3 h-3" />
              ) : activeStage === "metadata" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span className="w-3 h-3 rounded-full border border-current inline-block" />
              )}
              Metadata
            </span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full",
                activeStage === "code"
                  ? "bg-primary/10 text-primary"
                  : isCodeStreamEnded
                    ? "bg-success/10 text-success"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {isCodeStreamEnded ? (
                <Check className="w-3 h-3" />
              ) : activeStage === "code" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span className="w-3 h-3 rounded-full border border-current inline-block" />
              )}
              Code
            </span>
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary to-secondary animate-pulse w-full" />
        </div>

        {/* Background tab warning */}
        {wasBackgrounded && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Tab was backgrounded — keep this tab visible to prevent the
              connection from being suspended.
            </p>
          </div>
        )}

        {/* Metadata panel — always shown once metadataTaskId is set */}
        {metadataTaskId && (
          <StreamPanel
            label="App metadata"
            taskLabel={isDebugMode ? metadataTaskId : undefined}
            text={liveMetadataText}
            isActive={activeStage === "metadata"}
            isComplete={activeStage !== "metadata"}
          />
        )}

        {/* Waiting for metadata to start */}
        {!metadataTaskId && activeStage === "metadata" && (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Initializing metadata generation...
          </div>
        )}

        {/* Code panel — appended below metadata once code stage starts */}
        {codeTaskId && (
          <StreamPanel
            label="Component code"
            taskLabel={isDebugMode ? codeTaskId : undefined}
            text={liveCodeText}
            isActive={activeStage === "code"}
            isComplete={isCodeStreamEnded}
          />
        )}

        {/* Waiting for code to start (metadata done, code not yet) */}
        {metadataTaskId && !codeTaskId && activeStage === "code" && (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Initializing code generation...
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground pt-1">
          This may take 1–2 minutes. Please keep this tab active and visible.
        </p>
      </div>
    );
  }

  // Render initial mode selection
  if (creationMode === "initial") {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Heading */}
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold">
            Create Your Custom{" "}
            <span className="text-primary">{promptName}</span> App
          </h2>
        </div>

        {/* Mode Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Auto Mode */}
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] group"
            onClick={handleAutoCreate}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 mx-auto">
                <Stars className="w-8 h-8 text-white" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">Let Us Handle It</h3>
                <p className="text-sm text-muted-foreground">
                  We'll create the perfect app for you using smart defaults.
                  Just click and go!
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-success font-medium pt-2">
                <Zap className="w-3.5 h-3.5" />
                <span>Fastest option</span>
              </div>
            </CardContent>
          </Card>

          {/* Select Mode */}
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] group"
            onClick={() => setCreationMode("select")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 mx-auto">
                <Layers className="w-8 h-8 text-white" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">Customize Options</h3>
                <p className="text-sm text-muted-foreground">
                  Choose from preset options to make it easier to guide the AI.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-primary font-medium pt-2">
                <Check className="w-3.5 h-3.5" />
                <span>Most popular</span>
              </div>
            </CardContent>
          </Card>

          {/* Describe Mode */}
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] group"
            onClick={() => setCreationMode("describe")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 mx-auto">
                <MessageSquare className="w-8 h-8 text-white" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">Describe Your Vision</h3>
                <p className="text-sm text-muted-foreground">
                  Tell us what you want in plain English. Voice or text. We'll
                  do the rest.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium pt-2">
                <Stars className="w-3.5 h-3.5" />
                <span>Most flexible</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Render describe mode
  if (creationMode === "describe") {
    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        {/* Back button and heading */}
        <div className="space-y-4">
          <Button
            variant="ghost"
            onClick={() => setCreationMode("initial")}
            className="gap-2"
            disabled={isCreating}
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back
          </Button>

          {/* Error Message */}
          {error && (
            <ErrorCard
              error={error}
              fullResponse={errorModelResponse}
              showFullResponse={showFullResponse}
              onToggleFullResponse={() => setShowFullResponse((v) => !v)}
              canRetry={canRetry}
              onRetry={retry}
            />
          )}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">
              Describe Your <span className="text-primary">{promptName}</span>{" "}
              App
            </h2>
          </div>
        </div>

        {/* Description textarea */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <Label className="text-base font-semibold">
              What should your app look like and do?
            </Label>
            <VoiceTextarea
              value={describeText}
              onChange={(e) => setDescribeText(e.target.value)}
              placeholder="Describe your vision... For example: 'I want a chat-style interface with a dark color scheme. The app should feel modern and professional with smooth animations. I'd like users to be able to input their text and see results stream in real-time...'"
              rows={12}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Be as specific or general as you like. Our AI will interpret your
              description and create the best possible app.
            </p>
          </CardContent>
        </Card>

        {/* Debug: Lightning Mode Toggle */}
        {isDebugMode && (
          <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <div>
                <Label
                  htmlFor="lightning-toggle-describe"
                  className="text-sm font-semibold text-amber-900 dark:text-amber-100 cursor-pointer"
                >
                  Lightning Mode (Debug)
                </Label>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Uses faster AI model for testing (less accurate)
                </p>
              </div>
            </div>
            <Switch
              id="lightning-toggle-describe"
              checked={useLightningMode}
              onCheckedChange={setUseLightningMode}
              disabled={isCreating}
            />
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isCreating}
            size="lg"
            className="min-w-[200px] gap-2"
          >
            {!isValid ? (
              "Describe your vision above"
            ) : (
              <>
                Generate My App
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Render select mode (existing form)
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => setCreationMode("initial")}
        className="gap-2"
        disabled={isCreating}
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back
      </Button>

      {/* Error Message */}
      {error && (
        <ErrorCard
          error={error}
          fullResponse={errorModelResponse}
          showFullResponse={showFullResponse}
          onToggleFullResponse={() => setShowFullResponse((v) => !v)}
          canRetry={canRetry}
          onRetry={retry}
        />
      )}

      {/* Heading with Prompt Name */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">
          Customize Your <span className="text-primary">{promptName}</span> App
        </h2>
      </div>

      {/* Step 1: Input Fields */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            1
          </div>
          <Label className="text-lg font-semibold">
            Configure Input Fields
          </Label>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Variable Cards */}
                {promptVariables.map((variable: any, index: number) => {
                  const isIncluded = includedVariables[variable.name] ?? true;
                  const hasOptions =
                    variable.customComponent?.options &&
                    variable.customComponent.options.length > 0;
                  const hasDefault =
                    variable.defaultValue && variable.defaultValue !== "";

                  return (
                    <Card
                      key={index}
                      className={cn(
                        "group relative cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
                        isIncluded &&
                          "ring-2 ring-primary shadow-lg scale-[1.02]",
                      )}
                      onClick={() => toggleVariable(variable.name)}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header with Icon and Toggle */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex items-center justify-center w-12 h-12 rounded-xl transition-colors",
                                isIncluded ? "bg-primary/10" : "bg-muted",
                              )}
                            >
                              {hasOptions ? (
                                <ListOrdered
                                  className={cn(
                                    "w-6 h-6 transition-colors",
                                    isIncluded
                                      ? "text-primary"
                                      : "text-muted-foreground",
                                  )}
                                />
                              ) : (
                                <Type
                                  className={cn(
                                    "w-6 h-6 transition-colors",
                                    isIncluded
                                      ? "text-primary"
                                      : "text-muted-foreground",
                                  )}
                                />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-sm">
                                {formatTitleCase(variable.name)}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {isIncluded
                                  ? "User can modify"
                                  : "Uses default value"}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={isIncluded}
                            onCheckedChange={() =>
                              toggleVariable(variable.name)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        {/* Hover Details */}
                        {(hasDefault || hasOptions) && (
                          <div className="pt-3 border-t space-y-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                            {hasDefault && (
                              <div>
                                <span className="font-medium text-muted-foreground">
                                  Default:
                                </span>
                                <p className="text-foreground mt-1 line-clamp-2">
                                  {variable.defaultValue}
                                </p>
                              </div>
                            )}
                            {hasOptions && (
                              <div>
                                <span className="font-medium text-muted-foreground">
                                  Options:
                                </span>
                                <ul className="mt-1 space-y-1">
                                  {variable.customComponent.options
                                    .slice(0, 3)
                                    .map((option: string, i: number) => (
                                      <li
                                        key={i}
                                        className="text-foreground truncate"
                                      >
                                        • {option}
                                      </li>
                                    ))}
                                  {variable.customComponent.options.length >
                                    3 && (
                                    <li className="text-muted-foreground">
                                      +{" "}
                                      {variable.customComponent.options.length -
                                        3}{" "}
                                      more
                                    </li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                {/* User Instructions Card */}
                <Card
                  className={cn(
                    "group relative cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
                    includeUserInstructions &&
                      "ring-2 ring-primary shadow-lg scale-[1.02]",
                  )}
                  onClick={() =>
                    setIncludeUserInstructions(!includeUserInstructions)
                  }
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header with Icon and Toggle */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex items-center justify-center w-12 h-12 rounded-xl transition-colors",
                            includeUserInstructions
                              ? "bg-secondary/10"
                              : "bg-muted",
                          )}
                        >
                          <MessageCircle
                            className={cn(
                              "w-6 h-6 transition-colors",
                              includeUserInstructions
                                ? "text-secondary"
                                : "text-muted-foreground",
                            )}
                          />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">
                            User Instructions
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {includeUserInstructions
                              ? "Allow custom instructions"
                              : "No custom instructions"}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={includeUserInstructions}
                        onCheckedChange={setIncludeUserInstructions}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {/* Hover Details */}
                    <div className="pt-3 border-t text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-muted-foreground">
                        Optional field where users can provide additional
                        context or specific instructions for the AI.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Info Footer */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <Stars className="w-3.5 h-3.5 text-primary" />
                <span>
                  Toggle each field to control whether users can modify it or if
                  it uses the default value. Hover for details.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Step 2: Format */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            2
          </div>
          <Label className="text-lg font-semibold">
            Choose Your App Format
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Form Format */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              format === "form" && "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setFormat("form")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-green-500/10">
                  <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                {format === "form" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Form Layout</h3>
                <p className="text-sm text-muted-foreground">
                  Traditional top-to-bottom flow. Input at top, results fill
                  down. Clean and familiar.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Chat Format */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              format === "chat" && "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setFormat("chat")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-blue-500/10">
                  <MessageSquare className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                {format === "chat" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Chat Layout</h3>
                <p className="text-sm text-muted-foreground">
                  Conversation flows with input at the bottom, like ChatGPT.
                  Perfect for interactive AI experiences.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Widget Format */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              format === "widget" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setFormat("widget")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-purple-500/10">
                  <Box className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                {format === "widget" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Widget Layout</h3>
                <p className="text-sm text-muted-foreground">
                  Confined widget perfect for embedding. Input → Loading →
                  Result in the same space.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Step 3: Display Mode */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            3
          </div>
          <Label className="text-lg font-semibold">
            How Should Results Display?
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Matrx Format Mode */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              displayMode === "matrx-format" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setDisplayMode("matrx-format")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500">
                  <Stars className="w-8 h-8 text-white" />
                </div>
                {displayMode === "matrx-format" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">
                  Matrx Custom Formatted Display
                </h3>
                <p className="text-sm text-muted-foreground">
                  Full AI Matrx experience with rich formatting, flashcards,
                  code blocks, and all custom UIs you're familiar with.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Custom Mode */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              displayMode === "custom" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setDisplayMode("custom")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-orange-500/10">
                  <Code2 className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                </div>
                {displayMode === "custom" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Custom Display</h3>
                <p className="text-sm text-muted-foreground">
                  Fully customized UI designed specifically for your output
                  structure. Complete control, but requires a highly reliable
                  prompt output.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Step 4: Response Mode */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            4
          </div>
          <Label className="text-lg font-semibold">
            Response Delivery Style
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stream Mode */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              responseMode === "stream" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setResponseMode("stream")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-green-500/10">
                  <Zap className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                {responseMode === "stream" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">
                  Real-time Streaming
                </h3>
                <p className="text-sm text-muted-foreground">
                  Content appears as it's generated. Feels responsive and
                  clearly AI-powered.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Loader Mode */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              responseMode === "loader" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setResponseMode("loader")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-blue-500/10">
                  <Clock className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                {responseMode === "loader" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Show All at Once</h3>
                <p className="text-sm text-muted-foreground">
                  Loading screen, then complete result. Feels like a traditional
                  app, less "AI-like".
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Step 5: Color Preferences */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">
            5
          </div>
          <Label className="text-lg font-semibold">
            Choose Your Color Palette
          </Label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Auto Colors */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              colorMode === "auto" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setColorMode("auto")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
                  <Stars className="w-8 h-8 text-white" />
                </div>
                {colorMode === "auto" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">
                  AI-Selected Colors
                </h3>
                <p className="text-sm text-muted-foreground">
                  Let AI choose the best color palette for your app based on its
                  purpose and style. Perfect for most use cases.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Custom Colors */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              colorMode === "custom" &&
                "ring-2 ring-primary shadow-lg scale-[1.02]",
            )}
            onClick={() => setColorMode("custom")}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-orange-500/10">
                  <Palette className="w-8 h-8 text-orange-600 dark:text-orange-400" />
                </div>
                {colorMode === "custom" && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Custom Colors</h3>
                <p className="text-sm text-muted-foreground">
                  Choose specific colors for your app. Full control over
                  primary, secondary, and accent colors.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Custom Color Pickers - Only shown when custom mode is selected */}
        {colorMode === "custom" && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Primary Color */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Palette className="w-4 h-4 text-primary" />
                      Primary Color
                    </Label>
                    <div className="flex items-center gap-3">
                      <TailwindColorPicker
                        selectedColor={primaryColor}
                        onColorChange={setPrimaryColor}
                        size="md"
                      />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Main brand color:
                          <br />
                          - Buttons
                          <br />
                          - Key Elements
                          <br />
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Secondary Color */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Palette className="w-4 h-4 text-secondary" />
                      Secondary Color
                    </Label>
                    <div className="flex items-center gap-3">
                      <TailwindColorPicker
                        selectedColor={secondaryColor}
                        onColorChange={setSecondaryColor}
                        size="md"
                      />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Supporting color:
                          <br />
                          - Headers
                          <br />
                          - Highlights
                          <br />
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Stars className="w-4 h-4 text-accent" />
                      Accent Color
                    </Label>
                    <div className="flex items-center gap-3">
                      <TailwindColorPicker
                        selectedColor={accentColor}
                        onColorChange={setAccentColor}
                        size="md"
                      />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Pop of color:
                          <br />
                          - Special elements
                          <br />
                          - Effects
                          <br />
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Step 6: Additional Comments */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold text-sm">
            6
          </div>
          <Label className="text-lg font-semibold">
            Additional Requirements{" "}
            <span className="text-muted-foreground font-normal">
              (Optional)
            </span>
          </Label>
        </div>

        <VoiceTextarea
          value={additionalComments}
          onChange={(e) => setAdditionalComments(e.target.value)}
          placeholder="Any specific UI features, styling preferences, or special functionality? For example: 'Add a copy button for the result' or 'Show a character counter' or 'Use a dark theme by default'..."
          rows={6}
          className="resize-none border border-border rounded-xl"
        />
      </div>

      {/* Debug: Lightning Mode Toggle */}
      {isDebugMode && (
        <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <Label
                htmlFor="lightning-toggle"
                className="text-sm font-semibold text-amber-900 dark:text-amber-100 cursor-pointer"
              >
                Lightning Mode (Debug)
              </Label>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                Uses faster AI model for testing (less accurate)
              </p>
            </div>
          </div>
          <Switch
            id="lightning-toggle"
            checked={useLightningMode}
            onCheckedChange={setUseLightningMode}
            disabled={isCreating}
          />
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isCreating}
          size="lg"
          className="min-w-[200px] gap-2"
        >
          {!isValid ? (
            "Complete All Steps"
          ) : (
            <>
              Generate My App
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>
      </div>

      {/* Progress Indicator */}
      {!isValid && (
        <div className="text-center text-sm text-muted-foreground">
          {!format && "Please select an app format to continue"}
          {format && !displayMode && "Please choose how results should display"}
          {format &&
            displayMode &&
            !responseMode &&
            "Please select a response delivery style"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StreamPanel — live streaming output for one generation stage
// ---------------------------------------------------------------------------

interface StreamPanelProps {
  label: string;
  taskLabel?: string;
  text: string;
  isActive: boolean;
  isComplete: boolean;
}

function StreamPanel({
  label,
  taskLabel,
  text,
  isActive,
  isComplete,
}: StreamPanelProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors",
        isActive && "border-primary/40",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 border-b text-xs",
          isActive ? "bg-primary/5" : "bg-muted/40",
        )}
      >
        <div className="flex items-center gap-2">
          {isActive ? (
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          ) : isComplete ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span
            className={cn(
              "font-medium",
              isActive
                ? "text-primary"
                : isComplete
                  ? "text-success"
                  : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {text && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              {text.length.toLocaleString()} chars
            </Badge>
          )}
        </div>
        {taskLabel && (
          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px]">
            {taskLabel}
          </span>
        )}
      </div>
      <CardContent className="p-0">
        {text ? (
          <div className="p-3">
            <MarkdownStream
              content={text}
              isStreamActive={isActive}
              hideCopyButton
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for response...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ErrorCard — shown when app creation fails
// ---------------------------------------------------------------------------

interface ErrorCardProps {
  error: string;
  fullResponse: string | null;
  showFullResponse: boolean;
  onToggleFullResponse: () => void;
  canRetry: boolean;
  onRetry: () => void;
}

function ErrorCard({
  error,
  fullResponse,
  showFullResponse,
  onToggleFullResponse,
  canRetry,
  onRetry,
}: ErrorCardProps) {
  const hasFullResponse = !!fullResponse;

  return (
    <Card className="border-destructive bg-destructive/5">
      <CardContent className="p-4 space-y-3">
        {/* Error headline + retry */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-destructive font-semibold text-sm leading-snug">
              {error}
            </p>
          </div>
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-2 flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          )}
        </div>

        {/* Full model response — shown when code extraction failed */}
        {hasFullResponse && (
          <div className="space-y-2">
            <button
              onClick={onToggleFullResponse}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showFullResponse ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              {showFullResponse ? "Hide" : "Show"} full model response
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-1">
                {fullResponse.length.toLocaleString()} chars
              </Badge>
            </button>

            {showFullResponse && (
              <div className="rounded-md border border-border bg-muted/30 max-h-[500px] overflow-y-auto p-3">
                {/* MarkdownStream includes built-in copy button and full-screen editor */}
                <MarkdownStream content={fullResponse} isStreamActive={false} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
