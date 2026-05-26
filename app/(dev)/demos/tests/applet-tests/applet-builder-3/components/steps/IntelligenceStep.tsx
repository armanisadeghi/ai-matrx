// components/steps/IntelligenceStep.tsx
import { Brain, Image, ChartLine, FileSearch } from 'lucide-react';
import { Card } from '../common';
import { StepHeader } from '../common';
import { useAppletStore } from '../../hooks/useAppletState';

const AI_CAPABILITIES = [
  {
    id: 'nlp',
    name: 'Natural Language Processing',
    description: 'Extract insights, summarize content, and analyze sentiment',
    icon: <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
  },
  {
    id: 'vision',
    name: 'Image Recognition',
    description: 'Identify objects, faces, and scenes in images',
    icon: <Image className="h-5 w-5 text-blue-600 dark:text-blue-400" />
  },
  {
    id: 'analytics',
    name: 'Predictive Analytics',
    description: 'Forecast trends and predict future outcomes',
    icon: <ChartLine className="h-5 w-5 text-green-600 dark:text-green-400" />
  },
  {
    id: 'document',
    name: 'Document AI',
    description: 'Extract structured data from documents and forms',
    icon: <FileSearch className="h-5 w-5 text-orange-600 dark:text-orange-400" />
  }
] as const;

export function IntelligenceStep() {
  const { selectedCapabilities, setCapabilities } = useAppletStore();

  const toggleCapability = (id: string) => {
    if (selectedCapabilities.includes(id)) {
      setCapabilities(selectedCapabilities.filter(c => c !== id));
    } else {
      setCapabilities([...selectedCapabilities, id]);
    }
  };

  return (
    <div className="space-y-8">
      <StepHeader
        title="Add intelligence to your applet"
        description="Choose AI capabilities for your application"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {AI_CAPABILITIES.map((capability) => (
          <Card
            key={capability.id}
            onClick={() => toggleCapability(capability.id)}
            className={`${
              selectedCapabilities.includes(capability.id)
                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/50'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                {capability.icon}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {capability.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {capability.description}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}