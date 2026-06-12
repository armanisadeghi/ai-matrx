"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/styles/themes/utils";
import {
  EntityFormModalProps,
  EntityModalFormState,
} from "@/components/matrx/Entity/types/entityForm";
import EntityForm from "@/components/matrx/Entity/form/EntityForm"; // Import cn utility

const EntityFormModal: React.FC<
  EntityFormModalProps & { className?: string }
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
  className,
  ...props
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [internalFormState, setInternalFormState] =
    useState<EntityModalFormState>(externalFormState);

  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalIsOpen;

  useEffect(() => {
    if (isControlled) {
      setInternalIsOpen(externalIsOpen);
    }
  }, [externalIsOpen, isControlled]);

  useEffect(() => {
    setInternalFormState(externalFormState);
  }, [externalFormState]);

  const openModal = () => setInternalIsOpen(true);
  const closeModal = () => {
    if (isControlled && externalOnClose) {
      externalOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  const handleSubmit = () => {
    if (externalOnSubmit) {
      if (externalOnSubmit.length > 0) {
        (externalOnSubmit as (formData: EntityModalFormState) => void)(
          internalFormState,
        );
      } else {
        (externalOnSubmit as () => void)();
      }
    }
    closeModal();
  };

  const handleUpdateField = (name: string, value: any) => {
    const newState = { ...internalFormState, [name]: value };
    setInternalFormState(newState);
    if (externalOnUpdateField) {
      externalOnUpdateField(name, value);
    }
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
            )} // Use cn for dynamic classNames
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn(
                "bg-background p-6 rounded-lg shadow-xl max-w-md w-full relative z-10 overflow-y-auto scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-primary",
                className,
              )} // Added overflow-y-auto and scrollbar styles for scrollable content
              style={{ maxHeight: "90dvh" }} // Set max height to 90% of the viewport height to ensure modal is contained within the viewport
              {...props}
            >
              <button
                onClick={closeModal}
                className="absolute top-2 right-2 text-foreground hover:text-primary"
              >
                &times;
              </button>
              <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-primary max-h-[70dvh]">
                {" "}
                {/* Ensure form content can scroll */}
                <EntityForm
                  fields={fields}
                  formState={internalFormState}
                  onUpdateField={handleUpdateField}
                  onSubmit={handleSubmit}
                  currentStep={currentStep}
                  onNextStep={onNextStep}
                  onPrevStep={onPrevStep}
                  isSinglePage={isSinglePage}
                />
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
              onClick={closeModal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default EntityFormModal;
