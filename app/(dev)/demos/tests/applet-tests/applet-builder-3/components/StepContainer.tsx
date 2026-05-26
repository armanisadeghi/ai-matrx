// components/StepContainer.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TemplateStep } from './steps/TemplateStep';
import { IntelligenceStep } from './steps/IntelligenceStep';
import { DataStep } from './steps/DataStep';
import { CustomizeStep } from './steps/CustomizeStep';
import { LogicStep } from './steps/LogicStep';
import { DeployStep } from './steps/DeployStep';

const stepComponents = {
  1: TemplateStep,
  2: IntelligenceStep,
  3: DataStep,
  4: CustomizeStep,
  5: LogicStep,
  6: DeployStep
} as const;

interface StepContainerProps {
  currentStep: number;
}

export function StepContainer({ currentStep }: StepContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const heights = Array.from(containerRef.current.children).map(
          child => child.getBoundingClientRect().height
        );
        const maxHeight = Math.max(...heights);
        setContainerHeight(maxHeight);
      }
    };

    // Initial measurement
    updateHeight();

    // Setup resize observer
    const resizeObserver = new ResizeObserver(updateHeight);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Cleanup
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative"
      style={{ height: containerHeight || 'auto' }}
    >
      {Object.entries(stepComponents).map(([stepId, StepComponent]) => (
        <div
          key={stepId}
          className={`absolute top-0 left-0 w-full transition-opacity duration-300 ${
            currentStep === Number(stepId) ? 'opacity-100 z-10' : 'opacity-0 z-0'
          }`}
        >
          <StepComponent />
        </div>
      ))}
    </div>
  );
}