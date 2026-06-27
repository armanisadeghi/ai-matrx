import { PresentationComponent } from "@/components/matrx/ArmaniForm/action-system/presentation/types";
import {
  defaultConfig,
  getPresentationClasses,
  getPresentationHandlers,
  PresentationButtons,
  PresentationHeader,
} from "@/components/matrx/ArmaniForm/action-system/presentation/common";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { clsx } from "clsx";
import React from "react";

export const ModalPresentation: PresentationComponent = ({
  trigger,
  content,
  variant = "default",
  title,
  description,
  helpSource,
  className,
  config = defaultConfig,
  controls,
  onOpenChange,
}) => {
  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={getPresentationClasses(config, className)}
        //@ts-ignore
        variant={variant}
        {...getPresentationHandlers(config, onOpenChange)}
      >
        <PresentationHeader
          title={title}
          description={description}
          helpSource={helpSource}
        />

        <div
          className={clsx(
            "matrx-content",
            `matrx-density-${config.density || "normal"}`,
          )}
        >
          {content}
        </div>

        <PresentationButtons
          controls={controls}
          variant={variant}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
};
