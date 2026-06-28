"use client";

import React, { useState, useEffect, useMemo } from "react";
import { BoxIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecipeInfo } from "@/features/recipes/types";
import { listAppletSourceAgents } from "@/features/applet/services/appletAgentSource";

import {
  isAppletSlugAvailable,
  getAllCustomAppletConfigs,
  getCustomAppletConfigById,
  createCustomAppletConfig,
  updateCustomAppletConfig,
  deleteCustomAppletConfig,
  addContainersToApplet,
  recompileContainerInAppletById,
  recompileAllContainersInApplet,
} from "@/lib/redux/app-builder/service/customAppletService";
import { getAllComponentGroups } from "@/lib/redux/app-builder/service/fieldContainerService";
import { ICON_OPTIONS } from "@/features/applet/styles/StyledComponents";
import {
  CustomAppletConfig,
  ComponentGroup,
  AppletSourceConfig,
} from "@/types/customAppTypes";

// Import our modular components
import CreateAppletTab from "./CreateAppletTab";
import SavedAppletsTab from "./SavedAppletsTab";
import IconPickerDialog from "./IconPickerDialog";
import RecipeSelectDialog from "../recipe-source/RecipeSelectDialog";
import GroupSelector from "./GroupSelector";

export const AppletBuilder = () => {
  const { toast } = useToast();
  const [newApplet, setNewApplet] = useState<Partial<CustomAppletConfig>>({
    name: "",
    description: "",
    slug: "",
    appletIcon: "SiCodemagic",
    appletSubmitText: "Submit",
    creator: "",
    primaryColor: "emerald",
    accentColor: "blue",
    layoutType: "flat",
    imageUrl: "",
    containers: [],
  });
  const [savedApplets, setSavedApplets] = useState<CustomAppletConfig[]>([]);
  const [activeTab, setActiveTab] = useState<string>("create");
  const [selectedApplet, setSelectedApplet] =
    useState<CustomAppletConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Icon selection
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconPickerType, setIconPickerType] = useState<"main" | "submit">(
    "main",
  );

  // Group management
  const [showAddGroupsDialog, setShowAddGroupsDialog] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<ComponentGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  // Recipe selection state
  const [showRecipeDialog, setShowRecipeDialog] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeInfo | null>(null);
  const [compiledRecipeId, setCompiledRecipeId] = useState<string | null>(null);
  const [compiledRecipeWithNeededBrokers, setCompiledRecipeWithNeededBrokers] =
    useState<AppletSourceConfig | null>(null);
  const [userRecipes, setUserRecipes] = useState<RecipeInfo[]>([]);

  // List of available colors
  const availableColors = useMemo(
    () => [
      "rose",
      "blue",
      "green",
      "purple",
      "yellow",
      "red",
      "orange",
      "pink",
      "slate",
      "zinc",
      "neutral",
      "stone",
      "amber",
      "lime",
      "emerald",
      "teal",
      "cyan",
      "sky",
      "violet",
      "fuchsia",
    ],
    [],
  );

  // List of available layout types
  const layoutTypes = useMemo(
    () => [
      { value: "flat", label: "Flat" },
      { value: "tabs", label: "Tabs" },
      { value: "wizard", label: "Wizard" },
      { value: "accordion", label: "Accordion" },
    ],
    [],
  );

  // Load saved applets from the API on component mount
  useEffect(() => {
    // Fetch saved applets
    fetchSavedApplets();

    // Load available groups
    fetchAvailableGroups();

    // Fetch user recipes
    fetchUserRecipes();
  }, []);

  // Fetch saved applets from the database
  const fetchSavedApplets = async () => {
    setIsLoading(true);
    try {
      const applets = await getAllCustomAppletConfigs();
      console.log("applets", JSON.stringify(applets, null, 2));
      setSavedApplets(applets);
    } catch (error) {
      console.error("Failed to load applets:", error);
      toast({
        title: "Error",
        description: "Failed to load applets",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch available groups from the database
  const fetchAvailableGroups = async () => {
    try {
      const groups = await getAllComponentGroups();
      setAvailableGroups(groups);
    } catch (error) {
      console.error("Failed to load groups:", error);
      toast({
        title: "Error",
        description: "Failed to load field groups",
        variant: "destructive",
      });
    }
  };

  // Fetch user recipes
  const fetchUserRecipes = async () => {
    try {
      const recipes = await listAppletSourceAgents();
      setUserRecipes(recipes);
    } catch (error) {
      console.error("Failed to load recipes:", error);
      toast({
        title: "Error",
        description: "Failed to load recipes",
        variant: "destructive",
      });
    }
  };

  // Helper function to render the correct icon component
  const renderIcon = (iconName: string | undefined) => {
    if (!iconName) return <BoxIcon className="h-5 w-5" />;

    const IconComponent = ICON_OPTIONS[iconName];
    if (!IconComponent) return <BoxIcon className="h-5 w-5" />;

    return <IconComponent className="h-5 w-5" />;
  };

  const handleIconSelect = (iconName: string) => {
    if (iconPickerType === "main") {
      setNewApplet((prev) => ({
        ...prev,
        appletIcon: iconName,
      }));
    } else {
      setNewApplet((prev) => ({
        ...prev,
        appletSubmitIcon: iconName,
      }));
    }
    setShowIconPicker(false);
  };

  const openIconPicker = (type: "main" | "submit") => {
    setIconPickerType(type);
    setShowIconPicker(true);
  };

  const resetForm = () => {
    setNewApplet({
      name: "",
      description: "",
      slug: "",
      appletIcon: "SiCodemagic",
      appletSubmitText: "Submit",
      creator: "",
      primaryColor: "emerald",
      accentColor: "blue",
      layoutType: "flat",
      imageUrl: "",
      compiledRecipeId: null,
      containers: [],
    });
    setSelectedApplet(null);
    setSelectedGroups([]);
    setCompiledRecipeId(null);
    setSelectedRecipe(null);
  };

  const saveApplet = async () => {
    if (!newApplet.name || !newApplet.slug) {
      toast({
        title: "Validation Error",
        description: "Applet name and slug are required",
        variant: "destructive",
      });
      return;
    }

    // Check slug uniqueness before saving
    setIsLoading(true);
    try {
      const isAvailable = await isAppletSlugAvailable(newApplet.slug);

      if (!isAvailable) {
        toast({
          title: "Slug Error",
          description: `The slug "${newApplet.slug}" is already in use. Please choose a different one.`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const createdApplet = await createCustomAppletConfig(
        newApplet as CustomAppletConfig,
      );
      setSavedApplets((prev) => [...prev, createdApplet]);

      toast({
        title: "Applet Saved",
        description: `Applet "${newApplet.name}" has been saved successfully.`,
      });

      resetForm();
    } catch (error) {
      console.error("Error saving applet:", error);
      toast({
        title: "Error",
        description: "Failed to save applet",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const editApplet = (applet: CustomAppletConfig) => {
    setSelectedApplet(applet);
    setNewApplet(applet);

    // Load the recipe information if available
    if (applet.compiledRecipeId) {
      setCompiledRecipeId(applet.compiledRecipeId);
      // Note: Ideally we'd look up the recipe details as well, but we'll leave that as a TO-DO
    }

    setActiveTab("create");
  };

  const updateApplet = async () => {
    if (!selectedApplet?.id) return;

    // Check slug uniqueness if it was changed
    setIsLoading(true);
    try {
      if (selectedApplet.slug !== newApplet.slug) {
        const isAvailable = await isAppletSlugAvailable(
          newApplet.slug,
          selectedApplet.id,
        );

        if (!isAvailable) {
          toast({
            title: "Slug Error",
            description: `The slug "${newApplet.slug}" is already in use. Please choose a different one.`,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      }

      const updatedApplet = await updateCustomAppletConfig(
        selectedApplet.id,
        newApplet as CustomAppletConfig,
      );
      setSavedApplets((prev) =>
        prev.map((applet) =>
          applet.id === selectedApplet.id ? updatedApplet : applet,
        ),
      );

      toast({
        title: "Applet Updated",
        description: `Applet "${newApplet.name}" has been updated successfully.`,
      });
      resetForm();
    } catch (error) {
      console.error("Error updating applet:", error);
      toast({
        title: "Error",
        description: "Failed to update applet",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteApplet = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteCustomAppletConfig(id);
      setSavedApplets((prev) => prev.filter((applet) => applet.id !== id));
      toast({
        title: "Applet Deleted",
        description: "Applet has been deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting applet:", error);
      toast({
        title: "Error",
        description: "Failed to delete applet",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Group management functions
  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  // Add selected groups to applet
  const addSelectedGroupsToApplet = async () => {
    if (selectedGroups.length === 0 || !selectedApplet?.id) {
      setShowAddGroupsDialog(false);
      return;
    }

    setIsLoading(true);
    try {
      // Add the groups as containers to the applet using the RPC function
      console.log("selectedGroups", selectedGroups);
      const success = await addContainersToApplet(
        selectedApplet.id,
        selectedGroups,
      );
      console.log("success", success);

      if (success) {
        // Refresh the applet data to get the updated containers
        const updatedApplet = await getCustomAppletConfigById(
          selectedApplet.id,
        );

        if (updatedApplet) {
          // Update the local state
          setNewApplet(updatedApplet);
          setSavedApplets((prev) =>
            prev.map((applet) =>
              applet.id === selectedApplet.id ? updatedApplet : applet,
            ),
          );

          toast({
            title: "Groups Added",
            description: `${selectedGroups.length} groups have been added to the applet.`,
          });
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to add groups to applet.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error adding groups to applet:", error);
      toast({
        title: "Error",
        description: "Failed to add groups to applet.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setSelectedGroups([]);
      setShowAddGroupsDialog(false);
    }
  };

  // Open the group selector dialog
  const openGroupSelector = () => {
    if (!selectedApplet?.id) {
      toast({
        title: "Applet Not Saved",
        description: "Please save the applet before adding groups.",
        variant: "destructive",
      });
      return;
    }

    setSelectedGroups([]);
    setShowAddGroupsDialog(true);
  };

  // Refresh a single group container
  const refreshGroup = async (groupId: string) => {
    if (!selectedApplet?.id) return;

    setIsLoading(true);
    try {
      const success = await recompileContainerInAppletById(
        selectedApplet.id,
        groupId,
      );

      if (success) {
        // Refresh the applet data to get the updated container
        const updatedApplet = await getCustomAppletConfigById(
          selectedApplet.id,
        );

        if (updatedApplet) {
          // Update the local state
          setNewApplet(updatedApplet);
          setSavedApplets((prev) =>
            prev.map((applet) =>
              applet.id === selectedApplet.id ? updatedApplet : applet,
            ),
          );

          toast({
            title: "Group Refreshed",
            description:
              "Group container has been refreshed with the latest configuration.",
          });
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to refresh group container.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error refreshing group container:", error);
      toast({
        title: "Error",
        description: "Failed to refresh group container.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh all group containers
  const refreshAllGroups = async () => {
    if (!selectedApplet?.id) return;

    setIsLoading(true);
    try {
      const success = await recompileAllContainersInApplet(selectedApplet.id);

      if (success) {
        // Refresh the applet data to get the updated containers
        const updatedApplet = await getCustomAppletConfigById(
          selectedApplet.id,
        );

        if (updatedApplet) {
          // Update the local state
          setNewApplet(updatedApplet);
          setSavedApplets((prev) =>
            prev.map((applet) =>
              applet.id === selectedApplet.id ? updatedApplet : applet,
            ),
          );

          toast({
            title: "All Groups Refreshed",
            description:
              "All group containers have been refreshed with the latest configurations.",
          });
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to refresh group containers.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error refreshing group containers:", error);
      toast({
        title: "Error",
        description: "Failed to refresh group containers.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <Card className="border-border bg-textured shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-emerald-500 dark:text-emerald-400">
            Applet Builder
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Create and manage applets for your applications
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <TabsTrigger
                value="create"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400"
              >
                Create Applet
              </TabsTrigger>
              <TabsTrigger
                value="saved"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-emerald-600 dark:data-[state=active]:text-emerald-400"
              >
                Saved Applets ({savedApplets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-6">
              <CreateAppletTab
                newApplet={newApplet}
                setNewApplet={setNewApplet}
                selectedApplet={selectedApplet}
                isLoading={isLoading}
                compiledRecipeId={compiledRecipeId}
                selectedRecipe={selectedRecipe}
                availableColors={availableColors}
                layoutTypes={layoutTypes}
                resetForm={resetForm}
                saveApplet={saveApplet}
                updateApplet={updateApplet}
                openIconPicker={openIconPicker}
                setShowRecipeDialog={setShowRecipeDialog}
                openGroupSelector={openGroupSelector}
                refreshGroup={refreshGroup}
                refreshAllGroups={refreshAllGroups}
                renderIcon={renderIcon}
              />
            </TabsContent>

            <TabsContent value="saved" className="mt-6">
              <SavedAppletsTab
                savedApplets={savedApplets}
                isLoading={isLoading}
                setActiveTab={setActiveTab}
                editApplet={editApplet}
                deleteApplet={deleteApplet}
                renderIcon={renderIcon}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <IconPickerDialog
        showIconPicker={showIconPicker}
        setShowIconPicker={setShowIconPicker}
        handleIconSelect={handleIconSelect}
      />

      <RecipeSelectDialog
        showRecipeDialog={showRecipeDialog}
        setShowRecipeDialog={setShowRecipeDialog}
        initialSelectedRecipe={selectedRecipe?.id || null}
        setCompiledRecipeId={setCompiledRecipeId}
        setNewApplet={setNewApplet}
        setRecipeSourceConfig={setCompiledRecipeWithNeededBrokers}
        onRecipeSelected={(recipeId) => {
          // First find the recipe in userRecipes if available
          const foundRecipe = userRecipes.find((r) => r.id === recipeId);
          setSelectedRecipe(foundRecipe || ({ id: recipeId } as RecipeInfo));
        }}
      />

      <GroupSelector
        showAddGroupsDialog={showAddGroupsDialog}
        setShowAddGroupsDialog={setShowAddGroupsDialog}
        availableGroups={availableGroups}
        selectedGroups={selectedGroups}
        toggleGroupSelection={toggleGroupSelection}
        addSelectedGroupsToApplet={addSelectedGroupsToApplet}
      />
    </div>
  );
};

export default AppletBuilder;
