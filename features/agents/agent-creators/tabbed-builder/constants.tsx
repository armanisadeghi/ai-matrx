import { PenTool, Braces, MessageSquare, FileText, Layers, Sliders, AlertTriangle, Users, CheckSquare, CopyIcon, BarChart2, LayoutTemplate, ListChecks, Lightbulb } from "lucide-react";

// Prompt template structure with predefined options and template text
export const promptTemplateSource = {
    task: {
      prefix: "Your task is to",
      options: [
        { id: "generate", text: "generate content", template: " generate content about {subject}" },
        { id: "answer", text: "answer questions", template: " answer questions about {subject}" },
        { id: "analyze", text: "analyze data", template: " analyze the following data about {subject}" },
        { id: "summarize", text: "summarize information", template: " summarize information about {subject}" },
        { id: "translate", text: "translate content", template: " translate the following content about {subject}" },
        { id: "compare", text: "compare options", template: " compare the following options related to {subject}" },
        { id: "recommend", text: "make recommendations", template: " make recommendations regarding {subject}" },
        { id: "create", text: "create creative work", template: " create {creativeType} about {subject}" }
      ]
    },
    context: {
      prefix: "Consider the following context:",
      template: " {contextDetails}"
    },
    tone: {
      prefix: "Use a",
      options: [
        { id: "professional", text: "professional", template: " professional" },
        { id: "conversational", text: "conversational", template: " conversational" },
        { id: "academic", text: "academic", template: " academic" },
        { id: "technical", text: "technical", template: " technical" },
        { id: "casual", text: "casual", template: " casual" },
        { id: "formal", text: "formal", template: " formal" },
        { id: "empathetic", text: "empathetic", template: " empathetic" },
        { id: "objective", text: "objective", template: " objective" }
      ],
      suffix: "tone.",
      detail: {
        prefix: "Provide",
        options: [
          { id: "concise", text: "concise", value: 0 },
          { id: "balanced", text: "balanced", value: 50 },
          { id: "comprehensive", text: "comprehensive", value: 100 }
        ],
        template: " {detailLevel} detail in your response."
      }
    },
    format: {
      prefix: "Structure your response as",
      options: [
        { id: "paragraph", text: "paragraph text", template: " paragraph text" },
        { id: "bullets", text: "bullet points", template: " bullet points" },
        { id: "numbered", text: "numbered list", template: " a numbered list" },
        { id: "table", text: "table", template: " a table" },
        { id: "code", text: "code block", template: " a code block" },
        { id: "qna", text: "Q&A format", template: " a Q&A format" },
        { id: "steps", text: "step-by-step guide", template: " a step-by-step guide" },
        { id: "report", text: "structured report", template: " a structured report" }
      ],
      length: {
        prefix: "with",
        options: [
          { id: "very-brief", text: "very brief (1-2 sentences)", template: " very brief (1-2 sentences)" },
          { id: "short", text: "short (paragraph)", template: " short (paragraph)" },
          { id: "medium", text: "medium (several paragraphs)", template: " medium (several paragraphs)" },
          { id: "detailed", text: "detailed (comprehensive)", template: " detailed (comprehensive)" }
        ],
        suffix: "length."
      }
    },
    knowledge: {
      prefix: "In your response,",
      options: [
        { id: "provided", text: "use only information provided in the prompt", template: " use only information provided in the prompt" },
        { id: "general", text: "use general knowledge", template: " use general knowledge" },
        { id: "assumptions", text: "make reasonable assumptions", template: " make reasonable assumptions when necessary" },
        { id: "clarify", text: "ask for clarification when uncertain", template: " ask for clarification when uncertain" }
      ],
      limitations: {
        prefix: "",
        template: " {limitationsText}"
      }
    },
    examples: {
      prefix: "Here are examples to guide your response:",
      template: " {examplesText}"
    },
    constraints: {
      prefix: "Please adhere to these constraints:",
      options: [
        { id: "time", text: "time constraints", template: " time constraints" },
        { id: "word", text: "word/character limits", template: " word/character limits" },
        { id: "ethical", text: "ethical boundaries", template: " ethical boundaries" },
        { id: "resource", text: "resource limitations", template: " resource limitations" },
        { id: "format", text: "format restrictions", template: " format restrictions" }
      ],
      specific: {
        prefix: "",
        template: " {specificConstraints}"
      }
    },
    audience: {
      prefix: "Your response should be suitable for",
      options: [
        { id: "general", text: "general public", template: " the general public" },
        { id: "technical", text: "technical experts", template: " technical experts" },
        { id: "beginners", text: "beginners/novices", template: " beginners/novices" },
        { id: "executives", text: "executives", template: " executives" },
        { id: "students", text: "children/students", template: " children/students" },
        { id: "colleagues", text: "colleagues", template: " colleagues" },
        { id: "customers", text: "customers", template: " customers" },
        { id: "specific", text: "specific demographic", template: " {specificAudience}" }
      ],
      knowledge: {
        prefix: "with a",
        options: [
          { id: "novice", text: "novice", value: 0 },
          { id: "intermediate", text: "intermediate", value: 50 },
          { id: "expert", text: "expert", value: 100 }
        ],
        template: " {knowledgeLevel} understanding of the subject."
      }
    },
    evaluation: {
      prefix: "Your response will be evaluated based on these criteria, in order of importance:",
      options: [
        { id: "accuracy", text: "accuracy", template: " accuracy" },
        { id: "comprehensiveness", text: "comprehensiveness", template: " comprehensiveness" },
        { id: "creativity", text: "creativity", template: " creativity" },
        { id: "clarity", text: "clarity", template: " clarity" },
        { id: "conciseness", text: "conciseness", template: " conciseness" },
        { id: "actionability", text: "actionability", template: " actionability" },
        { id: "engagement", text: "engagement", template: " engagement" },
        { id: "persuasiveness", text: "persuasiveness", template: " persuasiveness" }
      ]
    },
    // New template sections for additional tabs
    motivation: {
      prefix: "The motivation behind this request is",
      template: " {motivationDetails}"
    },
    emphasis: {
      prefix: "In your response, emphasize these key metrics or aspects:",
      template: " {emphasisDetails}"
    },
    structure: {
      prefix: "Follow this specific template structure:",
      template: " {structureDetails}"
    },
    specialInstructions: {
      prefix: "Special instructions:",
      template: " {specialInstructionsDetails}"
    }
  };
  
  // The tab structure for our prompt builder
  export const promptBuilderTabs = [
    { id: "task", label: "Task", icon: <PenTool className="h-4 w-4" /> },
    { id: "context", label: "Context", icon: <Braces className="h-4 w-4" /> },
    { id: "tone", label: "Tone & Style", icon: <MessageSquare className="h-4 w-4" /> },
    { id: "format", label: "Format", icon: <FileText className="h-4 w-4" /> },
    { id: "knowledge", label: "Knowledge", icon: <Layers className="h-4 w-4" /> },
    { id: "examples", label: "Examples", icon: <Sliders className="h-4 w-4" /> },
    { id: "constraints", label: "Constraints", icon: <AlertTriangle className="h-4 w-4" /> },
    { id: "audience", label: "Audience", icon: <Users className="h-4 w-4" /> },
    { id: "evaluation", label: "Evaluation", icon: <CheckSquare className="h-4 w-4" /> },
    { id: "preview", label: "Final Prompt", icon: <CopyIcon className="h-4 w-4" /> }
  ];
  
  // Additional tabs to be added to the prompt builder
  export const additionalTabs = [
    { id: "motivation", label: "Motivation", icon: <Lightbulb className="h-4 w-4" /> },
    { id: "emphasis", label: "Key Metrics & Emphasis", icon: <BarChart2 className="h-4 w-4" /> },
    { id: "structure", label: "Template Structure", icon: <LayoutTemplate className="h-4 w-4" /> },
    { id: "specialInstructions", label: "Special Instructions", icon: <ListChecks className="h-4 w-4" /> },
  ];
  
  // Meta-information about tabs for dynamic tab generation
  export const tabMetadata = {
    // Core tabs
    task: {
      title: "Task Definition",
      description: "Define the primary task for the AI to perform",
      alwaysEnabled: true
    },
    context: {
      title: "Context",
      description: "Give background the AI needs to understand the task"
    },
    tone: {
      title: "Tone & Style",
      description: "Set the tone and level of detail for the response"
    },
    format: {
      title: "Format",
      description: "Define the structure and length of the response"
    },
    knowledge: {
      title: "Knowledge",
      description: "Specify what knowledge sources the AI should use"
    },
    examples: {
      title: "Examples",
      description: "Give examples to guide the response format or content"
    },
    constraints: {
      title: "Constraints",
      description: "Set limitations or boundaries for the response"
    },
    audience: {
      title: "Audience",
      description: "Define who the response is intended for"
    },
    evaluation: {
      title: "Evaluation",
      description: "Specify how the response will be evaluated"
    },
    preview: {
      title: "Final Prompt",
      description: "View and copy the complete prompt"
    },
    
    // Additional tabs
    motivation: {
      title: "Motivation",
      description: "Explain the reason or motivation behind the request"
    },
    emphasis: {
      title: "Key Metrics & Emphasis",
      description: "Highlight the most important metrics or aspects to focus on"
    },
    structure: {
      title: "Template Structure",
      description: "Define a specific template structure for the response"
    },
    specialInstructions: {
      title: "Special Instructions",
      description: "Add special instructions for this request"
    }
  };
  