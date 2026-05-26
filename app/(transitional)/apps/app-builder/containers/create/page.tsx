"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectActiveContainerId } from "@/lib/redux/app-builder/selectors/containerSelectors";
import { startNewContainer } from "@/lib/redux/app-builder/slices/containerBuilderSlice";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { saveContainerThunk } from "@/lib/redux/app-builder/thunks/containerBuilderThunks";
import {
  setLabel,
  setDescription,
  setHelpText,
  setShortLabel,
  setHideDescription,
  setIsPublic,
} from "@/lib/redux/app-builder/slices/containerBuilderSlice";

// Define form schema
const containerFormSchema = z.object({
  label: z.string().min(2, {
    message: "Container name must be at least 2 characters.",
  }),
  shortLabel: z.string().optional(),
  description: z.string().optional(),
  hideDescription: z.boolean().default(false),
  helpText: z.string().optional(),
  isPublic: z.boolean().default(true),
});

type ContainerFormValues = z.input<typeof containerFormSchema>;

export default function ContainerCreatePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { toast } = useToast();

  // Get the active container ID from Redux
  const activeContainerId = useAppSelector(selectActiveContainerId);

  // Initialize container creation if there's no active container
  useEffect(() => {
    if (!activeContainerId) {
      // Generate a new UUID for the container
      const newId = uuidv4();

      // Start container creation in Redux
      dispatch(startNewContainer({ id: newId }));
    }
  }, [activeContainerId, dispatch]);

  // Initialize form
  const form = useForm<ContainerFormValues>({
    resolver: zodResolver(containerFormSchema),
    defaultValues: {
      label: "",
      shortLabel: "",
      description: "",
      hideDescription: false,
      helpText: "",
      isPublic: true,
    },
  });

  // Handle form submit
  const onSubmit = async (values: ContainerFormValues) => {
    if (!activeContainerId) return;

    try {
      // Update container fields in Redux
      dispatch(setLabel({ id: activeContainerId, label: values.label }));
      dispatch(
        setShortLabel({ id: activeContainerId, shortLabel: values.shortLabel }),
      );
      dispatch(
        setDescription({
          id: activeContainerId,
          description: values.description,
        }),
      );
      dispatch(
        setHideDescription({
          id: activeContainerId,
          hideDescription: values.hideDescription,
        }),
      );
      dispatch(
        setHelpText({ id: activeContainerId, helpText: values.helpText }),
      );
      dispatch(
        setIsPublic({ id: activeContainerId, isPublic: values.isPublic }),
      );

      // Save container
      const savedContainer = await dispatch(
        saveContainerThunk(activeContainerId),
      ).unwrap();

      toast({
        title: "Success",
        description: "Container created successfully",
      });

      // Navigate to container view
      router.push(`/apps/app-builder/containers/${savedContainer.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create container",
        variant: "destructive",
      });
    }
  };

  // Handle cancel button
  const handleCancel = () => {
    router.push("/apps/app-builder/containers");
  };

  // If no active container ID yet, show loading
  if (!activeContainerId) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Container Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter container name" {...field} />
                  </FormControl>
                  <FormDescription>
                    This will be the main identifier for your container.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shortLabel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Short Label (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Short name" {...field} />
                  </FormControl>
                  <FormDescription>
                    A shorter name used in limited space contexts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter a description for this container"
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe the purpose of this container.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hideDescription"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Hide Description</FormLabel>
                    <FormDescription>
                      If checked, the description will not be shown to users.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="helpText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Help Text (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Instructions or help text for users"
                      {...field}
                      rows={2}
                    />
                  </FormControl>
                  <FormDescription>
                    Provide additional guidance for users of this container.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isPublic"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Public Container</FormLabel>
                    <FormDescription>
                      If checked, this container will be available for use in
                      multiple apps.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end space-x-4 pt-4">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit">Create Container</Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
