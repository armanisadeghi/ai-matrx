// components/StepIndicator.tsx
import { CheckCircle, ChevronRight } from 'lucide-react';
import { useAppletStore } from '../hooks/useAppletState';
import { STEPS } from '../constants';

export function StepIndicator() {
  const { currentStep, setStep } = useAppletStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2 md:px-0 overflow-x-auto">
        <div className="flex items-center min-w-max space-x-4 md:space-x-0 md:justify-between w-full">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className="flex items-center group cursor-pointer"
                onClick={() => setStep(step.id)}
              >
                <div className="flex items-center justify-center relative">
                  {currentStep > step.id ? (
                    <CheckCircle 
                      size={24} 
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors" 
                    />
                  ) : (
                    <div
                      className={`flex items-center justify-center h-6 w-6 rounded-full border-2 transition-colors
                        ${currentStep === step.id
                          ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                          : 'border-gray-400 dark:border-gray-500 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-400'
                        }`}
                    >
                      {step.icon}
                    </div>
                  )}
                  <span
                    className={`absolute -bottom-6 whitespace-nowrap text-xs font-medium md:hidden
                      ${currentStep === step.id
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                      }`}
                  >
                    {step.title}
                  </span>
                </div>
                <span
                  className={`hidden md:block ml-2 text-sm font-medium transition-colors
                    ${currentStep === step.id
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 group-hover:text-blue-400'
                    }`}
                >
                  {step.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <ChevronRight size={16} className="mx-2 text-gray-400 dark:text-gray-500 hidden md:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full">
        <div
          className="h-1 bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-300"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
}
