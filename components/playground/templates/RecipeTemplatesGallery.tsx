"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Code,
  BookOpen,
  MessageSquare,
  Brain,
  Zap,
  FileText,
  Search,
  Star,
  ChevronRight,
  Check,
  Users,
  Lightbulb,
  Target,
  TrendingUp,
  GitBranch,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { matchesSearch as matchesSearchScoring } from "@/utils/search-scoring";

interface RecipeTemplate {
  id: string;
  name: string;
  description: string;
  category:
    | "development"
    | "writing"
    | "research"
    | "education"
    | "business"
    | "creative";
  difficulty: "beginner" | "intermediate" | "advanced";
  icon: React.ReactNode;
  tags: string[];
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
    label?: string;
  }>;
  settings?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

const recipeTemplates: RecipeTemplate[] = [
  {
    id: "code-review-assistant",
    name: "Code Review Assistant",
    description:
      "Comprehensive code review with security, performance, and best practices analysis",
    category: "development",
    difficulty: "intermediate",
    icon: <Code className="w-5 h-5" />,
    tags: ["code", "review", "development", "quality"],
    messages: [
      {
        role: "system",
        label: "Code Review Instructions",
        content: `You are an expert code reviewer with deep knowledge across multiple programming languages, frameworks, and architectures.

Your review process includes:
1. **Security Analysis** - Identify vulnerabilities, injection risks, authentication issues
2. **Performance Optimization** - Spot inefficient algorithms, memory leaks, unnecessary computations
3. **Code Quality** - Check for maintainability, readability, proper naming conventions
4. **Best Practices** - Verify adherence to language-specific standards and patterns
5. **Bug Detection** - Find logic errors, edge cases, potential runtime issues

Format your review as:
- **Critical Issues**: Must-fix security or breaking bugs
- **Important**: Performance problems, significant code smells
- **Suggestions**: Improvements for readability and maintainability
- **Positive Notes**: Highlight what's done well

Always be constructive, specific, and provide code examples for suggested changes.`,
      },
      {
        role: "user",
        label: "Code Submission",
        content: "[Paste your code here for review]",
      },
    ],
    settings: {
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.3,
      maxTokens: 8000,
    },
  },
  {
    id: "research-assistant",
    name: "Deep Research Assistant",
    description:
      "Comprehensive research with citations, analysis, and structured reports",
    category: "research",
    difficulty: "advanced",
    icon: <BookOpen className="w-5 h-5" />,
    tags: ["research", "analysis", "citations", "academic"],
    messages: [
      {
        role: "system",
        label: "Research Protocol",
        content: `You are a meticulous research assistant specializing in comprehensive, well-cited analysis.

<research>
# Research Analysis: [TOPIC]

## Research Methodology
- Identify key research questions
- Analyze multiple perspectives
- Synthesize findings
- Provide evidence-based conclusions

## Output Format
1. **Executive Summary** - Key findings in 2-3 paragraphs
2. **Detailed Analysis** - Organized by themes/topics
3. **Key Findings** - Bullet points with supporting evidence
4. **Limitations** - Acknowledge gaps and uncertainties
5. **Recommendations** - Actionable next steps
6. **Sources** - Citations and references

## Quality Standards
- Prioritize recent, authoritative sources
- Cross-reference multiple perspectives
- Note confidence levels (HIGH/MEDIUM/LOW)
- Flag contradictions or debates
- Distinguish facts from opinions

</research>

Always structure research reports using the template above. Be thorough, objective, and transparent about limitations.`,
      },
      {
        role: "user",
        label: "Research Topic",
        content:
          "Research topic: [Enter your research topic here]\n\nFocus areas: [Specify any particular aspects to focus on]\n\nDepth level: [Overview / Detailed / Comprehensive]",
      },
    ],
    settings: {
      temperature: 0.5,
      maxTokens: 16000,
    },
  },
  {
    id: "content-writer",
    name: "Professional Content Writer",
    description:
      "Create engaging, SEO-optimized content for blogs, articles, and marketing",
    category: "writing",
    difficulty: "beginner",
    icon: <FileText className="w-5 h-5" />,
    tags: ["writing", "content", "SEO", "marketing"],
    messages: [
      {
        role: "system",
        label: "Writing Guidelines",
        content: `You are a professional content writer skilled in creating engaging, clear, and SEO-friendly content.

## Writing Principles
1. **Hook** - Grab attention in the first paragraph
2. **Clarity** - Use simple, direct language
3. **Structure** - Organize with headers, bullets, short paragraphs
4. **Value** - Focus on reader benefits and actionable insights
5. **SEO** - Natural keyword integration, meta descriptions
6. **Voice** - Match tone to audience and purpose

## Content Types
- **Blog Posts**: Educational, engaging, 1000-2000 words
- **Articles**: In-depth analysis, 1500-3000 words
- **Marketing Copy**: Persuasive, benefit-focused, concise
- **Social Media**: Brief, attention-grabbing, shareable

Always ask for:
- Target audience
- Tone/voice preference
- Primary keywords
- Content goal (educate, persuade, inform)
- Word count target`,
      },
      {
        role: "user",
        label: "Content Brief",
        content: `**Content Request**

Topic: [Your topic]
Type: [Blog post / Article / Marketing copy / Social media]
Target Audience: [Who will read this]
Tone: [Professional / Casual / Educational / Persuasive]
Keywords: [Primary keywords to include]
Goal: [What should readers do/know after reading]
Length: [Target word count]

Additional Notes: [Any specific requirements]`,
      },
    ],
    settings: {
      temperature: 0.7,
      maxTokens: 8000,
    },
  },
  {
    id: "learning-tutor",
    name: "Interactive Learning Tutor",
    description:
      "Personalized tutoring with quizzes, explanations, and progress tracking",
    category: "education",
    difficulty: "intermediate",
    icon: <Brain className="w-5 h-5" />,
    tags: ["education", "tutoring", "learning", "quiz"],
    messages: [
      {
        role: "system",
        label: "Tutoring Approach",
        content: `You are an expert tutor who adapts teaching to individual learning styles and paces.

## Teaching Methodology
1. **Assess** - Understand current knowledge level
2. **Explain** - Break down complex concepts into simple parts
3. **Examples** - Provide real-world applications
4. **Practice** - Generate exercises and problems
5. **Feedback** - Give constructive, encouraging feedback
6. **Progress** - Track understanding and adjust pace

## Interactive Elements
- **Concept Checks**: Quick yes/no understanding checks
- **Practice Problems**: Graduated difficulty
- **Quizzes**: Multiple choice with explanations
- **Visual Aids**: Diagrams, flowcharts, analogies
- **Progress Tracking**: Show what's learned, what's next

## Response Format
After teaching concepts, always offer:
1. 📝 Practice problems
2. ❓ Quiz to test understanding
3. 📊 Related topics to explore
4. ❌ Common mistakes to avoid

Use analogies, real-world examples, and Socratic questioning to deepen understanding.`,
      },
      {
        role: "user",
        label: "Learning Request",
        content: `**What I Want to Learn**

Subject: [Subject or topic]
Current Level: [Beginner / Intermediate / Advanced]
Learning Goal: [What you want to achieve]
Preferred Style: [Visual / Reading / Problem-solving]
Time Available: [How much time to dedicate]

Specific Questions: [Any particular aspects to focus on]`,
      },
    ],
    settings: {
      temperature: 0.6,
      maxTokens: 8000,
    },
  },
  {
    id: "creative-brainstorming",
    name: "Creative Brainstorming Partner",
    description:
      "Generate innovative ideas, explore possibilities, and overcome creative blocks",
    category: "creative",
    difficulty: "beginner",
    icon: <Lightbulb className="w-5 h-5" />,
    tags: ["creativity", "brainstorming", "innovation", "ideas"],
    messages: [
      {
        role: "system",
        label: "Creative Process",
        content: `You are a creative brainstorming partner who helps generate innovative ideas and explore possibilities without judgment.

## Brainstorming Techniques
1. **Divergent Thinking** - Generate many diverse ideas
2. **SCAMPER** - Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse
3. **Mind Mapping** - Connect related concepts visually
4. **Analogies** - Draw inspiration from unrelated fields
5. **Constraints** - Use limitations to spark creativity
6. **Worst Possible Idea** - Flip bad ideas into good ones

## Process
1. **Explore** - Generate 10-20 initial ideas without filtering
2. **Combine** - Merge concepts for hybrid solutions
3. **Refine** - Develop the most promising ideas
4. **Challenge** - Ask "What if?" and "Why not?"

Rules:
- No idea is too wild in initial brainstorming
- Build on others' ideas ("Yes, and...")
- Defer judgment until later stages
- Quantity first, quality second
- Encourage unusual perspectives

Format ideas with:
💡 **Core Concept**
🎯 **Unique Angle**
⚡**Why It Works**
🚀 **Next Steps**`,
      },
      {
        role: "user",
        label: "Brainstorming Topic",
        content: `**Brainstorming Session**

Challenge/Goal: [What you're trying to solve or create]
Context: [Background information]
Constraints: [Any limitations - budget, time, resources]
Target Audience: [Who is this for]
Inspiration: [Anything that inspires you or examples you like]

Current Ideas: [Any initial thoughts you have]`,
      },
    ],
    settings: {
      temperature: 0.9,
      maxTokens: 6000,
    },
  },
  {
    id: "business-strategist",
    name: "Business Strategy Consultant",
    description:
      "Strategic analysis, market research, and actionable business recommendations",
    category: "business",
    difficulty: "advanced",
    icon: <Target className="w-5 h-5" />,
    tags: ["business", "strategy", "analysis", "consulting"],
    messages: [
      {
        role: "system",
        label: "Strategy Framework",
        content: `You are a senior business strategy consultant with expertise in market analysis, competitive strategy, and business transformation.

## Strategic Analysis Framework

### 1. Situation Analysis
- Market landscape and trends
- Competitive positioning
- Internal capabilities (SWOT)
- Customer segments and needs

### 2. Strategic Options
- Growth strategies (Ansoff Matrix)
- Competitive strategies (Porter's Generic)
- Innovation opportunities (Blue Ocean)
- Partnership and M&A options

### 3. Recommendations
- Prioritized action plan
- Resource requirements
- Risk mitigation
- Success metrics
- Timeline and milestones

## Output Format
Present strategy recommendations using:

**Executive Summary** (3-5 key points)
**Strategic Priorities** (Top 3-5)
**Competitive Advantages** (What makes you win)
**Action Plan** (Specific steps)
**Success Metrics** (How to measure)
**Risks & Mitigation** (What could go wrong)

Use frameworks like:
- SWOT Analysis
- Porter's Five Forces
- BCG Matrix
- Value Chain Analysis
- Business Model Canvas

Always ground recommendations in market data and realistic implementation considerations.`,
      },
      {
        role: "user",
        label: "Business Context",
        content: `**Business Strategy Request**

Company/Project: [Name and description]
Industry: [Your industry]
Current Situation: [Where you are now]
Goal: [Where you want to be]
Timeline: [When you need to achieve this]
Resources: [Budget, team, assets available]

Key Challenges: [Main obstacles]
Competitors: [Who you're competing with]
Target Market: [Who your customers are]

Specific Questions: [What you need help with]`,
      },
    ],
    settings: {
      temperature: 0.4,
      maxTokens: 10000,
    },
  },
];

interface RecipeTemplatesGalleryProps {
  onSelectTemplate?: (template: RecipeTemplate) => void;
  onPreviewTemplate?: (template: RecipeTemplate) => void;
  className?: string;
}

export function RecipeTemplatesGallery({
  onSelectTemplate,
  onPreviewTemplate,
  className,
}: RecipeTemplatesGalleryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<RecipeTemplate | null>(
    null,
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const categories = [
    { id: "all", label: "All Templates", icon: <Layers className="w-4 h-4" /> },
    {
      id: "development",
      label: "Development",
      icon: <Code className="w-4 h-4" />,
    },
    { id: "writing", label: "Writing", icon: <FileText className="w-4 h-4" /> },
    {
      id: "research",
      label: "Research",
      icon: <BookOpen className="w-4 h-4" />,
    },
    {
      id: "education",
      label: "Education",
      icon: <Brain className="w-4 h-4" />,
    },
    { id: "business", label: "Business", icon: <Target className="w-4 h-4" /> },
    {
      id: "creative",
      label: "Creative",
      icon: <Lightbulb className="w-4 h-4" />,
    },
  ];

  const filteredTemplates = recipeTemplates.filter((template) => {
    const matchesSearch =
      searchTerm === "" ||
      matchesSearchScoring(template, searchTerm, [
        { get: (t) => t.name, weight: "title" },
        { get: (t) => t.description, weight: "body" },
        { get: (t) => t.tags, weight: "tag" },
      ]);

    const matchesCategory =
      selectedCategory === "all" || template.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "intermediate":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "advanced":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const handleUseTemplate = (template: RecipeTemplate) => {
    onSelectTemplate?.(template);
  };

  const handlePreview = (template: RecipeTemplate) => {
    setPreviewTemplate(template);
    setIsPreviewOpen(true);
    onPreviewTemplate?.(template);
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-col h-full bg-white dark:bg-gray-900",
          className,
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Recipe Templates
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pre-built workflows for common use cases
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Filters */}
          <ScrollArea className="w-full mt-4">
            <div className="flex gap-2">
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={
                    selectedCategory === category.id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="flex-shrink-0"
                >
                  {category.icon}
                  <span className="ml-2">{category.label}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Template Grid */}
        <ScrollArea className="flex-1">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="group hover:shadow-lg transition-all duration-200 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                      {template.icon}
                    </div>
                    <Badge
                      className={cn(
                        "text-xs",
                        getDifficultyColor(template.difficulty),
                      )}
                    >
                      {template.difficulty}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription className="text-sm line-clamp-2">
                    {template.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {template.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {template.tags.length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{template.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => handleUseTemplate(template)}
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Use Template
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handlePreview(template)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTemplates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Search className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-lg font-medium text-gray-600 dark:text-gray-400">
                No templates found
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90dvh] flex flex-col">
          {previewTemplate && (
            <>
              <DialogHeader>
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
                    {previewTemplate.icon}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="text-2xl mb-2">
                      {previewTemplate.name}
                    </DialogTitle>
                    <DialogDescription>
                      {previewTemplate.description}
                    </DialogDescription>
                    <div className="flex gap-2 mt-3">
                      <Badge
                        className={getDifficultyColor(
                          previewTemplate.difficulty,
                        )}
                      >
                        {previewTemplate.difficulty}
                      </Badge>
                      <Badge variant="outline">
                        {previewTemplate.category}
                      </Badge>
                      <Badge variant="outline">
                        {previewTemplate.messages.length} messages
                      </Badge>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 mt-4">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2 text-sm text-gray-700 dark:text-gray-300">
                      Messages in this workflow:
                    </h4>
                    <div className="space-y-3">
                      {previewTemplate.messages.map((message, index) => (
                        <Card key={index} className="border-border">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  message.role === "system"
                                    ? "default"
                                    : message.role === "user"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {message.role}
                              </Badge>
                              <span className="text-sm font-medium">
                                {message.label || `Message ${index + 1}`}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded">
                              {message.content.slice(0, 200)}
                              {message.content.length > 200 && "..."}
                            </pre>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {previewTemplate.settings && (
                    <div>
                      <h4 className="font-semibold mb-2 text-sm text-gray-700 dark:text-gray-300">
                        Recommended Settings:
                      </h4>
                      <Card className="border-border">
                        <CardContent className="pt-4">
                          <div className="space-y-2 text-sm">
                            {previewTemplate.settings.model && (
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Model:
                                </span>
                                <span className="font-medium">
                                  {previewTemplate.settings.model}
                                </span>
                              </div>
                            )}
                            {typeof previewTemplate.settings.temperature ===
                              "number" && (
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Temperature:
                                </span>
                                <span className="font-medium">
                                  {previewTemplate.settings.temperature}
                                </span>
                              </div>
                            )}
                            {previewTemplate.settings.maxTokens && (
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Max Tokens:
                                </span>
                                <span className="font-medium">
                                  {previewTemplate.settings.maxTokens}
                                </span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsPreviewOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    handleUseTemplate(previewTemplate);
                    setIsPreviewOpen(false);
                  }}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Use This Template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
