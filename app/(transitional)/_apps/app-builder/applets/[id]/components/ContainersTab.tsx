'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { AppletContainer, FieldDefinition } from '../page';
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletContainers } from '@/lib/redux/app-builder/selectors/appletSelectors';

interface ContainersTabProps {
  appletId: string;
}

export default function ContainersTab({ appletId }: ContainersTabProps) {
  const containers = useAppSelector(state => selectAppletContainers(state, appletId)) || [];
  
  return (
    <div className="space-y-4">
      {containers.length === 0 ? (
        <Card className="p-4">
          <p className="text-gray-500 dark:text-gray-400">No containers defined for this applet.</p>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-4">
          {containers.map((container, index) => (
            <ContainerItem key={container.id} container={container} index={index} />
          ))}
        </Accordion>
      )}
    </div>
  );
}

function ContainerItem({ container, index }: { container: AppletContainer; index: number }) {
  return (
    <Card className="overflow-hidden">
      <AccordionItem value={container.id} className="border-none">
        <AccordionTrigger className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <div className="flex items-center gap-2 text-left">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {index + 1}. {container.label}
            </span>
            <Badge variant="outline" className="ml-2">
              {container.fields.length} fields
            </Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Container ID</p>
                <p className="text-gray-900 dark:text-gray-100">{container.id}</p>
              </div>
              
              {container.shortLabel && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Short Label</p>
                  <p className="text-gray-900 dark:text-gray-100">{container.shortLabel}</p>
                </div>
              )}
              
              {container.description && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
                  <p className="text-gray-900 dark:text-gray-100">{container.description}</p>
                </div>
              )}
              
              {container.helpText && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Help Text</p>
                  <p className="text-gray-900 dark:text-gray-100">{container.helpText}</p>
                </div>
              )}
              
              {container.gridCols && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Grid Columns</p>
                  <p className="text-gray-900 dark:text-gray-100">{container.gridCols}</p>
                </div>
              )}
              
              {container.hideDescription !== undefined && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Hide Description</p>
                  <p className="text-gray-900 dark:text-gray-100">{container.hideDescription ? 'Yes' : 'No'}</p>
                </div>
              )}
            </div>
            
            <div className="mt-6">
              <h4 className="text-md font-medium mb-4 text-gray-700 dark:text-gray-300">Fields</h4>
              
              {container.fields.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No fields defined for this container.</p>
              ) : (
                <div className="space-y-4">
                  {container.fields.map((field, fieldIndex) => (
                    <FieldItem key={field.id} field={field} index={fieldIndex} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Card>
  );
}

function FieldItem({ field, index }: { field: FieldDefinition; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <Card className="border-border">
      <div 
        className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800 dark:text-gray-200">
              {index + 1}. {field.label}
            </span>
            <Badge variant="outline">{field.component}</Badge>
            {field.required && <Badge className="bg-blue-500 text-white">Required</Badge>}
          </div>
          <div>
            <svg 
              className={`w-5 h-5 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Field ID</p>
              <p className="text-gray-900 dark:text-gray-100">{field.id}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Component</p>
              <p className="text-gray-900 dark:text-gray-100">{field.component}</p>
            </div>
            
            {field.description && (
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
                <p className="text-gray-900 dark:text-gray-100">{field.description}</p>
              </div>
            )}
            
            {field.helpText && (
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Help Text</p>
                <p className="text-gray-900 dark:text-gray-100">{field.helpText}</p>
              </div>
            )}
            
            {field.placeholder && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Placeholder</p>
                <p className="text-gray-900 dark:text-gray-100">{field.placeholder}</p>
              </div>
            )}
            
            {field.iconName && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Icon</p>
                <p className="text-gray-900 dark:text-gray-100">{field.iconName}</p>
              </div>
            )}
            
            {field.group && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Group</p>
                <p className="text-gray-900 dark:text-gray-100">{field.group}</p>
              </div>
            )}
            
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Include Other Option</p>
              <p className="text-gray-900 dark:text-gray-100">{field.includeOther ? 'Yes' : 'No'}</p>
            </div>
            
            {field.defaultValue !== undefined && (
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Default Value</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {typeof field.defaultValue === 'object' 
                    ? JSON.stringify(field.defaultValue)
                    : String(field.defaultValue)}
                </p>
              </div>
            )}
            
            {field.options && field.options.length > 0 && (
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Options ({field.options.length})</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {field.options.map((option, optionIndex) => (
                    <div key={`${field.id}-option-${optionIndex}-${option.value}`} className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 rounded-md px-2 py-1">
                      {option.label} ({option.value})
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {Object.keys(field.componentProps || {}).length > 0 && (
              <div className="col-span-2">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Component Props</p>
                <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-auto text-xs text-gray-900 dark:text-gray-100">
                  {JSON.stringify(field.componentProps, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
} 