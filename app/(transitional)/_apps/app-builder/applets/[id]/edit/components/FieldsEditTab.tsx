'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useAppSelector } from '@/lib/redux/hooks';
import { selectAppletContainers } from '@/lib/redux/app-builder/selectors/appletSelectors';
import { FieldDefinition } from '../../page';

interface FieldsEditTabProps {
  appletId: string;
}

export default function FieldsEditTab({ appletId }: FieldsEditTabProps) {
  const containers = useAppSelector(state => selectAppletContainers(state, appletId)) || [];
  
  // Flatten all fields from all containers
  const allFields = containers.reduce<FieldDefinition[]>((acc, container) => {
    if (container.fields?.length) {
      return [...acc, ...container.fields];
    }
    return acc;
  }, []);

  // Handler for adding a new field
  const handleAddField = () => {
    // This would open a modal or redirect to a field creation page
    console.log('Add field clicked');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">
            Fields ({allFields.length})
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Manage all fields across all containers.
          </p>
        </div>
        
        <Button onClick={handleAddField} disabled={containers.length === 0}>
          <Plus className="h-4 w-4 mr-2" /> Add Field
        </Button>
      </div>

      {allFields.length === 0 ? (
        <Card className="p-6 flex flex-col items-center justify-center h-64">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {containers.length === 0 
              ? 'You need to create a container first before adding fields.' 
              : 'No fields defined for this applet.'}
          </p>
          <Button onClick={handleAddField} disabled={containers.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> 
            {containers.length === 0 ? 'Create Container First' : 'Create First Field'}
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {allFields.map((field) => (
            <Card key={field.id} className="p-4 border-l-4 border-indigo-500 dark:border-indigo-400">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{field.label}</h4>
                      {field.required && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Required
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      Edit
                    </Button>
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
} 