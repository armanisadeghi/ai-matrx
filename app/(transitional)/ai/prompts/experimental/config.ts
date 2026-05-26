import { Blocks, Boxes, Layers, Wrench } from 'lucide-react';
import type { ModulePage } from '@/components/matrx/navigation/types';

export const pages: ModulePage[] = [
  {
    title: 'Prompt Builder',
    path: 'builder',
    relative: true,
    description: 'Advanced prompt construction with structured components',
    icon: Blocks,
  },
  {
    title: 'Chatbot Customizer',
    path: 'chatbot-customizer',
    relative: true,
    description: 'Customize and configure AI chatbot behavior',
    icon: Boxes,
  },
  {
    title: 'Instant Custom Chatbot',
    path: 'chatbot-customizer/instant-custom-chatbot',
    relative: true,
    description: 'Quick chatbot setup and deployment',
  },
  {
    title: 'Modular Chatbot',
    path: 'chatbot-customizer/modular',
    relative: true,
    description: 'Build chatbots with modular components',
  },
  {
    title: 'Prompt Overlay Test',
    path: 'prompt-overlay-test',
    relative: true,
    description: 'Test and validate prompt overlay functionality',
    icon: Layers,
  },
  {
    title: 'Test Controls',
    path: 'test-controls',
    relative: true,
    description: 'Configure and manage testing parameters',
    icon: Wrench,
  },
];

export const filteredPages = pages;
export const MODULE_HOME = '/ai/prompts/experimental';
export const MODULE_NAME = 'Experimental';
