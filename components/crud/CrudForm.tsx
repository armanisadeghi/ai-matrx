// File: components/crud/CrudForm.tsx

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MatrxSaveButton,
  MatrxCancelButton,
  MatrxEditButton,
  MatrxDeleteButton,
} from "@/components/matrx/buttons/MatrxButtons";
import { ProTextarea } from "@/components/official/ProTextarea";

interface FieldConfig {
  type: "text" | "textarea" | "select";
  label: string;
  options?: { value: string; label: string }[];
}

interface CrudFormProps<T extends z.ZodType<any, any>> {
  schema: T;
  initialData?: z.infer<T>;
  onSubmit: (data: z.infer<T>) => void;
  isEditing: boolean;
  onEdit: (isEditing: boolean) => void; // Updated to accept a boolean
  onDelete: () => void;
  onCancel: () => void;
  fields: Record<string, FieldConfig>;
}

export function CrudForm<T extends z.ZodType<any, any>>({
  schema,
  initialData,
  onSubmit,
  isEditing,
  onEdit,
  onDelete,
  onCancel,
  fields,
}: CrudFormProps<T>) {
  // @ts-ignore - Complex type mismatch between zod schema input/output types and react-hook-form
  const form = useForm<z.infer<T>>({
    resolver: zodResolver(schema) as any,
    defaultValues: initialData || ({} as z.infer<T>),
  });

  const renderField = (name: string, config: FieldConfig) => {
    return (
      <FormField
        key={name}
        control={form.control}
        name={name as any}
        render={({ field }) => (
          <FormItem className="mb-4">
            <FormLabel className="text-foreground">{config.label}</FormLabel>
            <FormControl>
              {config.type === "textarea" ? (
                <ProTextarea
                  {...field}
                  disabled={!isEditing}
                  className="bg-background text-foreground border-input resize-none"
                />
              ) : config.type === "select" ? (
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={!isEditing}
                >
                  <SelectTrigger className="bg-background text-foreground border-input">
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {config.options?.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        className="text-foreground"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  {...field}
                  disabled={!isEditing}
                  className="bg-background text-foreground border-input"
                />
              )}
            </FormControl>
            <FormMessage className="text-destructive" />
          </FormItem>
        )}
      />
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(fields).map(([name, config]) =>
            renderField(name, config),
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {isEditing ? (
            <>
              <MatrxSaveButton type="submit">Save</MatrxSaveButton>
              <MatrxCancelButton onClick={onCancel}>Cancel</MatrxCancelButton>
            </>
          ) : (
            <>
              <MatrxEditButton onClick={() => onEdit(true)}>
                {" "}
                {/* Pass true to enable editing */}
                Edit
              </MatrxEditButton>
              <MatrxDeleteButton onClick={onDelete}>Delete</MatrxDeleteButton>
            </>
          )}
        </div>
      </form>
    </Form>
  );
}
