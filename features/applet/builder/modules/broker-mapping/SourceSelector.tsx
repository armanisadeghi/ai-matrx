import React, { useEffect, useState } from 'react';
import { Lightbulb, Workflow, LayoutTemplate, Zap, Globe } from 'lucide-react';


interface SourceSelectorProps {
  onSelect: (source: string) => void;
  itemCounts: Record<string, number>;
  activeSourceType: string | null;
}


const AppletSourceSelection = ({ onSelect, itemCounts = {}, activeSourceType = null }: SourceSelectorProps) => {
  const [selectedSource, setSelectedSource] = useState(activeSourceType);

  useEffect(() => {
    setSelectedSource(activeSourceType);
  }, [activeSourceType]);
  
  const sources = [
    {
      id: 'workflow',
      name: 'Workflow',
      icon: Workflow,
      description: 'Create automated sequences'
    },
    {
      id: 'recipe',
      name: 'AI Recipe',
      icon: Lightbulb,
      description: 'Use pre-built AI solutions'
    },
    {
      id: 'ai-agent',
      name: 'AI Agent',
      icon: LayoutTemplate,
      description: 'Deploy autonomous agents'
    },
    {
      id: 'action',
      name: 'Action',
      icon: Zap,
      description: 'Execute direct operations'
    },
    {
      id: 'api-integration',
      name: 'API Integration',
      icon: Globe,
      description: 'Connect external services'
    }
  ];

  const handleSelect = (source: (typeof sources)[number]) => {
    const count = itemCounts[source.id] || 0;
    if (count === 0) return;
    
    setSelectedSource(source.id);
    if (onSelect) {
      onSelect(source.id);
    }
  };

  return (
    <div className="w-full py-0 border-none">
      <div className="flex flex-row space-x-3 overflow-x-auto pb-1">
        {sources.map((source) => {
          const count = itemCounts[source.id] || 0;
          const isDisabled = count === 0;
          const isSelected = selectedSource === source.id;
          
          return (
            <div
              key={source.id}
              onClick={() => handleSelect(source)}
              className={`
                relative rounded-lg border flex-1 min-w-36 p-3 flex flex-col items-center text-center 
                transition-all duration-200 cursor-pointer
                ${isDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md'}
                ${isSelected 
                  ? 'border-blue-600 dark:border-blue-400 bg-slate-100 dark:bg-slate-800 ring-2 ring-blue-200 dark:ring-blue-700' 
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}
              `}
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center mb-2
                ${isSelected 
                  ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/30' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}
                transition-all duration-300
              `}>
                {React.createElement(source.icon, { 
                  size: 20,
                  className: isDisabled 
                    ? 'text-slate-400 dark:text-slate-600' 
                    : isSelected 
                      ? 'text-white' 
                      : ''
                })}
              </div>
              
              <h3 className="font-medium text-sm mb-1 text-slate-800 dark:text-slate-200">{source.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{source.description}</p>
              
              <div className={`
                absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full
                ${count > 0 
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600'}
              `}>
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AppletSourceSelection;
