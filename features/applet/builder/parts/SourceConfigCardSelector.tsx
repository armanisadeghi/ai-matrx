import React, { useState, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AppletSourceConfig, NeededBroker } from '@/types/customAppTypes';
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectTempSourceConfigList } from '@/lib/redux/app-builder/selectors/appletSelectors';
import { selectActiveAppletId } from '@/lib/redux/app-builder/selectors/appletSelectors';
import { fetchFieldsThunk } from '@/lib/redux/app-builder/thunks/fieldBuilderThunks';
import { selectAllFields, selectFieldLoading, selectFieldError } from '@/lib/redux/app-builder/selectors/fieldSelectors';
import {
  isRecipeAppletSourceConfig,
  RecipeAppletSourceConfig,
} from '@/features/applet/builder/utils/sourceConfigGuards';

interface BrokerMapping {
  appletId: string;
  fieldId: string;
  brokerId: string;
}

const convertPythonTypeToLabel = (dataType: string) => {
  switch (dataType) {
    case 'str':
      return 'Text';
    case 'int':
      return 'Number';
    case 'float':
      return 'Decimal';
    case 'bool':
      return 'True/False';
    case 'date':
      return 'Date';
    case 'datetime':
      return 'Date and Time';
    case 'list':
      return 'List of items';
    case 'dict':
      return 'Object';
    case 'url':
      return 'URL';
    case 'file':
      return 'File';
    case 'image':
      return 'Image';
    case 'video':
      return 'Video';
    default:
      return dataType;
  }
}


// Props for the component
interface SourceConfigCardSelectorProps {
  appletId?: string;
  onSourceConfigSelected: (sourceConfig: AppletSourceConfig | null) => void;
  onMappingCreated: (mapping: BrokerMapping) => void;
}

const SourceConfigCardSelector = ({ appletId, onSourceConfigSelected, onMappingCreated }: SourceConfigCardSelectorProps) => {
  const [selectedSourceConfig, setSelectedSourceConfig] = useState<RecipeAppletSourceConfig | null>(null);
  const [selectedBroker, setSelectedBroker] = useState<NeededBroker | null>(null);
  const [selectedField, setSelectedField] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const tempSourceConfigList = useAppSelector(selectTempSourceConfigList);
  const recipeSourceConfigs = tempSourceConfigList.filter(isRecipeAppletSourceConfig);
  const activeAppletId = useAppSelector(selectActiveAppletId);
  const dispatch = useAppDispatch();
  const allFields = useAppSelector(selectAllFields);
  const isLoading = useAppSelector(selectFieldLoading);
  const error = useAppSelector(selectFieldError);
  
  const idToUse = appletId ?? activeAppletId;
  
  useEffect(() => {
    // Fetch fields regardless of whether we have them already
    dispatch(fetchFieldsThunk());
  }, [dispatch]);
  
  // Handle recipe selection
  const handleSourceConfigSelect = (sourceConfig: RecipeAppletSourceConfig) => {
    setSelectedSourceConfig(sourceConfig);
    setSelectedBroker(null);
    setSelectedField('');
    onSourceConfigSelected(sourceConfig);
  };
  
  // Handle broker selection
  const handleBrokerSelect = (broker: NeededBroker) => {
    setSelectedBroker(broker);
  };
  
  // Create mapping between broker and field
  const handleCreateMapping = () => {
    if (!selectedSourceConfig || !selectedBroker || !selectedField.trim() || !idToUse) return;
    
    const mapping: BrokerMapping = {
      appletId: idToUse,
      fieldId: selectedField.trim(),
      brokerId: selectedBroker.id
    };
    
    onMappingCreated(mapping);
    setSelectedField('');
  };
  
  // Helper function to display values safely, showing "null" for null values
  const displayValue = (value: unknown): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === 'string') return value;
    return String(value);
  };

  const displayBrokerType = (dataType: string) => {
    return convertPythonTypeToLabel(dataType);
  };
  
  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Recipe Selector</h2>
      
      {/* Main content area with 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left column: Recipe list */}
        <div className="flex flex-col space-y-4">
          <div className="border rounded-lg p-4 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="font-medium text-sm mb-3 text-gray-900 dark:text-gray-100">Available Recipes</h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {recipeSourceConfigs.map((sourceConfig, index) => (
                <div 
                  key={`${sourceConfig.config.compiledId}-${index}`}
                  className={`border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                    selectedSourceConfig === sourceConfig 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400' 
                      : 'border-gray-200 dark:border-gray-700 dark:bg-gray-800/90'
                  }`}
                  onClick={() => handleSourceConfigSelect(sourceConfig)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">Recipe {index + 1}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                        {displayValue(sourceConfig.config.compiledId).substring(0, 12)}...
                      </p>
                    </div>
                    <div className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                      v{displayValue(sourceConfig.config.version)}
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Brokers: {displayValue(sourceConfig.config.neededBrokers.length)}
                    </p>
                  </div>
                  
                  {selectedSourceConfig === sourceConfig && (
                    <div className="absolute top-2 right-2">
                      <Check size={16} className="text-blue-500 dark:text-blue-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {selectedSourceConfig && (
            <div className="border rounded-lg p-4 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-medium text-sm mb-3 text-gray-900 dark:text-gray-100">Recipe Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-28">Recipe ID:</span> 
                  <span className="text-gray-900 dark:text-gray-100 text-xs break-all">{displayValue(selectedSourceConfig.config.id)}</span>
                </div>
                <div className="flex">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-28">Compiled ID:</span> 
                  <span className="text-gray-900 dark:text-gray-100 text-xs break-all">{displayValue(selectedSourceConfig.config.compiledId)}</span>
                </div>
                <div className="flex">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-28">Version:</span> 
                  <span className="text-gray-900 dark:text-gray-100">{displayValue(selectedSourceConfig.config.version)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Right column: Broker details and mapping */}
        <div className="flex flex-col space-y-4">
          {selectedSourceConfig ? (
            <>
              <div className="border rounded-lg p-4 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
                <h3 className="font-medium text-sm mb-3 text-gray-900 dark:text-gray-100">Needed Brokers</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {selectedSourceConfig.config.neededBrokers.map((broker) => (
                    <div 
                      key={broker.id}
                      className={`border rounded p-3 cursor-pointer ${
                        selectedBroker?.id === broker.id 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400' 
                          : 'border-gray-200 dark:border-gray-700 dark:bg-gray-800/60'
                      }`}
                      onClick={() => handleBrokerSelect(broker)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                        <p className="font-medium text-sm text-gray-900 dark:text-gray-100">Broker Name:</p>
                        <p className="font-medium text-md text-blue-400 dark:text-blue-400">{displayValue(broker.name)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Broker ID: {displayValue(broker.id).substring(0, 8)}...</p>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          broker.required 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {broker.required ? 'Required' : 'Optional'}
                        </div>
                      </div>
                      <div className="mt-2 text-xs">
                        <div className="flex">
                          <span className="font-medium text-gray-700 dark:text-gray-300 w-36">Data Type:</span>
                          <span className="text-gray-900 dark:text-gray-100">{displayBrokerType(broker.dataType)}</span>
                        </div>
                        <div className="flex mt-1">
                          <span className="font-medium text-gray-700 dark:text-gray-300 w-36">Default Value:</span>
                          <span className="italic text-gray-700 dark:text-gray-300 truncate">
                            {displayValue(broker.defaultValue).substring(0, 60)}...
                          </span>
                        </div>
                        <div className="flex mt-1">
                          <span className="font-medium text-gray-700 dark:text-gray-300 w-36">Default Input Component:</span>
                          <span className="text-gray-900 dark:text-gray-100">{displayValue(broker.fieldComponentId)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Broker Mapping */}
              {selectedBroker && (
                <div className="border rounded-lg p-4 border-gray-200 dark:border-gray-700 dark:bg-gray-800">
                  <h3 className="font-medium text-sm mb-3 text-gray-900 dark:text-gray-100">Create Broker Mapping</h3>
                  <div className="bg-gray-50 dark:bg-gray-700/40 p-3 rounded mb-3">
                    <div className="text-sm flex mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300 w-36">Broker:</span>
                      <span className="text-gray-900 dark:text-gray-100">{displayValue(selectedBroker.name)}</span>
                    </div>
                    <div className="text-sm flex mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300 w-36">Broker ID:</span>
                      <span className="text-gray-900 dark:text-gray-100 text-xs break-all">{displayValue(selectedBroker.id)}</span>
                    </div>
                    <div className="text-sm flex">
                      <span className="font-medium text-gray-700 dark:text-gray-300 w-36">Applet ID:</span>
                      <span className="text-gray-900 dark:text-gray-100 text-xs break-all">{displayValue(idToUse)}</span>
                    </div>
                  </div>
                  
                  {/* Field Dropdown */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Field</label>
                    <div className="relative">
                      <div 
                        className="w-full px-3 py-2 border rounded text-sm text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-blue-500 focus:border-blue-500 cursor-pointer flex justify-between items-center"
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                      >
                        <span>{selectedField ? allFields.find(f => f.id === selectedField)?.label || selectedField : "Select a field..."}</span>
                        <ChevronDown size={16} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                      
                      {dropdownOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                          {isLoading ? (
                            <div className="p-2 text-center text-gray-500 dark:text-gray-400">Loading fields...</div>
                          ) : error ? (
                            <div className="p-2 text-center text-red-500">Error loading fields</div>
                          ) : allFields.length === 0 ? (
                            <div className="p-2 text-center text-gray-500 dark:text-gray-400">No fields available</div>
                          ) : (
                            <ul className="py-1">
                              {allFields.map(field => (
                                <li 
                                  key={field.id}
                                  className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer flex justify-between items-center"
                                  onClick={() => {
                                    setSelectedField(field.id);
                                    setDropdownOpen(false);
                                  }}
                                >
                                  <div>
                                    <span className="text-gray-900 dark:text-gray-100">{field.label}</span>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{field.id} • {field.component}</p>
                                  </div>
                                  {selectedField === field.id && (
                                    <Check size={16} className="text-blue-500" />
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <button
                      onClick={handleCreateMapping}
                      disabled={!selectedField.trim() || !idToUse}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-700 rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 mt-2"
                    >
                      Map Broker to Field
                    </button>
                  </div>
                </div>
              )}
              
              {!selectedBroker && (
                <div className="border rounded-lg p-4 border-gray-200 dark:border-gray-700 dark:bg-gray-800 flex items-center justify-center h-24">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Select a broker to create a mapping</p>
                </div>
              )}
            </>
          ) : (
            <div className="border rounded-lg p-4 border-gray-200 dark:border-gray-700 dark:bg-gray-800 flex items-center justify-center h-64">
              <p className="text-gray-500 dark:text-gray-400">Select a recipe to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SourceConfigCardSelector;
