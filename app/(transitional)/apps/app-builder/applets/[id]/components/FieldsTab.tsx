'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { FieldDefinition } from '../page';
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppletContainers } from '@/lib/redux/app-builder/selectors/appletSelectors';

interface FieldsTabProps {
  appletId: string;
}

export default function FieldsTab({ appletId }: FieldsTabProps) {
  const containers = useAppSelector(state => selectAppletContainers(state, appletId)) || [];
  
  // Flatten all fields from all containers
  const allFields = containers.reduce<FieldDefinition[]>((acc, container) => {
    if (container.fields?.length) {
      return [...acc, ...container.fields];
    }
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          {allFields.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No fields defined for this applet.</p>
          ) : (
            <div className="space-y-4">
              {allFields.map((field) => (
                <Card key={field.id} className="p-4 border-l-4 border-indigo-500 dark:border-indigo-400">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-1">
                      <div className="flex items-center">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">{field.label}</h4>
                        {field.required && (
                          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">ID: {field.id}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Component: {field.component}
                      </p>
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                      {field.description && (
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{field.description}</p>
                        </div>
                      )}
                      
                      {field.placeholder && (
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Placeholder</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{field.placeholder}</p>
                        </div>
                      )}
                      
                      {field.group && (
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Group</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{field.group}</p>
                        </div>
                      )}
                      
                      {field.defaultValue && (
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Default Value</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {typeof field.defaultValue === 'object' 
                              ? JSON.stringify(field.defaultValue) 
                              : String(field.defaultValue)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 