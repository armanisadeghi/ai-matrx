"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectFieldById,
  selectFieldLoading,
} from "@/lib/redux/app-builder/selectors/fieldSelectors";
import { setActiveField } from "@/lib/redux/app-builder/slices/fieldBuilderSlice";
import { fetchFieldByIdThunk } from "@/lib/redux/app-builder/thunks/fieldBuilderThunks";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  CheckSquare,
  Code,
  Edit,
  FileUp,
  HelpCircle,
  Info,
  ListFilter,
  Settings,
  Sliders,
  TextCursorInput,
  ToggleLeft,
  Hash,
  ChevronLeft,
  PanelBottomClose,
  RadioTower,
  GripVertical,
  SquareStack,
} from "lucide-react";
import { ICON_OPTIONS } from "@/features/applet/styles/StyledComponents";
import { Separator } from "@/components/ui/separator";

// Helper function to format component type names
const getComponentTypeName = (componentType: string) => {
  const typeMap: Record<string, string> = {
    input: "Text Input",
    textarea: "Text Area",
    select: "Dropdown",
    multiselect: "Multi-Select",
    radio: "Radio Group",
    checkbox: "Checkbox",
    slider: "Slider",
    number: "Number",
    date: "Date Picker",
    switch: "Switch",
    button: "Button",
    rangeSlider: "Range Slider",
    numberPicker: "Number Picker",
    jsonField: "JSON Field",
    fileUpload: "File Upload",
  };

  return typeMap[componentType] || componentType;
};

// Helper function to get component icon
const getComponentIcon = (componentType: string, className = "h-5 w-5") => {
  const iconMap: Record<string, React.ReactNode> = {
    input: <TextCursorInput className={className} />,
    textarea: <PanelBottomClose className={className} />,
    select: <ListFilter className={className} />,
    multiselect: <GripVertical className={className} />,
    radio: <RadioTower className={className} />,
    checkbox: <CheckSquare className={className} />,
    slider: <Sliders className={className} />,
    number: <Hash className={className} />,
    date: <Calendar className={className} />,
    switch: <ToggleLeft className={className} />,
    button: <SquareStack className={className} />,
    rangeSlider: <Sliders className={className} />,
    numberPicker: <Hash className={className} />,
    jsonField: <Code className={className} />,
    fileUpload: <FileUp className={className} />,
  };

  return iconMap[componentType] || <TextCursorInput className={className} />;
};

export default function FieldDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();

  // Get field data from Redux
  const field = useAppSelector((state) => selectFieldById(state, id));
  const isLoading = useAppSelector(selectFieldLoading);

  // Load field data when the component mounts
  useEffect(() => {
    const loadField = async () => {
      try {
        if (!field) {
          await dispatch(fetchFieldByIdThunk(id)).unwrap();
        }
        dispatch(setActiveField(id));
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load field component",
          variant: "destructive",
        });
        router.push("/apps/app-builder/fields");
      }
    };

    loadField();

    // Cleanup: clear active field when unmounting
    return () => {
      dispatch(setActiveField(null));
    };
  }, [id, dispatch, field, router, toast]);

  const handleEdit = () => {
    router.push(`/apps/app-builder/fields/${id}/edit`);
  };

  const handleBack = () => {
    router.push("/apps/app-builder/fields");
  };

  // Format JSON for display
  const formatJSON = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return String(data);
    }
  };

  if (isLoading || !field) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Get custom icon if set
  let fieldIcon = null;
  if (field.iconName && ICON_OPTIONS[field.iconName]) {
    const IconComponent = ICON_OPTIONS[field.iconName];
    fieldIcon = <IconComponent className="h-6 w-6" />;
  } else {
    fieldIcon = getComponentIcon(field.component, "h-6 w-6");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="gap-1 text-gray-600 dark:text-gray-300"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Fields
        </Button>

        <Button onClick={handleEdit} className="gap-1">
          <Edit className="h-4 w-4" />
          Edit Field
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-0 shadow-md dark:shadow-primary/10">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                {fieldIcon}
              </div>
              <div>
                <CardTitle className="text-2xl">
                  {field.label || "Unnamed Field"}
                </CardTitle>
                <CardDescription className="text-base mt-1">
                  {getComponentTypeName(field.component)}
                </CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {field.required && (
                <Badge
                  variant="outline"
                  className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                >
                  Required
                </Badge>
              )}
              {field.isPublic ? (
                <Badge
                  variant="outline"
                  className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                >
                  Public
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-gray-50 dark:bg-gray-900/20"
                >
                  Private
                </Badge>
              )}
              {field.isLocal && (
                <Badge
                  variant="outline"
                  className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400"
                >
                  Local
                </Badge>
              )}
            </div>

            {field.description && (
              <div className="mt-4 text-gray-600 dark:text-gray-300">
                {field.description}
              </div>
            )}
          </CardHeader>
          <Separator />

          <Tabs defaultValue="details" className="w-full">
            <div className="px-6 pt-2">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details" className="gap-2">
                  <Info className="h-4 w-4" />
                  Details
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Configuration
                </TabsTrigger>
                <TabsTrigger value="help" className="gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Help
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="details" className="p-0">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                      <Info className="h-4 w-4 text-gray-500" />
                      Basic Information
                    </h3>
                    <dl className="grid grid-cols-[120px_1fr] gap-y-3">
                      <dt className="text-gray-500 dark:text-gray-400">ID:</dt>
                      <dd className="font-mono text-sm">{field.id}</dd>

                      <dt className="text-gray-500 dark:text-gray-400">
                        Component:
                      </dt>
                      <dd className="flex items-center gap-1">
                        {getComponentIcon(
                          field.component,
                          "h-4 w-4 text-primary",
                        )}
                        <span>{getComponentTypeName(field.component)}</span>
                      </dd>

                      <dt className="text-gray-500 dark:text-gray-400">
                        Group:
                      </dt>
                      <dd>{field.group || "None"}</dd>

                      <dt className="text-gray-500 dark:text-gray-400">
                        Status:
                      </dt>
                      <dd>
                        {field.isDirty ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                          >
                            Unsaved Changes
                          </Badge>
                        ) : field.isLocal ? (
                          <Badge
                            variant="outline"
                            className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400"
                          >
                            Local Only
                          </Badge>
                        ) : field.isPublic ? (
                          <Badge
                            variant="outline"
                            className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                          >
                            Public
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-gray-50 dark:bg-gray-900/20"
                          >
                            Private
                          </Badge>
                        )}
                      </dd>
                    </dl>
                  </div>

                  <div>
                    <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                      <Settings className="h-4 w-4 text-gray-500" />
                      Field Properties
                    </h3>
                    <dl className="grid grid-cols-[120px_1fr] gap-y-3">
                      <dt className="text-gray-500 dark:text-gray-400">
                        Required:
                      </dt>
                      <dd>{field.required ? "Yes" : "No"}</dd>

                      <dt className="text-gray-500 dark:text-gray-400">
                        Placeholder:
                      </dt>
                      <dd>{field.placeholder || "None"}</dd>

                      <dt className="text-gray-500 dark:text-gray-400">
                        Default Value:
                      </dt>
                      <dd className="break-words">
                        {field.defaultValue !== undefined &&
                        field.defaultValue !== null ? (
                          typeof field.defaultValue === "object" ? (
                            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
                              {formatJSON(field.defaultValue)}
                            </code>
                          ) : (
                            String(field.defaultValue)
                          )
                        ) : (
                          "None"
                        )}
                      </dd>

                      <dt className="text-gray-500 dark:text-gray-400">
                        Include Other:
                      </dt>
                      <dd>{field.includeOther ? "Yes" : "No"}</dd>
                    </dl>
                  </div>
                </div>

                {field.options && field.options.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                      <ListFilter className="h-4 w-4 text-gray-500" />
                      Options ({field.options.length})
                    </h3>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 border-b">
                            <th className="px-4 py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400 w-12">
                              Icon
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                              Label
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">
                              Description
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">
                              Help Text
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 dark:text-gray-500 w-24 hidden lg:table-cell">
                              ID
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {field.options.map((option, index) => (
                            <tr
                              key={index}
                              className={
                                index % 2 === 1
                                  ? "bg-gray-50 dark:bg-gray-900/10"
                                  : ""
                              }
                            >
                              <td className="px-4 py-3 text-sm text-center">
                                {option.iconName ? (
                                  ICON_OPTIONS[option.iconName] ? (
                                    <div className="flex justify-center">
                                      {React.createElement(
                                        ICON_OPTIONS[option.iconName],
                                        {
                                          className:
                                            "h-4 w-4 text-gray-600 dark:text-gray-300",
                                        },
                                      )}
                                    </div>
                                  ) : (
                                    option.iconName
                                  )
                                ) : (
                                  <span className="italic text-gray-400 dark:text-gray-600">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">
                                {option.label}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                {option.description || (
                                  <span className="italic text-gray-400 dark:text-gray-600">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                {option.helpText || (
                                  <span className="italic text-gray-400 dark:text-gray-600">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-gray-400 dark:text-gray-500 text-right truncate hidden lg:table-cell">
                                {option.id}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {field.componentProps &&
                  Object.keys(field.componentProps).length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-md font-semibold mb-4 flex items-center gap-2">
                        <Code className="h-4 w-4 text-gray-500" />
                        Component Properties
                      </h3>
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md overflow-x-auto">
                        <pre className="text-sm font-mono">
                          {formatJSON(field.componentProps)}
                        </pre>
                      </div>
                    </div>
                  )}
              </CardContent>
            </TabsContent>

            <TabsContent value="config" className="p-0">
              <CardContent className="pt-6">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md overflow-x-auto">
                  <pre className="text-sm font-mono">{formatJSON(field)}</pre>
                </div>
              </CardContent>
            </TabsContent>

            <TabsContent value="help" className="p-0">
              <CardContent className="pt-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-4 rounded-md">
                  <div className="flex items-start gap-3">
                    <HelpCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-medium mb-2">Help Information</h4>
                      <p>
                        {field.helpText ||
                          "No help text has been provided for this field component."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-md font-semibold mb-4">
                    Component Usage
                  </h3>
                  <p className="mb-4 text-gray-600 dark:text-gray-300">
                    This field component can be used in any container or layout
                    within your applets.
                  </p>

                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                    <code className="text-sm font-mono">
                      {`// Example usage in a container\n{\n  "type": "field",\n  "fieldId": "${field.id}"\n}`}
                    </code>
                  </div>
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>

          <CardFooter className="flex justify-between border-t border-gray-100 dark:border-gray-800 pt-4">
            <Button variant="outline" onClick={handleBack}>
              Back to Fields
            </Button>
            <Button onClick={handleEdit} className="gap-1">
              <Edit className="h-4 w-4" />
              Edit Field
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
