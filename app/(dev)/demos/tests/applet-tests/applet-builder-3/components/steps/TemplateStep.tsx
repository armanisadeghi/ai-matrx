// components/steps/TemplateStep.tsx
import { Brain, BrainCircuit, FileSpreadsheet, FileText, LayoutDashboard, Target } from 'lucide-react';
import { Card } from '../common';
import { StepHeader } from '../common';
import { useAppletStore } from '../../hooks/useAppletState';
import { GiTeamIdea } from "react-icons/gi";
import { FaFreeCodeCamp } from "react-icons/fa6";
import { MdEngineering } from "react-icons/md";
import { MdOutlineSettingsInputComposite } from "react-icons/md";

const TEMPLATES = [
  {
    id: 'currentRecipe',
    name: 'Current Recipe',
    description: 'Use a recipe you already have to create your Applet',
    icon: <Brain className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
  },
  {
    id: 'createRecipe',
    name: 'Create a New Recipe',
    description: 'Create a new recipe for your Applet',
    icon: <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
  },
  {
    id: 'teamRecipe',
    name: 'Team Collaboration',
    description: 'Use a shared recipe from your team.',
    icon: <GiTeamIdea className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
  },
  {
    id: 'systemRecipe',
    name: 'System Recipe',
    description: 'Use a pre-built recipe to get started quickly',
    icon: <BrainCircuit className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
  },
  {
    id: 'freeCollab',
    name: 'Collaboration Hub',
    description: 'Use a free collaboration from talented prompt engineers',
    icon: <FaFreeCodeCamp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
  },
  {
    id: 'paidCollab',
    name: 'Paid Collaboration',
    description: 'Find your perfect prompt engineer and collaborate on a paid recipe',
    icon: <MdEngineering className="h-5 w-5 text-rose-600 dark:text-rose-400" />
  },
] as const;


export function TemplateStep() {
  const { selectedTemplate, setTemplate } = useAppletStore();

  return (
    <div className="space-y-6">
      <StepHeader
        title="Choose a template"
        description="Start with a template or build from scratch"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEMPLATES.map((template) => (
          <Card
            key={template.id}
            onClick={() => setTemplate(template.id)}
            className={`${
              selectedTemplate === template.id
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/50'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                {template.icon}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {template.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="pt-8 border-t border-border">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Or, choose from one of these options.
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-400">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <MdOutlineSettingsInputComposite className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">
                  Import from OpenAI, Anthropic, Google, Xai, Groq, and more.
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Directly paste and generate a recipe from a provider's playground code.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-400">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">
                  Build your app first, then add a recipe later.
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Create your app first, then add a recipe later.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

