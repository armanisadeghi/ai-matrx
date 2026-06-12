// components/matrx/AnimatedForm/AnimatedTabModal.tsx

"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/styles/themes/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AnimatedButton from "components/matrx/AnimatedForm/AnimatedButton";
import {
  EntityTabModalProps,
  TabButton,
} from "@/components/matrx/Entity/types/entityForm";
import EntityForm from "@/components/matrx/Entity/form/EntityForm";
import { useEntityTabModal } from "@/components/matrx/Entity/hooks/useEntityTabModal";
import { Button } from "@/components/ui/button";

const EntityTabModal: React.FC<
  EntityTabModalProps & { className?: string }
> = ({
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onSubmit: externalOnSubmit,
  triggerButton,
  fields = [],
  formState: externalFormState = {},
  onUpdateField: externalOnUpdateField,
  currentStep = 0,
  onNextStep = () => {},
  onPrevStep = () => {},
  isSinglePage = false,
  title,
  description,
  tabs,
  footer,
  className,
  activeTab: externalActiveTab,
  onTabChange: externalOnTabChange,
  children,
  ...props
}) => {
  const {
    isOpen,
    activeTab,
    internalFormState,
    openModal,
    closeModal,
    handleSubmit,
    handleUpdateField,
    handleTabChange,
  } = useEntityTabModal({
    isOpen: externalIsOpen,
    onClose: externalOnClose,
    onSubmit: externalOnSubmit,
    formState: externalFormState,
    onUpdateField: externalOnUpdateField,
    tabs,
    activeTab: externalActiveTab,
    onTabChange: externalOnTabChange,
  });

  // Add logic to handle custom content as a new tab
  const customTab = children
    ? {
        value: "custom",
        label: "Custom",
        content: children,
      }
    : null;

  const renderCustomTab = () => (
    <TabsContent value="custom">
      <div className="custom-content">{children}</div>
    </TabsContent>
  );

  // Calculate the total number of tabs including the custom tab
  const totalTabs = (tabs ? tabs.length : 0) + (customTab ? 1 : 0);

  // Dynamic class name for grid columns based on the number of tabs
  const gridColsClass = `grid-cols-${totalTabs}`;

  const renderForm = (fieldsToRender: EntityTabModalProps["fields"] = []) => (
    <EntityForm
      fields={fieldsToRender}
      formState={internalFormState}
      onUpdateField={handleUpdateField}
      onSubmit={handleSubmit}
      currentStep={currentStep}
      onNextStep={onNextStep}
      onPrevStep={onPrevStep}
      isSinglePage={isSinglePage}
      className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
    />
  );

  const renderTabButtons = (buttons?: TabButton[]) => {
    if (!buttons) return null;
    return (
      <>
        <div className="mt-5 mb-5 mx-auto border-t border-gray-300 dark:border-neutral-600" />
        <div className="flex justify-end">
          {buttons.map((button, index) => (
            <AnimatedButton
              key={index}
              onClick={button.onClick}
              className={button.className}
            >
              {button.label}
            </AnimatedButton>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      {triggerButton &&
        React.cloneElement(
          triggerButton as React.ReactElement<any>,
          { onClick: openModal } as any,
        )}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 z-50 flex items-center justify-center",
              className,
            )}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn(
                "bg-neutral-50 dark:bg-neutral-900 p-6 text-foreground rounded-xl border border-gray-300 dark:border-neutral-600 " +
                  "shadow-xl max-w-lg w-full relative z-10 overflow-y-auto scrollbar-none",
                className,
              )}
              style={{ maxHeight: "95dvh" }}
              {...props}
            >
              <Button
                onClick={closeModal}
                className="absolute top-2 right-2 text-foreground hover:text-primary"
              >
                &times;
              </Button>

              {(title || description) && (
                <div className="mb-2">
                  {title && <h2 className="text-xl font-semibold">{title}</h2>}
                  {description && (
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  )}
                </div>
              )}

              {tabs || customTab ? (
                <Tabs
                  value={activeTab}
                  onValueChange={handleTabChange}
                  className="w-full"
                >
                  <TabsList className={`grid w-full ${gridColsClass}`}>
                    {customTab && (
                      <TabsTrigger value="custom">
                        {customTab.label}
                      </TabsTrigger>
                    )}
                    {tabs &&
                      tabs.map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                          {tab.label}
                        </TabsTrigger>
                      ))}
                  </TabsList>
                  <div className="mt-5 mb-5 mx-auto border-t border-gray-300 dark:border-neutral-600" />

                  {customTab && renderCustomTab()}

                  {tabs &&
                    tabs.map((tab) => (
                      <TabsContent key={tab.value} value={tab.value}>
                        {renderForm(tab.fields)}
                        {renderTabButtons(tab.buttons)}
                      </TabsContent>
                    ))}
                </Tabs>
              ) : (
                renderForm(fields)
              )}

              {footer && <div className="mt-2">{footer}</div>}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-xl"
              onClick={closeModal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default EntityTabModal;
