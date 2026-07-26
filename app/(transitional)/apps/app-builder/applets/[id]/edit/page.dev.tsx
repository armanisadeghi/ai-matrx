'use client';

import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { 
  selectAppletById,
  selectAppletLoading,
} from '@/lib/redux/app-builder/selectors/appletSelectors';
import { setActiveAppletWithFetchThunk } from '@/lib/redux/app-builder/thunks/appletBuilderThunks';
import { toast } from '@/components/ui/use-toast';
import { 
  LayoutIcon, 
  Database, 
  Code, 
  ArrowRight, 
  Link, 
  Workflow, 
  Info,
  History,
  Palette,
  Rows,
  Box,
  FileCode,
  AppWindow,
  Utensils
} from 'lucide-react';

// Tab Components
import EditTabLayout from './components/EditTabLayout';
import OverviewEditTab from './components/OverviewEditTab';
import VisualsEditTab from './components/VisualsEditTab';
import LayoutEditTab from './components/LayoutEditTab';
import ContainersEditTab from './components/ContainersEditTab';
import FieldsEditTab from './components/FieldsEditTab';
import DataSourceEditTab from './components/DataSourceEditTab';
import JsonConfigEditTab from './components/JsonConfigEditTab';
import AppEditTab from './components/AppEditTab';
import RecipeEditTab from './components/RecipeEditTab';
import ConfigEditTab from './components/ConfigEditTab';
import InfoEditTab from './components/InfoEditTab';
import BrokerMappingsEditTab from './components/BrokerMappingsEditTab';
import LegacyEditorTab from './components/LegacyEditorTab';

// Types
import { AppletBuilder } from '../page';

export default function AppletEditPage({ params }: { params: Promise<{ id: string }> }) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const dispatch = useAppDispatch();
  
  // Get applet data from Redux
  const applet = useAppSelector((state) => selectAppletById(state, id));
  const isLoading = useAppSelector(selectAppletLoading);

  // Local state for edit mode
  const [editedApplet, setEditedApplet] = useState<AppletBuilder | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Set active applet when component mounts
  useEffect(() => {
    if (id) {
      dispatch(setActiveAppletWithFetchThunk(id)).unwrap()
        .catch(error => {
          console.error("Failed to set active applet:", error);
          toast({
            title: "Error",
            description: "Failed to set active applet.",
            variant: "destructive",
          });
        });
    }
  }, [id, dispatch]);

  // Initialize editedApplet state when the original applet data is loaded
  useEffect(() => {
    if (applet) {
      setEditedApplet({ ...applet } as unknown as AppletBuilder);
    }
  }, [applet]);

  // Handle updates to the applet data
  const handleFieldUpdate = (field: string, value: any) => {
    if (!editedApplet) return;
    
    setEditedApplet(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: value
      };
    });
    setHasChanges(true);
  };

  // Handle updating containers
  const handleContainersUpdate = (containers: any[]) => {
    handleFieldUpdate('containers', containers);
  };

  // Handle updating data source config
  const handleDataSourceUpdate = (dataSourceConfig: any) => {
    handleFieldUpdate('dataSourceConfig', dataSourceConfig);
  };

  // Handle updating broker mappings
  const handleBrokerMappingsUpdate = (brokerMap: any[]) => {
    handleFieldUpdate('brokerMap', brokerMap);
  };

  // Handle updating JSON configurations
  const handleJsonConfigUpdate = (field: string, value: any) => {
    handleFieldUpdate(field, value);
  };

  // Handle updating the entire applet
  const handleFullAppletUpdate = (updatedApplet: AppletBuilder) => {
    setEditedApplet(updatedApplet);
    setHasChanges(true);
  };

  // Handle saving all changes
  const handleSave = async () => {
    console.log("Saving changes:", editedApplet);
    // This would typically dispatch a thunk to save the changes to the server
    // For now, we'll just log the changes
    
    // Simulate a delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reset the changes flag
    setHasChanges(false);
    
    return Promise.resolve();
  };
  
  // Loading state
  if (isLoading || !applet || !editedApplet) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Info className="h-4 w-4" />,
      content: (
        <OverviewEditTab 
          id={editedApplet.id}
        />
      ),
    },
    {
      id: 'visuals',
      label: 'Visuals',
      icon: <Palette className="h-4 w-4" />,
      content: (
        <VisualsEditTab 
          id={editedApplet.id}
        />
      ),
    },
    {
      id: 'layout',
      label: 'Layout',
      icon: <Rows className="h-4 w-4" />,
      content: (
        <LayoutEditTab 
          appletId={editedApplet.id}
          layoutType={editedApplet.layoutType}
          appletSubmitText={editedApplet.appletSubmitText}
          overviewLabel={editedApplet.overviewLabel}
          onUpdate={handleFieldUpdate}
        />
      ),
    },
    {
      id: 'containers',
      label: 'Containers',
      icon: <Box className="h-4 w-4" />,
      content: (
        <ContainersEditTab
          appletId={editedApplet.id}
        />
      ),
    },
    {
      id: 'fields',
      label: 'Fields',
      icon: <LayoutIcon className="h-4 w-4" />,
      content: (
        <FieldsEditTab
          appletId={editedApplet.id}
        />
      ),
    },
    {
      id: 'datasource',
      label: 'Data',
      icon: <Database className="h-4 w-4" />,
      content: (
        <DataSourceEditTab
          appletId={editedApplet.id}
        />
      ),
    },
    {
      id: 'result',
      label: 'Result',
      icon: <Code className="h-4 w-4" />,
      content: (
        <JsonConfigEditTab 
          title="Result Component Configuration"
          description="Configure how results are displayed after form submission."
          appletId={editedApplet.id}
          configType="resultComponentConfig"
        />
      ),
    },
    {
      id: 'nextStep',
      label: 'Next Steps',
      icon: <ArrowRight className="h-4 w-4" />,
      content: (
        <JsonConfigEditTab 
          title="Next Step Configuration"
          description="Configure what happens after form submission."
          appletId={editedApplet.id}
          configType="nextStepConfig"
        />
      ),
    },
    {
      id: 'app',
      label: 'App',
      icon: <AppWindow className="h-4 w-4" />,
      content: (
        <AppEditTab 
          appId={editedApplet.appId}
          subcategoryId={editedApplet.subcategoryId}
          onUpdate={handleFieldUpdate}
        />
      ),
    },
    {
      id: 'recipe',
      label: 'Recipe',
      icon: <Utensils className="h-4 w-4" />,
      content: (
        <RecipeEditTab 
          compiledRecipeId={editedApplet.compiledRecipeId}
          onUpdate={handleFieldUpdate}
        />
      ),
    },
    {
      id: 'brokers',
      label: 'Brokers',
      icon: <Workflow className="h-4 w-4" />,
      content: (
        <BrokerMappingsEditTab 
          brokerMap={editedApplet.brokerMap} 
          onUpdate={handleBrokerMappingsUpdate} 
        />
      ),
    },
    {
      id: 'config',
      label: 'Config',
      icon: <FileCode className="h-4 w-4" />,
      content: (
        <ConfigEditTab 
          applet={editedApplet} 
          onUpdate={handleFullAppletUpdate} 
        />
      ),
    },
    {
      id: 'info',
      label: 'Info',
      icon: <Info className="h-4 w-4" />,
      content: (
        <InfoEditTab 
          id={editedApplet.id}
          onUpdate={handleFieldUpdate}
        />
      ),
    },
    {
      id: 'legacy',
      label: 'Legacy',
      icon: <History className="h-4 w-4" />,
      content: <LegacyEditorTab applet={editedApplet} />,
    },
  ];
  
  return (
    <EditTabLayout 
      title={editedApplet.name || 'Untitled Applet'} 
      subtitle={`ID: ${editedApplet.id}`}
      tabs={tabs}
      id={editedApplet.id}
      onSave={handleSave}
      hasChanges={hasChanges}
    />
  );
} 