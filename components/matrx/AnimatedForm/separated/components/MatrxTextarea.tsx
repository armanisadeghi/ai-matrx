// components/MatrxTextarea/MatrxTextarea.tsx
"use client";
import React, { useEffect, useRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Bold,
  Italic,
  List,
  Link,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image,
} from "lucide-react";
import { MatrxTextareaProps } from "@/types/componentConfigTypes";
import {
  getComponentStyles,
  useComponentAnimation,
  textareaSizeConfig,
  densityConfig,
} from "@/config/ui/FlexConfig";

const MatrxTextarea: React.FC<MatrxTextareaProps> = ({
  // Base props (consistent across all components)
  className,
  style,
  id,
  busy = false,
  disabled = false,
  required = false,
  readOnly = false,
  loading = false,
  size = "md",
  density = "normal",
  variant = "default",
  fullWidth = false,
  animation = "subtle",
  disableAnimation = false,
  animationDelay,
  state = disabled ? "disabled" : "idle",
  error,
  hint,
  valid,

  // Textarea-specific props
  field,
  value,
  onChange,
  mode = "outlined",
  contentSize = "default",
  showCount = false,
  autoResize = true,
  minRows,
  maxRows,
  hideLabel = false,
  characterLimit,
  wordLimit,
  toolbar = false,
  placeholder,
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const densityStyles = densityConfig[density];
  const sizeStyles = textareaSizeConfig[contentSize];
  const animationProps = useComponentAnimation(animation, disableAnimation);

  // Auto-resize functionality
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value, autoResize]);

  if (!field) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;

    if (characterLimit && newValue.length > characterLimit) return;
    if (wordLimit && newValue.split(/\s+/).filter(Boolean).length > wordLimit)
      return;

    onChange?.(newValue);
  };

  const stringValue = (value ?? "") as string;
  const characterCount = stringValue.length;
  const wordCount = stringValue.split(/\s+/).filter(Boolean).length;

  const renderToolbar = () => (
    <div className="flex items-center gap-2 p-1 border-b">
      <button className="p-1 hover:bg-accent rounded">
        <Bold className="h-4 w-4" />
      </button>
      <button className="p-1 hover:bg-accent rounded">
        <Italic className="h-4 w-4" />
      </button>
      <button className="p-1 hover:bg-accent rounded">
        <List className="h-4 w-4" />
      </button>
      <button className="p-1 hover:bg-accent rounded">
        <Link className="h-4 w-4" />
      </button>
      <div className="h-4 w-px bg-border mx-2" />
      <button className="p-1 hover:bg-accent rounded">
        <AlignLeft className="h-4 w-4" />
      </button>
      <button className="p-1 hover:bg-accent rounded">
        <AlignCenter className="h-4 w-4" />
      </button>
      <button className="p-1 hover:bg-accent rounded">
        <AlignRight className="h-4 w-4" />
      </button>
      <div className="h-4 w-px bg-border mx-2" />
      <button className="p-1 hover:bg-accent rounded">
        <Image className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <motion.div
      className={cn(densityStyles.spacing, fullWidth && "w-full", className)}
      style={style}
      {...animationProps}
    >
      {!hideLabel && field.label && (
        <Label
          htmlFor={field.name}
          className={cn(
            densityStyles.fontSize,
            "font-medium",
            disabled ? "text-muted-foreground" : "text-foreground",
            error ? "text-destructive" : "",
            required &&
              "after:content-['*'] after:ml-0.5 after:text-destructive",
          )}
        >
          {field.label}
        </Label>
      )}

      <div
        className={cn(
          "relative rounded-md",
          error && "border-destructive",
          mode === "filled" && "bg-secondary",
        )}
      >
        {toolbar && renderToolbar()}

        <Textarea
          ref={textareaRef}
          id={field.name || id}
          value={stringValue}
          onChange={handleChange}
          placeholder={placeholder || field.placeholder}
          required={required || field.required}
          disabled={disabled || busy || loading}
          readOnly={readOnly}
          rows={minRows || sizeStyles.defaultRows}
          className={cn(
            // Base component styling (consistent across components)
            getComponentStyles({
              size,
              density,
              variant,
              state: error ? "error" : state,
            }),
            // Textarea-specific styling
            sizeStyles.minHeight,
            sizeStyles.maxHeight,
            sizeStyles.fontSize,
            sizeStyles.padding,
            "resize-y",
            autoResize && "overflow-hidden",
            mode === "plain" && "border-0 focus:ring-0",
            mode === "filled" && "bg-secondary",
            mode === "markdown" && "font-mono",
            maxRows && `max-h-[${maxRows * 1.5}rem]`,
            (disabled || busy || loading) &&
              "cursor-not-allowed opacity-50 bg-muted",
          )}
          {...props}
        />

        {showCount && (
          <div
            className={cn(
              "absolute bottom-2 right-2",
              "text-xs text-muted-foreground",
              characterLimit &&
                characterCount > characterLimit * 0.9 &&
                "text-warning",
              characterLimit &&
                characterCount >= characterLimit &&
                "text-destructive",
              wordLimit && wordCount > wordLimit * 0.9 && "text-warning",
              wordLimit && wordCount >= wordLimit && "text-destructive",
            )}
          >
            {characterLimit && `${characterCount}/${characterLimit} characters`}
            {wordLimit && `${wordCount}/${wordLimit} words`}
            {!characterLimit &&
              !wordLimit &&
              `${characterCount} characters, ${wordCount} words`}
          </div>
        )}
      </div>

      {error && (
        <motion.span
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-destructive",
            density === "compact" ? "text-xs" : "text-sm",
          )}
        >
          {error}
        </motion.span>
      )}

      {hint && !error && (
        <span
          className={cn(
            "text-muted-foreground",
            density === "compact" ? "text-xs" : "text-sm",
          )}
        >
          {hint}
        </span>
      )}
    </motion.div>
  );
};

export default MatrxTextarea;

// Usage Example:
/*
// Compact Comment Input
<MatrxTextarea
    field={{
        name: "comment",
        label: "Quick Comment",
        required: true
    }}
    value={comment}
    onChange={setComment}
    textareaSize="compact"
    showCount
    characterLimit={200}
    autoResize
/>

// Default Note Input
<MatrxTextarea
    field={{
        name: "note",
        label: "Meeting Notes",
    }}
    value={notes}
    onChange={setNotes}
    textareaSize="default"
    variant="filled"
    showCount
/>

// Large Description Input
<MatrxTextarea
    field={{
        name: "description",
        label: "Project Description",
    }}
    value={description}
    onChange={setDescription}
    textareaSize="large"
    toolbar
    showCount
    wordLimit={500}
/>

// Article Editor
<MatrxTextarea
    field={{
        name: "article",
        label: "Article Content",
    }}
    value={article}
    onChange={setArticle}
    textareaSize="article"
    variant="markdown"
    toolbar
    showCount
    wordLimit={2000}
/>
*/
