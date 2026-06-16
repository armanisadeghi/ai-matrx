// containers/base/BaseContainer.tsx
import React from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "motion/react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  ActionTargetConfig,
  ContainerProps,
  PresentationType,
  RenderLocation,
} from "@/components/matrx/Entity/field-actions/types";
import { generateUniqueId } from "@/components/matrx/Entity/field-actions/utils";
import { useFieldActionContext } from "@/components/matrx/Entity/field-actions/hooks/useFieldActionContext";

export interface BaseContainerProps extends ContainerProps {
  children: React.ReactNode;
  target?: ActionTargetConfig;
  onClose?: () => void;
  className?: string;
}

export const BaseContainer: React.FC<BaseContainerProps> = ({
  children,
  className,
  target,
  onClose,
  ...props
}) => {
  const { renderInSection } = useFieldActionContext();

  React.useEffect(() => {
    if (target?.location === "section" && target.sectionId) {
      renderInSection(target.sectionId, children, target);
    }
  }, [target, children]);

  if (target?.location === "section") {
    return null;
  }

  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
};

// containers/ModalContainer.tsx
export const ModalContainer: React.FC<BaseContainerProps> = ({
  children,
  title,
  onClose,
  className,
  ...props
}) => {
  return (
    <BaseContainer {...props}>
      <Dialog onOpenChange={onClose}>
        <DialogContent className={className}>
          {title && (
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
          )}
          {children}
        </DialogContent>
      </Dialog>
    </BaseContainer>
  );
};

// containers/SheetContainer.tsx
export const SheetContainer: React.FC<BaseContainerProps> = ({
  children,
  title,
  side = "right",
  onClose,
  className,
  ...props
}) => {
  return (
    <BaseContainer {...props}>
      <MatrxDynamicPanelHost
        open
        onOpenChange={(next) => {
          if (!next) onClose?.();
        }}
        title={title ?? "Details"}
        position={
          side === "top" || side === "bottom" ? side : (side ?? "right")
        }
        defaultSize={32}
        className={className}
        contentClassName="overflow-y-auto"
      >
        {children}
      </MatrxDynamicPanelHost>
    </BaseContainer>
  );
};

// containers/PopoverContainer.tsx
export const PopoverContainer: React.FC<BaseContainerProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <BaseContainer {...props}>
      <Popover>
        <PopoverContent className={className}>{children}</PopoverContent>
      </Popover>
    </BaseContainer>
  );
};

// containers/FloatingContainer.tsx
export const FloatingContainer: React.FC<BaseContainerProps> = ({
  children,
  className,
  onClose,
  ...props
}) => {
  return (
    <BaseContainer {...props}>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={`fixed bottom-4 right-4 z-50 ${className}`}
        >
          <div className="bg-background border border-border rounded-lg shadow-lg">
            {children}
          </div>
        </motion.div>
      </AnimatePresence>
    </BaseContainer>
  );
};

// containers/DynamicSectionContainer.tsx
export const DynamicSectionContainer: React.FC<BaseContainerProps> = ({
  children,
  className,
  target,
  ...props
}) => {
  const sectionId = React.useMemo(() => generateUniqueId("section-"), []);

  return (
    <BaseContainer
      {...props}
      target={{
        ...target,
        sectionId,
        location: RenderLocation.SECTION,
      }}
    >
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className={className}
      >
        {children}
      </motion.div>
    </BaseContainer>
  );
};

// containers/ActionContainerManager.tsx
interface ActionContainerManagerProps extends BaseContainerProps {
  presentation: PresentationType;
  trigger?: React.ReactNode;
}

export const ActionContainerManager: React.FC<ActionContainerManagerProps> = ({
  presentation,
  trigger,
  children,
  ...props
}) => {
  const ContainerComponent = React.useMemo(() => {
    switch (presentation) {
      case PresentationType.MODAL:
        return ModalContainer;
      case PresentationType.SHEET:
        return SheetContainer;
      case PresentationType.POPOVER:
        return PopoverContainer;
      case PresentationType.FLOATING:
        return FloatingContainer;
      case PresentationType.DYNAMIC:
        return DynamicSectionContainer;
      default:
        return BaseContainer;
    }
  }, [presentation]);

  return (
    <>
      {trigger}
      <ContainerComponent {...props}>{children}</ContainerComponent>
    </>
  );
};
