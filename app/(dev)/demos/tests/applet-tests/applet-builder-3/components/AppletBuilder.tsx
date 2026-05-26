// components/AppletBuilder.tsx
'use client';

import { Settings } from 'lucide-react';
import { useAppletStore } from '../hooks/useAppletState';
import { STEPS } from '../constants';
import { StepIndicator } from './StepIndicator';
import { Button } from './common';
import { StepContainer } from './StepContainer';

export default function AppletBuilder() {
  const { currentStep, appName, setStep } = useAppletStore();

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setStep(currentStep - 1);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-textured rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {appName || 'Untitled Applet'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Create your Applet with full AI Integration in minutes
            </p>
          </div>
          <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex-shrink-0 p-6 border-b border-border">
        <StepIndicator />
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        {/* All steps are rendered but only one is visible */}
        <div className="flex-1">
          <StepContainer currentStep={currentStep} />
        </div>

        {/* Navigation - Fixed at bottom */}
        <div className="flex-shrink-0 flex justify-between pt-6 mt-8 border-t border-border">
          <Button
            variant="secondary"
            onClick={handleBack}
            disabled={currentStep === 1}
          >
            Back
          </Button>

          <Button
            variant="primary"
            onClick={handleNext}
          >
            {currentStep === STEPS.length ? 'Finish' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}