// config/aiCustomizationConfig.ts
import {
    SquareStack,
    MessageSquare,
    Brain,
    BookOpen,
    Clock,
    UserCircle,
    Sliders,
    Palette,
    PanelTop,
    Code,
    MousePointerClick,
    Zap,
    Settings,
    ListChecks
} from 'lucide-react';
  import { AICustomizationConfig } from './types';
  import {
    PersonalityCard,
    ToneCard,
    VerbosityCard,
    FormalityCard,
    StyleEnhancementsCard,
    InteractiveFeaturesCard,
    ReasoningDepthCard,
    CreativityLevelCard,
    MemoryFeaturesCard,
    ExpertiseAreasCard,
    ContentFormattingCard,
    TechnicalFeaturesCard,
    PersonalInfoCard
  } from './CustomizationCards';
  
  // Default initial state
  export const defaultAICustomizationState = {
    communicationStyle: {
      personality: 'balanced',
      tone: 'neutral',
      verbosity: 50,
      formality: 50,
      emoji: false,
      citations: true,
      autoSuggest: false,
      notifications: false
    },
    intelligenceCapabilities: {
      reasoning: 50,
      creativity: 50,
      memory: true,
      expertise: ['general']
    },
    outputPreferences: {
      stepByStep: true,
      examples: true,
      bulletPoints: true,
      codeBlocks: true,
      imageGen: false,
      theme: 'system'
    },
    personalInfo: {
      name: '',
      city: '',
      occupation: '',
      interests: ''
    }
  };
  
  // Complete configuration
  export const aiCustomizationConfig: AICustomizationConfig = {
    sections: [
      {
        id: 'communicationStyle',
        title: 'Personality & Style',
        icon: SquareStack,
        description: 'Configure how your AI assistant communicates with you',
        cards: [
          {
            id: 'personality',
            title: 'Choose AI Personality',
            icon: SquareStack,
            size: 'large',
            component: PersonalityCard
          },
          {
            id: 'tone',
            title: 'Conversation Tone',
            icon: MessageSquare,
            component: ToneCard
          },
          {
            id: 'verbosity',
            title: 'Verbosity',
            icon: MessageSquare,
            component: VerbosityCard
          },
          {
            id: 'formality',
            title: 'Formality',
            icon: MessageSquare,
            component: FormalityCard
          },
          {
            id: 'style',
            title: 'Style Enhancements',
            icon: Palette,
            component: StyleEnhancementsCard
          },
          {
            id: 'interactive',
            title: 'Interactive Features',
            icon: Zap,
            component: InteractiveFeaturesCard
          }
        ]
      },
      {
        id: 'intelligenceCapabilities',
        title: 'Intelligence & Capabilities',
        icon: Brain,
        description: 'Adjust how your AI thinks and what it knows',
        cards: [
          {
            id: 'reasoning',
            title: 'Reasoning Depth',
            icon: Brain,
            component: ReasoningDepthCard
          },
          {
            id: 'creativity',
            title: 'Creativity Level',
            icon: MousePointerClick,
            component: CreativityLevelCard
          },
          {
            id: 'memory',
            title: 'Memory Features',
            icon: Clock,
            component: MemoryFeaturesCard
          },
          {
            id: 'expertise',
            title: 'Areas of Expertise',
            icon: BookOpen,
            size: 'large',
            component: ExpertiseAreasCard
          }
        ]
      },
      {
        id: 'outputPreferences',
        title: 'Output Format & Preferences',
        icon: PanelTop,
        description: 'Control how information is presented and organized',
        cards: [
          {
            id: 'formatting',
            title: 'Content Formatting',
            icon: ListChecks,
            component: ContentFormattingCard
          },
          {
            id: 'technical',
            title: 'Technical Features',
            icon: Code,
            component: TechnicalFeaturesCard
          }
        ]
      },
      {
        id: 'personalInfo',
        title: 'Personal Details',
        icon: UserCircle,
        description: 'Optional information to personalize your experience',
        cards: [
          {
            id: 'personal',
            title: 'Personal Information',
            icon: UserCircle,
            size: 'large',
            component: PersonalInfoCard
          }
        ]
      }
    ]
  };