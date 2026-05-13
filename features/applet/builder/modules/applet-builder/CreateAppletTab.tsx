'use client';

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PaletteIcon, SaveIcon, CheckIcon, BoxIcon, CodeIcon, PlusIcon, RefreshCwIcon, LayoutIcon } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/components/ui/use-toast';
import { CustomAppletConfig, AppletContainer } from '@/types/customAppTypes';
import { ICON_OPTIONS, COLOR_VARIANTS } from '@/features/applet/styles/StyledComponents';
import { RecipeInfo } from "@/features/recipes/types";
import { ImageAssetUploader } from '@/components/official/ImageAssetUploader';
import { CloudFolders } from '@/features/files';

interface CreateAppletTabProps {
  newApplet: Partial<CustomAppletConfig>;
  setNewApplet: React.Dispatch<React.SetStateAction<Partial<CustomAppletConfig>>>;
  selectedApplet: CustomAppletConfig | null;
  isLoading: boolean;
  compiledRecipeId: string | null;
  selectedRecipe: RecipeInfo | null;
  availableColors: string[];
  layoutTypes: { value: string; label: string }[];
  resetForm: () => void;
  saveApplet: () => Promise<void>;
  updateApplet: () => Promise<void>;
  openIconPicker: (type: 'main' | 'submit') => void;
  setShowRecipeDialog: (show: boolean) => void;
  openGroupSelector: () => void;
  refreshGroup: (groupId: string) => Promise<void>;
  refreshAllGroups: () => Promise<void>;
  renderIcon: (iconName: string | undefined) => React.ReactNode;
}

export const CreateAppletTab: React.FC<CreateAppletTabProps> = ({
  newApplet,
  setNewApplet,
  selectedApplet,
  isLoading,
  compiledRecipeId,
  selectedRecipe,
  availableColors,
  layoutTypes,
  resetForm,
  saveApplet,
  updateApplet,
  openIconPicker,
  setShowRecipeDialog,
  openGroupSelector,
  refreshGroup,
  refreshAllGroups,
  renderIcon
}) => {
  const [showRefreshWarning, setShowRefreshWarning] = React.useState(false);
  const [groupToRefresh, setGroupToRefresh] = React.useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = React.useState(false);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewApplet(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    // Convert camelCase or any case to snake_case
    const slug = name.toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1_$2') // Convert camelCase to snake_case
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[^a-z0-9_]/g, ''); // Remove special characters
    
    setNewApplet(prev => ({
      ...prev,
      name,
      slug
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setNewApplet(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const promptRefreshGroup = (groupId: string) => {
    setGroupToRefresh(groupId);
    setRefreshingAll(false);
    setShowRefreshWarning(true);
  };
  
  const promptRefreshAllGroups = () => {
    setGroupToRefresh(null);
    setRefreshingAll(true);
    setShowRefreshWarning(true);
  };
  
  const handleConfirmRefresh = async () => {
    if (refreshingAll) {
      await refreshAllGroups();
    } else if (groupToRefresh) {
      await refreshGroup(groupToRefresh);
    }
    setShowRefreshWarning(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 p-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-900 dark:text-gray-100">
              Applet Name
            </Label>
            <Input
              id="name"
              name="name"
              value={newApplet.name || ''}
              onChange={handleNameChange}
              placeholder="Enter applet name"
              className="border-gray-200 dark:border-gray-700 bg-textured"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="slug" className="text-gray-900 dark:text-gray-100">
              Slug
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-generated from name, but can be customized (Must be unique)
            </p>
            <Input
              id="slug"
              name="slug"
              value={newApplet.slug || ''}
              onChange={handleInputChange}
              placeholder="Enter applet slug"
              className="border-gray-200 dark:border-gray-700 bg-textured"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-900 dark:text-gray-100">
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              value={newApplet.description || ''}
              onChange={handleInputChange}
              placeholder="Enter applet description"
              className="resize-none border-gray-200 dark:border-gray-700 bg-textured"
              rows={9}
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100">
                Applet Icon
              </Label>
              <Button
                variant="outline"
                onClick={() => openIconPicker('main')}
                className="w-full border-gray-200 dark:border-gray-700 flex items-center justify-between"
              >
                <div className="flex items-center">
                  {renderIcon(newApplet.appletIcon)}
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 truncate">
                    {newApplet.appletIcon || 'Select Icon'}
                  </span>
                </div>
                <PaletteIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </Button>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="appletSubmitText" className="text-gray-900 dark:text-gray-100">
                Submit Text
              </Label>
              <Input
                id="appletSubmitText"
                name="appletSubmitText"
                value={newApplet.appletSubmitText || ''}
                onChange={handleInputChange}
                placeholder="Submit text (Most people do not use this for applets)"
                className="border-gray-200 dark:border-gray-700 bg-textured"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor" className="text-gray-900 dark:text-gray-100">
                Primary Color
              </Label>
              <Select
                value={newApplet.primaryColor}
                onValueChange={(value) => handleSelectChange('primaryColor', value)}
              >
                <SelectTrigger className="border-gray-200 dark:border-gray-700 bg-textured">
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  {availableColors.map(color => (
                    <SelectItem key={color} value={color} className="flex items-center">
                      <div className={`w-4 h-4 rounded-full bg-${color}-500 mr-2`} />
                      <span className="capitalize">{color}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="accentColor" className="text-gray-900 dark:text-gray-100">
                Accent Color
              </Label>
              <Select
                value={newApplet.accentColor}
                onValueChange={(value) => handleSelectChange('accentColor', value)}
              >
                <SelectTrigger className="border-gray-200 dark:border-gray-700 bg-textured">
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  {availableColors.map(color => (
                    <SelectItem key={color} value={color} className="flex items-center">
                      <div className={`w-4 h-4 rounded-full bg-${color}-500 mr-2`} />
                      <span className="capitalize">{color}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="layoutType" className="text-gray-900 dark:text-gray-100">
              Layout Type
            </Label>
            <Select
              value={newApplet.layoutType}
              onValueChange={(value) => handleSelectChange('layoutType', value)}
            >
              <SelectTrigger className="border-gray-200 dark:border-gray-700 bg-textured">
                <SelectValue placeholder="Select a layout" />
              </SelectTrigger>
              <SelectContent>
                {layoutTypes.map(layout => (
                  <SelectItem key={layout.value} value={layout.value}>
                    {layout.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="creator" className="text-gray-900 dark:text-gray-100">
              Creator
            </Label>
            <Input
              id="creator"
              name="creator"
              value={newApplet.creator || ''}
              onChange={handleInputChange}
              placeholder="Enter creator name"
              className="border-gray-200 dark:border-gray-700 bg-textured"
            />
          </div>
          
          <div className="space-y-2">
            <Label className="text-gray-900 dark:text-gray-100">
              Applet Image
            </Label>
            <ImageAssetUploader
              preset="web"
              currentUrl={newApplet.imageUrl || null}
              onComplete={(result) =>
                setNewApplet((prev) => ({ ...prev, imageUrl: result?.primary_url ?? '' }))
              }
              folder={`${CloudFolders.AGENT_APPS}/icons`}
              label="Image"
            />
          </div>
        </div>
      </div>
      
      {/* Group Containers Section */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Containers</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Add and manage group containers for this applet
            </p>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={promptRefreshAllGroups}
              disabled={!selectedApplet?.id || !(newApplet.containers?.length)}
              className="text-blue-500 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20"
            >
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh All
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={openGroupSelector}
              className="text-emerald-500 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Groups
            </Button>
          </div>
        </div>
        
        {(!newApplet.containers || newApplet.containers.length === 0) ? (
          <div className="p-8 bg-gray-50 dark:bg-gray-800 rounded-lg border-border text-center">
            <LayoutIcon className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-600" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No containers</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Add groups as containers to your applet
            </p>
            <div className="mt-4">
              <Button
                onClick={openGroupSelector}
                size="sm"
                className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Groups
              </Button>
            </div>
          </div>
        ) : (
          <Accordion type="multiple" defaultValue={[]} className="w-full">
            {newApplet.containers.map((container: AppletContainer) => (
              <AccordionItem key={container.id} value={container.id} className="border-border rounded-md mb-2 px-2">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center">
                      <span className="text-gray-900 dark:text-gray-100">{container.label}</span>
                      {container.shortLabel && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({container.shortLabel})</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          promptRefreshGroup(container.id);
                        }}
                        className="h-8 px-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                      >
                        <RefreshCwIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
                    <div className="mb-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">ID:</span>
                      <span className="ml-2 text-gray-500 dark:text-gray-400">{container.id}</span>
                    </div>
                    {container.description && (
                      <div className="mb-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">Description:</span>
                        <p className="mt-1 text-gray-500 dark:text-gray-400">{container.description}</p>
                      </div>
                    )}
                    <div className="mb-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">Fields:</span>
                      <span className="ml-2 text-gray-500 dark:text-gray-400">{container.fields.length}</span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
      
      {/* Recipe Section */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="space-y-2">
          <Label className="text-gray-900 dark:text-gray-100">
            Compiled Recipe
          </Label>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setShowRecipeDialog(true)}
              className="flex-1 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
            >
              <CodeIcon className="h-4 w-4 mr-2" />
              {compiledRecipeId ? 'Change Recipe' : 'Select Recipe'}
            </Button>
          </div>
          {compiledRecipeId && selectedRecipe && (
            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 border-border rounded-md">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedRecipe.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Version: {selectedRecipe.version}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                ID: {compiledRecipeId}
              </p>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex justify-end space-x-4 pt-4">
        <Button
          variant="outline"
          onClick={resetForm}
          className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
        >
          Reset
        </Button>
        
        <Button
          onClick={selectedApplet ? updateApplet : saveApplet}
          disabled={isLoading}
          className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
        >
          {isLoading ? (
            'Processing...'
          ) : selectedApplet ? (
            <><CheckIcon className="h-4 w-4 mr-2" /> Update Applet</>
          ) : (
            <><SaveIcon className="h-4 w-4 mr-2" /> Save Applet</>
          )}
        </Button>
      </div>
      
      {/* Refresh Warning Dialog */}
      <AlertDialog open={showRefreshWarning} onOpenChange={setShowRefreshWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh {refreshingAll ? 'All Groups' : 'Group'}</AlertDialogTitle>
            <AlertDialogDescription>
              {refreshingAll
                ? "This will refresh all group containers with the latest configurations from the database. Any customizations you've made to these containers will be overridden."
                : "This will refresh this group container with the latest configuration from the database. Any customizations you've made to this container will be overridden."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRefresh} className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white">
              Refresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CreateAppletTab; 