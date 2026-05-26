// components/cards/CustomizationCards.tsx
import React from 'react';
import { 
  Boxes, 
  MessageSquare, 
  Brain, 
  BookOpen, 
  PartyPopper, 
  Code, 
  Clock,
  ListChecks,
  Smile,
  BookMarked,
  FileText,
  Image,
  Settings,
  BellRing
} from 'lucide-react';
import { 
  CardComponentProps, 
  OptionId, 
  OptionValue,
  ToggleOption,
  SliderOption,
  SelectOption,
  RadioGroupOption,
  MultiSelectOption,
  InputOption
} from './types';
import { createOptionComponent } from './AIOptionComponents';

// Generic card that renders option components from a configuration
export const GenericOptionsCard: React.FC<CardComponentProps & {
  options: Array<
    ToggleOption | 
    SliderOption | 
    SelectOption | 
    RadioGroupOption | 
    MultiSelectOption |
    InputOption
  >
}> = ({ state, onChange, options }) => {
  const handleChange = (id: OptionId, value: OptionValue) => {
    onChange(id, value);
  };

  return (
    <div className="space-y-2">
      {options.map(option => {
        // Use current value from state or default from the option config
        const currentValue = state[option.id] !== undefined 
          ? state[option.id] 
          : option.defaultValue;
        
        return createOptionComponent(option, currentValue, handleChange);
      })}
    </div>
  );
};

// Personality Card
export const PersonalityCard: React.FC<CardComponentProps> = (props) => {
  const personalityOptions: RadioGroupOption = {
    type: 'radioGroup',
    id: 'personality',
    label: 'How would you like your AI assistant to behave?',
    options: [
      { id: 'friendly', label: 'Friendly', description: 'Warm, approachable, casual' },
      { id: 'professional', label: 'Professional', description: 'Formal, precise, concise' },
      { id: 'enthusiastic', label: 'Enthusiastic', description: 'Energetic, encouraging, positive' },
      { id: 'balanced', label: 'Balanced', description: 'Neutral, adaptable, versatile' },
      { id: 'academic', label: 'Academic', description: 'Detailed, thorough, analytical' }
    ],
    defaultValue: 'balanced',
  };

  const currentValue = props.state['personality'] || personalityOptions.defaultValue as string;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Choose your AI assistant's personality:</p>
      {createOptionComponent(personalityOptions, currentValue, props.onChange)}
    </div>
  );
};

// Tone Card
export const ToneCard: React.FC<CardComponentProps> = (props) => {
  const toneOptions: RadioGroupOption = {
    type: 'radioGroup',
    id: 'tone',
    label: 'Select your preferred tone:',
    options: [
      { id: 'neutral', label: 'Neutral' },
      { id: 'casual', label: 'Casual' },
      { id: 'formal', label: 'Formal' },
      { id: 'humorous', label: 'Humorous' },
      { id: 'empathetic', label: 'Empathetic' },
      { id: 'direct', label: 'Direct' }
    ],
    defaultValue: 'neutral'
  };

  const currentValue = props.state['tone'] || toneOptions.defaultValue as string;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">How should your AI sound?</p>
      {createOptionComponent(toneOptions, currentValue, props.onChange)}
    </div>
  );
};

// Verbosity Card
export const VerbosityCard: React.FC<CardComponentProps> = (props) => {
  const verbosityOption: SliderOption = {
    type: 'slider',
    id: 'verbosity',
    label: 'Response Length',
    leftLabel: 'Concise',
    rightLabel: 'Detailed',
    defaultValue: 50
  };

  const currentValue = props.state['verbosity'] || verbosityOption.defaultValue as number;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">Adjust how detailed responses should be:</p>
      {createOptionComponent(verbosityOption, currentValue, props.onChange)}
    </div>
  );
};

// Formality Card
export const FormalityCard: React.FC<CardComponentProps> = (props) => {
  const formalityOption: SliderOption = {
    type: 'slider',
    id: 'formality',
    label: 'Communication Style',
    leftLabel: 'Casual',
    rightLabel: 'Formal',
    defaultValue: 50
  };

  const currentValue = props.state['formality'] || formalityOption.defaultValue as number;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">Set the level of formality:</p>
      {createOptionComponent(formalityOption, currentValue, props.onChange)}
    </div>
  );
};

// Style Enhancements Card
export const StyleEnhancementsCard: React.FC<CardComponentProps> = (props) => {
  const options: ToggleOption[] = [
    {
      type: 'toggle',
      id: 'emoji',
      label: 'Use Emoji in Responses',
      icon: Smile,
      defaultValue: false
    },
    {
      type: 'toggle',
      id: 'citations',
      label: 'Include Academic Citations',
      icon: BookMarked,
      defaultValue: true
    }
  ];

  return (
    <GenericOptionsCard {...props} options={options} />
  );
};

// Interactive Features Card
export const InteractiveFeaturesCard: React.FC<CardComponentProps> = (props) => {
  const options: ToggleOption[] = [
    {
      type: 'toggle',
      id: 'autoSuggest',
      label: 'Suggest Follow-up Questions',
      icon: MessageSquare,
      defaultValue: false
    },
    {
      type: 'toggle',
      id: 'notifications',
      label: 'Enable Notifications',
      icon: BellRing,
      defaultValue: false
    }
  ];

  return (
    <GenericOptionsCard {...props} options={options} />
  );
};

// Reasoning Depth Card
export const ReasoningDepthCard: React.FC<CardComponentProps> = (props) => {
  const reasoningOption: SliderOption = {
    type: 'slider',
    id: 'reasoning',
    label: 'Analytical Thinking',
    leftLabel: 'Simple',
    rightLabel: 'Complex',
    defaultValue: 50
  };

  const currentValue = props.state['reasoning'] || reasoningOption.defaultValue as number;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">How deeply should your AI analyze problems?</p>
      {createOptionComponent(reasoningOption, currentValue, props.onChange)}
    </div>
  );
};

// Creativity Level Card
export const CreativityLevelCard: React.FC<CardComponentProps> = (props) => {
  const creativityOption: SliderOption = {
    type: 'slider',
    id: 'creativity',
    label: 'Creative Thinking',
    leftLabel: 'Practical',
    rightLabel: 'Imaginative',
    defaultValue: 50
  };

  const currentValue = props.state['creativity'] || creativityOption.defaultValue as number;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">How creative should your AI be?</p>
      {createOptionComponent(creativityOption, currentValue, props.onChange)}
    </div>
  );
};

// Memory Features Card
export const MemoryFeaturesCard: React.FC<CardComponentProps> = (props) => {
  const memoryOption: ToggleOption = {
    type: 'toggle',
    id: 'memory',
    label: 'Remember Context Across Sessions',
    icon: Clock,
    defaultValue: true
  };

  const currentValue = props.state['memory'] || memoryOption.defaultValue as boolean;

  return (
    <div className="space-y-3 py-2">
      {createOptionComponent(memoryOption, currentValue, props.onChange)}
      <p className="text-xs text-muted-foreground mt-2">
        When enabled, your AI will remember important information from previous conversations.
      </p>
    </div>
  );
};

// Expertise Areas Card
export const ExpertiseAreasCard: React.FC<CardComponentProps> = (props) => {
  const expertiseOptions: MultiSelectOption = {
    type: 'multiSelect',
    id: 'expertise',
    label: "Select topics where you'd like enhanced knowledge:",
    options: [
      { id: 'general', label: 'General Knowledge' },
      { id: 'technology', label: 'Technology' },
      { id: 'science', label: 'Science' },
      { id: 'math', label: 'Mathematics' },
      { id: 'finance', label: 'Finance' },
      { id: 'health', label: 'Health & Medicine' },
      { id: 'arts', label: 'Arts & Culture' },
      { id: 'history', label: 'History' },
      { id: 'business', label: 'Business' },
      { id: 'cooking', label: 'Cooking' },
      { id: 'sports', label: 'Sports' },
      { id: 'travel', label: 'Travel' }
    ],
    defaultValue: ['general']
  };

  const currentValue = props.state['expertise'] || expertiseOptions.defaultValue as string[];

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-3">Choose areas where you need specialized knowledge:</p>
      {createOptionComponent(expertiseOptions, currentValue, props.onChange)}
    </div>
  );
};

// Content Formatting Card
export const ContentFormattingCard: React.FC<CardComponentProps> = (props) => {
  const options: ToggleOption[] = [
    {
      type: 'toggle',
      id: 'stepByStep',
      label: 'Step-by-Step Explanations',
      icon: ListChecks,
      defaultValue: true
    },
    {
      type: 'toggle',
      id: 'examples',
      label: 'Include Practical Examples',
      icon: FileText,
      defaultValue: true
    },
    {
      type: 'toggle',
      id: 'bulletPoints',
      label: 'Use Bullet Points & Lists',
      icon: ListChecks,
      defaultValue: true
    }
  ];

  return (
    <GenericOptionsCard {...props} options={options} />
  );
};

// Technical Features Card
export const TechnicalFeaturesCard: React.FC<CardComponentProps> = (props) => {
  const toggleOptions: ToggleOption[] = [
    {
      type: 'toggle',
      id: 'codeBlocks',
      label: 'Syntax Highlighted Code Blocks',
      icon: Code,
      defaultValue: true
    },
    {
      type: 'toggle',
      id: 'imageGen',
      label: 'Generate Image Descriptions',
      icon: Image,
      defaultValue: false
    }
  ];

  const themeOption: RadioGroupOption = {
    type: 'radioGroup',
    id: 'theme',
    label: 'Theme',
    options: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
      { id: 'system', label: 'System' }
    ],
    defaultValue: 'system'
  };

  const handleChange = (id: OptionId, value: OptionValue) => {
    props.onChange(id, value);
  };

  return (
    <div className="space-y-4">
      <GenericOptionsCard {...props} options={toggleOptions} />
      
      <div className="mt-4">
        {createOptionComponent(themeOption, props.state['theme'] || themeOption.defaultValue, handleChange)}
      </div>
    </div>
  );
};

// Personal Information Card
export const PersonalInfoCard: React.FC<CardComponentProps> = (props) => {
  const options = [
    {
      type: 'input',
      id: 'name',
      label: 'Name',
      placeholder: 'Your name',
      defaultValue: ''
    },
    {
      type: 'input',
      id: 'city',
      label: 'City/Location',
      placeholder: 'Where you live',
      defaultValue: ''
    },
    {
      type: 'input',
      id: 'occupation',
      label: 'Occupation',
      placeholder: 'Your job or role',
      defaultValue: ''
    },
    {
      type: 'input',
      id: 'interests',
      label: 'Primary Interests',
      placeholder: "Topics you're interested in (e.g., cooking, technology, travel)",
      defaultValue: ''
    }
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-4">
        Add personal details to make your AI experience more relevant. All information is optional and private.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map(option => {
          const currentValue = props.state[option.id] !== undefined 
            ? props.state[option.id] 
            : option.defaultValue;
          
          return createOptionComponent(option, currentValue, props.onChange);
        })}
      </div>
    </div>
  );
};