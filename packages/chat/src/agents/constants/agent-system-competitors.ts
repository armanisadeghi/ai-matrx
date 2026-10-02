export interface AIAgentSystem {
  id: string;
  name: string;
  category: "Framework" | "Enterprise" | "Low-Code" | "Specialized";
  isOpenSource: boolean;
  description: string;
  primaryLanguage: string;
}

export const agentSystems: AIAgentSystem[] = [
  {
    id: "langgraph",
    name: "LangGraph",
    category: "Framework",
    isOpenSource: true,
    description:
      "Built by LangChain, it excels at complex, stateful agents with cyclic logic.",
    primaryLanguage: "Python / TypeScript",
  },
  {
    id: "crew-ai",
    name: "CrewAI",
    category: "Framework",
    isOpenSource: true,
    description:
      "Orchestrates role-based autonomous agents that work together like a human team.",
    primaryLanguage: "Python",
  },
  {
    id: "autogen",
    name: "Microsoft AutoGen",
    category: "Framework",
    isOpenSource: true,
    description:
      "An event-driven framework for multi-agent conversations and complex task solving.",
    primaryLanguage: "Python / C#",
  },
  {
    id: "copilot-studio",
    name: "Microsoft Copilot Studio",
    category: "Enterprise",
    isOpenSource: false,
    description:
      "Low-code platform for building agents integrated into the Microsoft 365 ecosystem.",
    primaryLanguage: "Low-Code",
  },
  {
    id: "openai-agent-kit",
    name: "OpenAI AgentKit",
    category: "Enterprise",
    isOpenSource: false,
    description:
      "OpenAI's lightweight SDK for building agents with persistent memory and tool access.",
    primaryLanguage: "Model Agnostic",
  },
  {
    id: "google-vertex-adk",
    name: "Google Vertex ADK",
    category: "Enterprise",
    isOpenSource: false,
    description:
      "A development kit optimized for deploying Gemini-powered agents on Google Cloud.",
    primaryLanguage: "Python / JS",
  },
  {
    id: "agentforce",
    name: "Salesforce Agentforce",
    category: "Enterprise",
    isOpenSource: false,
    description:
      "Autonomous agents that leverage live CRM data to handle sales and service tasks.",
    primaryLanguage: "Apex / Low-Code",
  },
  {
    id: "dify",
    name: "Dify",
    category: "Low-Code",
    isOpenSource: true,
    description:
      "An open-source LLMOps platform with a visual workflow orchestrator.",
    primaryLanguage: "Python / Go",
  },
  {
    id: "langflow",
    name: "Langflow",
    category: "Low-Code",
    isOpenSource: true,
    description:
      "A drag-and-drop visual editor for building and testing agentic Knowledge workflows.",
    primaryLanguage: "Python",
  },
  {
    id: "buildship",
    name: "BuildShip",
    category: "Low-Code",
    isOpenSource: false,
    description:
      "A low-code visual builder for creating backends and agents with AI nodes.",
    primaryLanguage: "JavaScript",
  },
  {
    id: "pydantic-ai",
    name: "PydanticAI",
    category: "Framework",
    isOpenSource: true,
    description:
      "A type-safe agent framework for Python focusing on structured data and validation.",
    primaryLanguage: "Python",
  },
  {
    id: "llamaindex-workflows",
    name: "LlamaIndex Workflows",
    category: "Specialized",
    isOpenSource: true,
    description:
      "Event-driven orchestration specifically for data-heavy and Knowledge-focused agents.",
    primaryLanguage: "Python / TypeScript",
  },
  {
    id: "mastra",
    name: "Mastra",
    category: "Framework",
    isOpenSource: true,
    description:
      "The 'Next.js for Agents'—a high-performance framework for TypeScript developers.",
    primaryLanguage: "TypeScript",
  },
  {
    id: "super-agi",
    name: "SuperAGI",
    category: "Specialized",
    isOpenSource: true,
    description:
      "An infrastructure-first platform for developing and deploying autonomous agents.",
    primaryLanguage: "Python",
  },
  {
    id: "devin",
    name: "Cognition Devin",
    category: "Specialized",
    isOpenSource: false,
    description:
      "An autonomous software engineering agent capable of building and deploying apps.",
    primaryLanguage: "Managed Service",
  },
];
