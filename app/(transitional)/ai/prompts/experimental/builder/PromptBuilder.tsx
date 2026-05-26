'use client';


import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
    CheckIcon,
    CopyIcon,
} from "lucide-react";
import { promptBuilderTabs, promptTemplateSource } from "@/features/prompts/components/tabbed-builder/constants";

// Main PromptBuilder component
export default function PromptBuilder() {
    // Initialize state for all prompt components
    const [activeTab, setActiveTab] = useState("task");
    
    // Define tabs array with id, label, and icon properties
    const tabs = promptBuilderTabs;
    const promptTemplates = promptTemplateSource;

    const [enabledSections, setEnabledSections] = useState({
        task: true, // Task is always enabled
        context: false,
        tone: false,
        format: false,
        knowledge: false,
        examples: false,
        constraints: false,
        audience: false,
        evaluation: false,
    });

    // State for various prompt building options
    const [taskType, setTaskType] = useState("");
    const [subject, setSubject] = useState("");
    const [specificTask, setSpecificTask] = useState("");
    const [contextDetails, setContextDetails] = useState("");
    const [toneSelection, setToneSelection] = useState("");
    const [detailLevel, setDetailLevel] = useState(50);
    const [formatType, setFormatType] = useState("");
    const [formatLength, setFormatLength] = useState("");
    const [knowledgeOptions, setKnowledgeOptions] = useState([]);
    const [limitationsText, setLimitationsText] = useState("");
    const [examplesText, setExamplesText] = useState("");
    const [constraintOptions, setConstraintOptions] = useState([]);
    const [specificConstraints, setSpecificConstraints] = useState("");
    const [audienceType, setAudienceType] = useState("");
    const [specificAudience, setSpecificAudience] = useState("");
    const [audienceKnowledgeLevel, setAudienceKnowledgeLevel] = useState(50);
    const [evaluationCriteria, setEvaluationCriteria] = useState([]);
    const [creativeType, setCreativeType] = useState("");

    // Additional state for any conditional fields
    const [showCreativeOptions, setShowCreativeOptions] = useState(false);
    const [showSpecificAudience, setShowSpecificAudience] = useState(false);
    const [finalPrompt, setFinalPrompt] = useState("");
    const [copied, setCopied] = useState(false);

    // Update dependencies based on selections
    useEffect(() => {
        setShowCreativeOptions(taskType === "create");
        setShowSpecificAudience(audienceType === "specific");
    }, [taskType, audienceType]);

    // Generate the final prompt whenever any inputs change
    useEffect(() => {
        generatePrompt();
    }, [
        enabledSections,
        taskType,
        subject,
        specificTask,
        contextDetails,
        toneSelection,
        detailLevel,
        formatType,
        formatLength,
        knowledgeOptions,
        limitationsText,
        examplesText,
        constraintOptions,
        specificConstraints,
        audienceType,
        specificAudience,
        audienceKnowledgeLevel,
        evaluationCriteria,
        creativeType,
    ]);

    // Helper function to get template text based on selected option
    const getOptionTemplate = (section, optionId) => {
        const option = promptTemplates[section].options.find((opt) => opt.id === optionId);
        return option ? option.template : "";
    };

    // Function to generate the prompt based on all selections
    const generatePrompt = () => {
        let promptParts = [];

        // Always start with the preamble
        promptParts.push("You are an AI assistant tasked with helping the user with their request.");

        // Build each section if enabled
        if (enabledSections.context && contextDetails) {
            promptParts.push(
                `${promptTemplates.context.prefix}${promptTemplates.context.template.replace("{contextDetails}", contextDetails)}`
            );
        }

        // Task section (always included)
        if (taskType) {
            let taskTemplate = getOptionTemplate("task", taskType);

            // Handle creative type for creative tasks
            if (taskType === "create" && creativeType) {
                taskTemplate = taskTemplate.replace("{creativeType}", creativeType);
            }

            const taskText = `${promptTemplates.task.prefix}${taskTemplate.replace("{subject}", subject)}`;
            promptParts.push(taskText);

            if (specificTask) {
                promptParts.push(`Specifically, you should ${specificTask}.`);
            }
        }

        // Audience section
        if (enabledSections.audience && audienceType) {
            let audienceTemplate = getOptionTemplate("audience", audienceType);

            if (audienceType === "specific" && specificAudience) {
                audienceTemplate = audienceTemplate.replace("{specificAudience}", specificAudience);
            }

            const audienceText = `${promptTemplates.audience.prefix}${audienceTemplate}`;

            // Add knowledge level if audience is enabled
            const knowledgeLevelMap = {
                0: "novice",
                50: "intermediate",
                100: "expert",
            };

            const closestValue = Object.keys(knowledgeLevelMap).reduce((prev, curr) => {
                return Math.abs(Number(curr) - audienceKnowledgeLevel) < Math.abs(Number(prev) - audienceKnowledgeLevel) ? curr : prev;
            }, 0);

            const knowledgeLevelText = `${promptTemplates.audience.knowledge.prefix}${promptTemplates.audience.knowledge.template.replace(
                "{knowledgeLevel}",
                knowledgeLevelMap[closestValue]
            )}`;

            promptParts.push(`${audienceText}${knowledgeLevelText}`);
        }

        // Knowledge boundaries section
        if (enabledSections.knowledge && knowledgeOptions.length > 0) {
            const knowledgeText = `${promptTemplates.knowledge.prefix}${knowledgeOptions
                .map((opt) => getOptionTemplate("knowledge", opt))
                .join(",")}`;
            let fullText = knowledgeText;

            if (limitationsText) {
                fullText += `${promptTemplates.knowledge.limitations.template.replace("{limitationsText}", limitationsText)}`;
            }

            promptParts.push(fullText);
        }

        // Tone & Style section
        if (enabledSections.tone && toneSelection) {
            const toneTemplate = getOptionTemplate("tone", toneSelection);
            const toneText = `${promptTemplates.tone.prefix}${toneTemplate}${promptTemplates.tone.suffix}`;

            // Add detail level if tone is enabled
            const detailLevelMap = {
                0: "concise",
                50: "balanced",
                100: "comprehensive",
            };

            const closestValue = Object.keys(detailLevelMap).reduce((prev, curr) => {
                return Math.abs(Number(curr) - detailLevel) < Math.abs(Number(prev) - detailLevel) ? curr : prev;
            }, 0);

            const detailText = `${promptTemplates.tone.detail.prefix}${promptTemplates.tone.detail.template.replace(
                "{detailLevel}",
                detailLevelMap[closestValue]
            )}`;

            promptParts.push(`${toneText} ${detailText}`);
        }

        // Format section
        if (enabledSections.format && formatType) {
            const formatTemplate = getOptionTemplate("format", formatType);
            const formatText = `${promptTemplates.format.prefix}${formatTemplate}`;

            let fullText = formatText;

            if (formatLength) {
                const lengthTemplate = promptTemplates.format.length.options.find((opt) => opt.id === formatLength).template;
                fullText += `${promptTemplates.format.length.prefix}${lengthTemplate}${promptTemplates.format.length.suffix}`;
            }

            promptParts.push(fullText);
        }

        // Examples section
        if (enabledSections.examples && examplesText) {
            promptParts.push(
                `${promptTemplates.examples.prefix}${promptTemplates.examples.template.replace("{examplesText}", examplesText)}`
            );
        }

        // Constraints section
        if (enabledSections.constraints && (constraintOptions.length > 0 || specificConstraints)) {
            let constraintsText = promptTemplates.constraints.prefix;

            if (constraintOptions.length > 0) {
                constraintsText += constraintOptions.map((opt) => getOptionTemplate("constraints", opt)).join(",");
            }

            if (specificConstraints) {
                constraintsText += `${promptTemplates.constraints.specific.template.replace("{specificConstraints}", specificConstraints)}`;
            }

            promptParts.push(constraintsText);
        }

        // Evaluation criteria section
        if (enabledSections.evaluation && evaluationCriteria.length > 0) {
            const criteriaText = evaluationCriteria.map((crit) => getOptionTemplate("evaluation", crit)).join(", ");
            promptParts.push(`${promptTemplates.evaluation.prefix}${criteriaText}.`);
        }

        setFinalPrompt(promptParts.join("\n\n"));
    };

    // Handle section toggle
    const toggleSection = (section) => {
        setEnabledSections({
            ...enabledSections,
            [section]: !enabledSections[section],
        });
    };

    // Handle knowledge options toggle
    const toggleKnowledgeOption = (option) => {
        if (knowledgeOptions.includes(option)) {
            setKnowledgeOptions(knowledgeOptions.filter((opt) => opt !== option));
        } else {
            setKnowledgeOptions([...knowledgeOptions, option]);
        }
    };

    // Handle constraint options toggle
    const toggleConstraintOption = (option) => {
        if (constraintOptions.includes(option)) {
            setConstraintOptions(constraintOptions.filter((opt) => opt !== option));
        } else {
            setConstraintOptions([...constraintOptions, option]);
        }
    };

    // Handle evaluation criteria toggle
    const toggleEvaluationCriteria = (criteria) => {
        if (evaluationCriteria.includes(criteria)) {
            setEvaluationCriteria(evaluationCriteria.filter((crit) => crit !== criteria));
        } else {
            setEvaluationCriteria([...evaluationCriteria, criteria]);
        }
    };

    // Handle copy to clipboard
    const copyToClipboard = () => {
        navigator.clipboard.writeText(finalPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="w-full py-6">
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold">AI Prompt Builder</h1>
                    <div className="flex space-x-2">
                        <Button variant="outline" onClick={() => setActiveTab("preview")}>
                            Preview Final Prompt
                        </Button>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid grid-cols-5 md:grid-cols-12 w-full">
                        {tabs.map((tab) => (
                            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1">
                                {tab.icon}
                                <span className="hidden md:inline">{tab.label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* Task Tab */}
                    <TabsContent value="task" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Define Your Task</CardTitle>
                                <CardDescription>What do you want the AI to do? This section is required.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="task-type">Task Type</Label>
                                    <Select value={taskType} onValueChange={setTaskType}>
                                        <SelectTrigger id="task-type">
                                            <SelectValue placeholder="Select a task type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {promptTemplates.task.options.map((option) => (
                                                <SelectItem key={option.id} value={option.id}>
                                                    {option.text}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="subject">Subject Matter</Label>
                                    <Input
                                        id="subject"
                                        placeholder="What is the primary subject matter?"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="specific-task">Specific Instructions</Label>
                                    <Textarea
                                        id="specific-task"
                                        placeholder="What specifically should the AI do?"
                                        value={specificTask}
                                        onChange={(e) => setSpecificTask(e.target.value)}
                                    />
                                </div>

                                {showCreativeOptions && (
                                    <div className="space-y-2">
                                        <Label htmlFor="creative-type">Creative Type</Label>
                                        <Input
                                            id="creative-type"
                                            placeholder="What type of creative work? (poem, story, etc.)"
                                            value={creativeType}
                                            onChange={(e) => setCreativeType(e.target.value)}
                                        />
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("context")}>
                                    Next: Context
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Context Tab */}
                    <TabsContent value="context" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Provide Context</CardTitle>
                                    <CardDescription>Add background information to help the AI understand the situation.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="context-switch"
                                        checked={enabledSections.context}
                                        onCheckedChange={() => toggleSection("context")}
                                    />
                                    <Label htmlFor="context-switch">Enable Context</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {enabledSections.context && (
                                        <div className="space-y-2">
                                            <Label htmlFor="context-details">Context Details</Label>
                                            <Textarea
                                                id="context-details"
                                                placeholder="Describe the background information or situation..."
                                                rows={5}
                                                value={contextDetails}
                                                onChange={(e) => setContextDetails(e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("task")}>
                                    Previous: Task
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("tone")}>
                                    Next: Tone & Style
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Tone & Style Tab */}
                    <TabsContent value="tone" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Tone & Style</CardTitle>
                                    <CardDescription>Define how the AI should communicate.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch id="tone-switch" checked={enabledSections.tone} onCheckedChange={() => toggleSection("tone")} />
                                    <Label htmlFor="tone-switch">Enable Tone & Style</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.tone && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="tone-selection">Primary Tone</Label>
                                            <Select value={toneSelection} onValueChange={setToneSelection}>
                                                <SelectTrigger id="tone-selection">
                                                    <SelectValue placeholder="Select a tone" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {promptTemplates.tone.options.map((option) => (
                                                        <SelectItem key={option.id} value={option.id}>
                                                            {option.text}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label htmlFor="detail-level">Detail Level</Label>
                                                <span className="text-sm text-gray-500">
                                                    {detailLevel <= 33 ? "Concise" : detailLevel <= 66 ? "Balanced" : "Comprehensive"}
                                                </span>
                                            </div>
                                            <Slider
                                                id="detail-level"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[detailLevel]}
                                                onValueChange={(values) => setDetailLevel(values[0])}
                                                className="w-full"
                                            />
                                            <div className="flex justify-between text-xs text-gray-500">
                                                <span>Concise</span>
                                                <span>Balanced</span>
                                                <span>Comprehensive</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("context")}>
                                    Previous: Context
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("format")}>
                                    Next: Format
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Format Tab */}
                    <TabsContent value="format" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Output Format</CardTitle>
                                    <CardDescription>Set how you want the AI's response to be structured.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="format-switch"
                                        checked={enabledSections.format}
                                        onCheckedChange={() => toggleSection("format")}
                                    />
                                    <Label htmlFor="format-switch">Enable Format</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.format && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="format-type">Format Type</Label>
                                            <Select value={formatType} onValueChange={setFormatType}>
                                                <SelectTrigger id="format-type">
                                                    <SelectValue placeholder="Select a format" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {promptTemplates.format.options.map((option) => (
                                                        <SelectItem key={option.id} value={option.id}>
                                                            {option.text}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="format-length">Length Preference</Label>
                                            <Select value={formatLength} onValueChange={setFormatLength}>
                                                <SelectTrigger id="format-length">
                                                    <SelectValue placeholder="Select a length" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {promptTemplates.format.length.options.map((option) => (
                                                        <SelectItem key={option.id} value={option.id}>
                                                            {option.text}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("tone")}>
                                    Previous: Tone
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("knowledge")}>
                                    Next: Knowledge
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Knowledge Tab */}
                    <TabsContent value="knowledge" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Knowledge Boundaries</CardTitle>
                                    <CardDescription>Define what information the AI should use in its response.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="knowledge-switch"
                                        checked={enabledSections.knowledge}
                                        onCheckedChange={() => toggleSection("knowledge")}
                                    />
                                    <Label htmlFor="knowledge-switch">Enable Knowledge Boundaries</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.knowledge && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label>Knowledge Scope</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {promptTemplates.knowledge.options.map((option) => (
                                                    <div key={option.id} className="flex items-center space-x-2">
                                                        <Switch
                                                            id={`knowledge-${option.id}`}
                                                            checked={knowledgeOptions.includes(option.id)}
                                                            onCheckedChange={() => toggleKnowledgeOption(option.id)}
                                                        />
                                                        <Label htmlFor={`knowledge-${option.id}`}>{option.text}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="limitations-text">Specific Limitations</Label>
                                            <Textarea
                                                id="limitations-text"
                                                placeholder="Add any specific boundaries or limitations..."
                                                value={limitationsText}
                                                onChange={(e) => setLimitationsText(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("format")}>
                                    Previous: Format
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("examples")}>
                                    Next: Examples
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Examples Tab */}
                    <TabsContent value="examples" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Examples</CardTitle>
                                    <CardDescription>Add example inputs/outputs to guide the AI.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="examples-switch"
                                        checked={enabledSections.examples}
                                        onCheckedChange={() => toggleSection("examples")}
                                    />
                                    <Label htmlFor="examples-switch">Enable Examples</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.examples && (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="examples-text">Example Content</Label>
                                            <Textarea
                                                id="examples-text"
                                                placeholder="Add examples to guide the AI's response..."
                                                rows={5}
                                                value={examplesText}
                                                onChange={(e) => setExamplesText(e.target.value)}
                                            />
                                            <p className="text-sm text-gray-500">
                                                Include sample inputs/outputs, good examples to follow, or examples to avoid.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("knowledge")}>
                                    Previous: Knowledge
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("constraints")}>
                                    Next: Constraints
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Constraints Tab */}
                    <TabsContent value="constraints" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Constraints</CardTitle>
                                    <CardDescription>Set limitations for the AI to follow.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="constraints-switch"
                                        checked={enabledSections.constraints}
                                        onCheckedChange={() => toggleSection("constraints")}
                                    />
                                    <Label htmlFor="constraints-switch">Enable Constraints</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.constraints && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label>Constraint Types</Label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {promptTemplates.constraints.options.map((option) => (
                                                    <div key={option.id} className="flex items-center space-x-2">
                                                        <Switch
                                                            id={`constraint-${option.id}`}
                                                            checked={constraintOptions.includes(option.id)}
                                                            onCheckedChange={() => toggleConstraintOption(option.id)}
                                                        />
                                                        <Label htmlFor={`constraint-${option.id}`}>{option.text}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="specific-constraints">Specific Constraints</Label>
                                            <Textarea
                                                id="specific-constraints"
                                                placeholder="Describe specific constraints in detail..."
                                                value={specificConstraints}
                                                onChange={(e) => setSpecificConstraints(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("examples")}>
                                    Previous: Examples
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("audience")}>
                                    Next: Audience
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Audience Tab */}
                    <TabsContent value="audience" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Audience</CardTitle>
                                    <CardDescription>Define who the AI's response is for.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="audience-switch"
                                        checked={enabledSections.audience}
                                        onCheckedChange={() => toggleSection("audience")}
                                    />
                                    <Label htmlFor="audience-switch">Enable Audience</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.audience && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="audience-type">Primary Audience</Label>
                                            <Select value={audienceType} onValueChange={setAudienceType}>
                                                <SelectTrigger id="audience-type">
                                                    <SelectValue placeholder="Select an audience" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {promptTemplates.audience.options.map((option) => (
                                                        <SelectItem key={option.id} value={option.id}>
                                                            {option.text}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {showSpecificAudience && (
                                            <div className="space-y-2">
                                                <Label htmlFor="specific-audience">Specific Demographic</Label>
                                                <Input
                                                    id="specific-audience"
                                                    placeholder="Describe your specific audience..."
                                                    value={specificAudience}
                                                    onChange={(e) => setSpecificAudience(e.target.value)}
                                                />
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <Label htmlFor="audience-knowledge">Audience Knowledge Level</Label>
                                                <span className="text-sm text-gray-500">
                                                    {audienceKnowledgeLevel <= 33
                                                        ? "Novice"
                                                        : audienceKnowledgeLevel <= 66
                                                        ? "Intermediate"
                                                        : "Expert"}
                                                </span>
                                            </div>
                                            <Slider
                                                id="audience-knowledge"
                                                min={0}
                                                max={100}
                                                step={1}
                                                value={[audienceKnowledgeLevel]}
                                                onValueChange={(values) => setAudienceKnowledgeLevel(values[0])}
                                                className="w-full"
                                            />
                                            <div className="flex justify-between text-xs text-gray-500">
                                                <span>Novice</span>
                                                <span>Intermediate</span>
                                                <span>Expert</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("constraints")}>
                                    Previous: Constraints
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("evaluation")}>
                                    Next: Evaluation
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Evaluation Tab */}
                    <TabsContent value="evaluation" className="space-y-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>Evaluation Criteria</CardTitle>
                                    <CardDescription>Define how to judge the success of the AI's response.</CardDescription>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="evaluation-switch"
                                        checked={enabledSections.evaluation}
                                        onCheckedChange={() => toggleSection("evaluation")}
                                    />
                                    <Label htmlFor="evaluation-switch">Enable Evaluation Criteria</Label>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {enabledSections.evaluation && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <Label>Success Metrics</Label>
                                            <p className="text-sm text-gray-500 mb-2">
                                                Select criteria in order of importance (first selected = highest priority)
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {promptTemplates.evaluation.options.map((option) => (
                                                    <div key={option.id} className="flex items-center space-x-2">
                                                        <Switch
                                                            id={`evaluation-${option.id}`}
                                                            checked={evaluationCriteria.includes(option.id)}
                                                            onCheckedChange={() => toggleEvaluationCriteria(option.id)}
                                                        />
                                                        <Label htmlFor={`evaluation-${option.id}`}>{option.text}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {evaluationCriteria.length > 0 && (
                                            <div>
                                                <Label>Priority Order</Label>
                                                <div className="mt-2 space-y-2 p-4 border rounded-md">
                                                    <ol className="list-decimal list-inside">
                                                        {evaluationCriteria.map((criteria, index) => (
                                                            <li key={index} className="py-1 px-2 bg-gray-50 dark:bg-gray-800 rounded">
                                                                {
                                                                    promptTemplates.evaluation.options.find((opt) => opt.id === criteria)
                                                                        ?.text
                                                                }
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="flex justify-between">
                                <Button variant="outline" onClick={() => setActiveTab("audience")}>
                                    Previous: Audience
                                </Button>
                                <Button variant="outline" onClick={() => setActiveTab("preview")}>
                                    Next: Final Prompt
                                </Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Preview Tab */}
                    <TabsContent value="preview" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Final Generated Prompt</CardTitle>
                                <CardDescription>This is the complete prompt built from your selections.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="relative">
                                    <div className="absolute top-2 right-2">
                                        <Button size="sm" variant="ghost" onClick={copyToClipboard} className="h-8 w-8 p-0">
                                            {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                    <pre className="p-4 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-md whitespace-pre-wrap font-mono text-sm overflow-auto max-h-96">
                                        {finalPrompt}
                                    </pre>
                                </div>

                                <div className="mt-6 space-y-2">
                                    <Label>Component Summary</Label>
                                    <div className="space-y-1">
                                        {Object.entries(enabledSections).map(([section, enabled]) => (
                                            <div key={section} className="flex items-center space-x-2">
                                                <div className={`w-3 h-3 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                                                <span className="text-sm capitalize">{section}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <div className="flex space-x-2">
                                    <Button onClick={copyToClipboard}>{copied ? "Copied!" : "Copy to Clipboard"}</Button>
                                    <Button variant="outline" onClick={() => setActiveTab("task")}>
                                        Start Over
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
