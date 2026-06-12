"use client";

import React, { useState } from "react";
import { AppletFieldController } from "@/features/applet/runner/fields/core/AppletFieldController";


const advancedAppletCreatorDefinitionFAKE_FAKE_FAKE_FAKE = [
  {
    label: '',
    fields: [{ brokerId: '', label: '' }]
  }
];


const getFields = () => {
  const allFields = [];
  advancedAppletCreatorDefinitionFAKE_FAKE_FAKE_FAKE.forEach(container => {
    container.fields.forEach(field => {
      allFields.push({
        id: field.brokerId,
        label: field.label,
        container: container.label,
        field
      });
    });
  });
  return allFields;
};

const FieldTester: React.FC = () => {
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
  

  const sourceId = "THIS-WILL-NOT-WORK-WE-MUST-FETCH-A-TEST-APPLET-FROM-THE-SERVER-AND-LOAD-REDUX-FIRST";
  
  // Get all fields from containers
  const allFields = getFields();
  
  // Get unique container names
  const containers = [...new Set(allFields.map(f => f.container))];
  
  // Filter fields based on selection
  const fieldsToRender = allFields.filter(f => {
    if (selectedField && f.id !== selectedField) return false;
    if (selectedContainer && f.container !== selectedContainer) return false;
    return true;
  });

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">
          Field Component Tester
        </h1>
        
        <div className="mb-6 p-4 bg-textured rounded-lg shadow">
          <h2 className="text-lg font-medium mb-3 text-gray-900 dark:text-gray-100">
            Filter fields
          </h2>
          
          {/* Container filter */}
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">By Container:</h3>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setSelectedContainer(null)}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  selectedContainer === null 
                    ? "bg-rose-500 text-white" 
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
              >
                All Containers
              </button>
              {containers.map(container => (
                <button 
                  key={container}
                  onClick={() => setSelectedContainer(container)}
                  className={`px-3 py-1.5 rounded-md text-sm ${
                    selectedContainer === container 
                      ? "bg-rose-500 text-white" 
                      : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {container}
                </button>
              ))}
            </div>
          </div>
          
          {/* Field type filter */}
          <div>
            <h3 className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">By Field:</h3>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => setSelectedField(null)}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  selectedField === null 
                    ? "bg-rose-500 text-white" 
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                }`}
              >
                All Fields
              </button>
              {allFields.map(def => (
                <button 
                  key={def.id}
                  onClick={() => setSelectedField(def.id)}
                  className={`px-3 py-1.5 rounded-md text-sm ${
                    selectedField === def.id 
                      ? "bg-rose-500 text-white" 
                      : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {def.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          {fieldsToRender.map(def => (
            <div 
              key={def.id} 
              className="p-6 bg-textured rounded-lg shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  {def.label}
                </h2>
                <span className="inline-block px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  {def.container}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">Type:</span> 
                  <span className="ml-2 font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">{def.field.type}</span>
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">ID:</span> 
                  <span className="ml-2 font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 text-xs rounded truncate max-w-[200px] inline-block align-bottom">{def.id}</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                  {def.field.label}
                </label>
                <div className="mt-1">
                {AppletFieldController({ field: def.field, sourceId, isMobile: false })}
                </div>
                {def.field.helpText && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {def.field.helpText}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FieldTester; 