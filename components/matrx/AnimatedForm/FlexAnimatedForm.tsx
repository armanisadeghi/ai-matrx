"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/styles/themes/utils";
import AnimatedInput from "./AnimatedInput";
import AnimatedTextarea from "./AnimatedTextarea";
import AnimatedSelect from "./AnimatedSelect";
import AnimatedCheckbox from "./AnimatedCheckbox";
import AnimatedRadioGroup from "./AnimatedRadioGroup";
import AnimatedButton from "./AnimatedButton";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { FullEditableJsonViewer } from "@/components/ui/JsonComponents";
import { FileUpload } from "@/components/ui/file-upload/file-upload";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ColorPicker from "@/components/ui/color-picker";
import ImageDisplay from "@/components/ui/image-display";
import StarRating from "@/components/ui/star-rating";

export type FormFieldType =
  | "text"
  | "email"
  | "number"
  | "select"
  | "textarea"
  | "checkbox"
  | "radio"
  | "password"
  | "date"
  | "time"
  | "datetime-local"
  | "month"
  | "week"
  | "tel"
  | "url"
  | "color"
  | "slider"
  | "switch"
  | "json"
  | "file"
  | "image"
  | "rating";

export type FieldDataOptionsType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "json"
  | "uuid"
  | "email"
  | "url"
  | "datetime"
  | "null"
  | "undefined"
  | "any"
  | "function"
  | "symbol"
  | "union"
  | "bigint"
  | "date"
  | "map"
  | "set"
  | "tuple"
  | "enum"
  | "intersection"
  | "literal"
  | "void"
  | "never";

export interface FlexFormField {
  name: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  section?: string;
  min?: number;
  max?: number;
  step?: number;

  // Unused or unnecessary props
  src?: string; // Just Value
  alt?: string; // Either can't know or settings or just the value
  jsonSchema?: object; // Not sure the intent, but based on usage, it's likely something from the schema selectors
  multiple?: boolean; // I think this is an attempt at handling isArray
  options?: string[]; // I think this is an attempt at handling enums
  accept?: string; // I think this is an attempt at handling file types
}

export interface FormState {
  [key: string]: any;
}

export type FormDensity = "normal" | "compact" | "comfortable";
export type AnimationPreset =
  "none" | "subtle" | "smooth" | "energetic" | "playful" | "feedback" | "error";

export interface FlexAnimatedFormProps {
  fields: FlexFormField[];
  formState: FormState;
  onUpdateField: (name: string, value: any) => void;
  onSubmit?: () => void;
  onSubmitUpdate?: (data: FormState) => void;
  onSubmitCreate?: (data: FormState) => void;
  onSubmitDelete?: () => void;
  currentStep?: number;
  onNextStep?: () => void;
  onPrevStep?: () => void;
  isSinglePage?: boolean;
  className?: string;
  isFullPage?: boolean;
  columns?:
    | number
    | "auto"
    | { xs: number; sm: number; md: number; lg: number; xl: number };
  layout?:
    | "grid"
    | "sections"
    | "accordion"
    | "tabs"
    | "masonry"
    | "carousel"
    | "timeline";
  enableSearch?: boolean;
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  density?: FormDensity;
  animationPreset?: AnimationPreset;
}

const FlexAnimatedForm: React.FC<FlexAnimatedFormProps> = ({
  fields,
  formState,
  onUpdateField,
  onSubmit,
  onSubmitUpdate,
  onSubmitCreate,
  onSubmitDelete,
  currentStep: externalCurrentStep,
  onNextStep: externalOnNextStep,
  onPrevStep: externalOnPrevStep,
  isSinglePage = false,
  className,
  isFullPage = false,
  columns = 1,
  layout = "grid",
  enableSearch = false,
  direction = "row",
  ...props
}) => {
  const [internalCurrentStep, setInternalCurrentStep] = useState(0);
  const currentStep =
    externalCurrentStep !== undefined
      ? externalCurrentStep
      : internalCurrentStep;
  const formRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [carouselActiveIndex, setCarouselActiveIndex] = useState(0);

  const internalOnNextStep = () => {
    setInternalCurrentStep((prevStep) =>
      Math.min(prevStep + 1, fields.length - 1),
    );
  };

  const internalOnPrevStep = () => {
    setInternalCurrentStep((prevStep) => Math.max(prevStep - 1, 0));
  };

  const onNextStep = externalOnNextStep || internalOnNextStep;
  const onPrevStep = externalOnPrevStep || internalOnPrevStep;

  const filteredFields = enableSearch
    ? fields.filter(
        (field) =>
          field.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          field.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : fields;

  const renderField = (field: FlexFormField) => {
    const commonProps = {
      field,
      value: formState[field.name] || "",
      onChange: (value: any) => onUpdateField(field.name, value),
    };

    switch (field.type) {
      case "text":
      case "email":
      case "number":
      case "password":
      case "tel":
      case "url":
        return <AnimatedInput {...commonProps} />;
      case "textarea":
        return <AnimatedTextarea {...commonProps} />;
      case "select":
        return <AnimatedSelect {...commonProps} />;
      case "checkbox":
        return (
          <AnimatedCheckbox
            field={field}
            checked={formState[field.name] || false}
            onChange={(checked) => onUpdateField(field.name, checked)}
          />
        );
      case "radio":
        return <AnimatedRadioGroup layout="vertical" {...commonProps} />;
      case "slider":
        return (
          <Slider
            min={field.min}
            max={field.max}
            step={field.step}
            value={[formState[field.name] || field.min]}
            onValueChange={(value) => onUpdateField(field.name, value[0])}
          />
        );
      case "switch":
        return (
          <Switch
            checked={formState[field.name] || false}
            onCheckedChange={(checked) => onUpdateField(field.name, checked)}
          />
        );
      case "date":
        return (
          <DatePicker
            value={formState[field.name]}
            onChange={(date) => onUpdateField(field.name, date)}
            placeholder={field.placeholder || "Select a date"}
            formatString={"MM/dd/yyyy"}
          />
        );
      case "time":
        return (
          <TimePicker
            value={formState[field.name]}
            onChange={(time) => onUpdateField(field.name, time)}
          />
        );
      case "color":
        return (
          <ColorPicker
            color={formState[field.name]}
            onChange={(color) => onUpdateField(field.name, color)}
          />
        );
      case "json":
        return (
          <FullEditableJsonViewer
            title={field.label}
            data={formState[field.name]}
            onChange={(json) => onUpdateField(field.name, json)}
            initialExpanded={true}
            maxHeight={"500px"}
            validateDelay={300}
            lockKeys={false}
            defaultEnhancedMode={true}
          />
        );
      case "file":
        return (
          <FileUpload onChange={(files) => onUpdateField(field.name, files)} />
        );
      case "image":
        return (
          <ImageDisplay
            src={field.src || formState[field.name]}
            alt={field.alt || field.label}
          />
        );
      case "rating":
        return (
          <StarRating
            rating={formState[field.name] || 0}
            onChange={(rating) => onUpdateField(field.name, rating)}
            color={"amber"}
            size={"md"}
            disabled={field.disabled || false}
            viewOnly={false}
          />
        );
      default:
        return null;
    }
  };

  const getGridColumns = () => {
    if (typeof columns === "object") {
      return `grid-cols-${columns.xs} sm:grid-cols-${columns.sm} md:grid-cols-${columns.md} lg:grid-cols-${columns.lg} xl:grid-cols-${columns.xl}`;
    }
    if (columns === "auto") {
      return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
    }
    switch (columns) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-1 sm:grid-cols-2";
      case 3:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
      case 5:
        return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
      case 6:
        return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
      default:
        return "grid-cols-1";
    }
  };

  const getFlexDirection = () => {
    switch (direction) {
      case "row":
        return "flex-row";
      case "row-reverse":
        return "flex-row-reverse";
      case "column":
        return "flex-col";
      case "column-reverse":
        return "flex-col-reverse";
      default:
        return "flex-row";
    }
  };

  const renderGridLayout = () => (
    <div className={cn("grid gap-6", getGridColumns(), getFlexDirection())}>
      <AnimatePresence>
        {filteredFields.map((field, index) => (
          <motion.div
            key={field.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
          >
            {renderField(field)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  const renderSectionsLayout = () => {
    const sections = [
      ...new Set(filteredFields.map((field) => field.section || "Default")),
    ];
    return (
      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section} className="border-b pb-6">
            <h3 className="text-lg font-semibold mb-4">{section}</h3>
            <div className={cn("grid gap-6", getGridColumns())}>
              {filteredFields
                .filter((field) => (field.section || "Default") === section)
                .map((field) => renderField(field))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderAccordionLayout = () => {
    const sections = [
      ...new Set(filteredFields.map((field) => field.section || "Default")),
    ];
    return (
      <Accordion type="single" collapsible className="w-full">
        {sections.map((section) => (
          <AccordionItem key={section} value={section}>
            <AccordionTrigger>{section}</AccordionTrigger>
            <AccordionContent>
              <div className={cn("grid gap-6", getGridColumns())}>
                {filteredFields
                  .filter((field) => (field.section || "Default") === section)
                  .map((field) => renderField(field))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  };

  const renderTabsLayout = () => {
    const sections = [
      ...new Set(filteredFields.map((field) => field.section || "Default")),
    ];
    return (
      <Tabs defaultValue={sections[0]} className="w-full">
        <TabsList>
          {sections.map((section) => (
            <TabsTrigger key={section} value={section}>
              {section}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((section) => (
          <TabsContent key={section} value={section}>
            <div className={cn("grid gap-6", getGridColumns())}>
              {filteredFields
                .filter((field) => (field.section || "Default") === section)
                .map((field) => renderField(field))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    );
  };

  const renderMasonryLayout = () => (
    <div
      className={cn(
        "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6",
        getFlexDirection(),
      )}
    >
      {filteredFields.map((field, index) => (
        <div key={field.name} className="mb-6 break-inside-avoid">
          {renderField(field)}
        </div>
      ))}
    </div>
  );

  const renderCarouselLayout = () => {
    return (
      <div className="relative overflow-hidden">
        <div
          className={cn(
            "flex transition-transform duration-300 ease-in-out",
            getFlexDirection(),
          )}
          style={{ transform: `translateX(-${carouselActiveIndex * 100}%)` }}
        >
          {filteredFields.map((field, index) => (
            <div key={field.name} className="w-full flex-shrink-0">
              {renderField(field)}
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setCarouselActiveIndex((prev) => Math.max(prev - 1, 0))
          }
          className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-full"
        >
          &lt;
        </button>
        <button
          onClick={() =>
            setCarouselActiveIndex((prev) =>
              Math.min(prev + 1, filteredFields.length - 1),
            )
          }
          className="absolute right-0 top-1/2 transform -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-full"
        >
          &gt;
        </button>
      </div>
    );
  };

  const renderTimelineLayout = () => (
    <div className={cn("relative", getFlexDirection())}>
      {filteredFields.map((field, index) => (
        <div key={field.name} className="mb-8 flex">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
            {index + 1}
          </div>
          <div className="ml-4 flex-grow">{renderField(field)}</div>
        </div>
      ))}
    </div>
  );

  const renderLayout = () => {
    switch (layout) {
      case "sections":
        return renderSectionsLayout();
      case "accordion":
        return renderAccordionLayout();
      case "tabs":
        return renderTabsLayout();
      case "masonry":
        return renderMasonryLayout();
      case "carousel":
        return renderCarouselLayout();
      case "timeline":
        return renderTimelineLayout();
      case "grid":
      default:
        return renderGridLayout();
    }
  };

  return (
    <motion.div
      ref={formRef}
      className={cn(
        "bg-card rounded-lg",
        isFullPage ? "w-full h-full" : "max-w-md mx-auto mt-4 shadow-xl",
        "p-4",
        className,
      )}
      initial={{ opacity: 0, scale: isFullPage ? 0.98 : 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      {...props}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
        className="space-y-6 h-full"
      >
        {enableSearch && (
          <Input
            type="text"
            placeholder="Search fields..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mb-4"
          />
        )}

        <div
          className={cn(
            isFullPage ? "h-[calc(100%-4rem)] overflow-y-auto" : "",
          )}
        >
          {isSinglePage ? (
            renderLayout()
          ) : (
            <>
              <motion.h2
                className={cn(
                  "font-bold mb-4 text-foreground",
                  isFullPage ? "text-3xl" : "text-2xl",
                )}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                {fields[currentStep].label}
              </motion.h2>

              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                >
                  {renderField(fields[currentStep])}
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>

        <motion.div
          className="flex justify-between mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {!isSinglePage && (
            <AnimatedButton
              onClick={() => {
                if (currentStep > 0) onPrevStep();
              }}
              disabled={currentStep === 0}
              className="space-y-6 bg-secondary text-secondary-foreground"
            >
              Previous
            </AnimatedButton>
          )}
          {isSinglePage || currentStep === fields.length - 1 ? (
            <AnimatedButton
              type="submit"
              className="bg-primary text-primary-foreground"
            >
              Submit
            </AnimatedButton>
          ) : (
            <AnimatedButton
              onClick={() => {
                if (currentStep < fields.length - 1) onNextStep();
              }}
              className="bg-primary text-primary-foreground"
            >
              Next
            </AnimatedButton>
          )}
        </motion.div>
      </form>

      {!isSinglePage && (
        <motion.div
          className="mt-4 text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          Step {currentStep + 1} of {fields.length}
        </motion.div>
      )}
    </motion.div>
  );
};

export default FlexAnimatedForm;
