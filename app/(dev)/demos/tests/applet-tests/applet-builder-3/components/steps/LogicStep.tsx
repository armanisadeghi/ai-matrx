// components/steps/LogicStep.tsx
import { Plus } from 'lucide-react';
import { Card } from '../common';
import { StepHeader } from '../common';
import { Button } from '../common';

const SAMPLE_AUTOMATION = {
  trigger: 'Task status changes to "Complete"',
  action: 'Send notification to project owner'
};

export function LogicStep() {
  return (
    <div className="space-y-8">
      <StepHeader
        title="Add business logic"
        description="Create workflows, automations, and validations"
      />

      <Card className="bg-gray-50 dark:bg-gray-900">
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Automations
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create rules that run when conditions are met
          </p>

          <div className="space-y-4">
            <Card className="bg-textured border-gray-200 dark:border-gray-700">
              <div className="space-y-3">
                <div className="flex items-center text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">When</span>
                  <span className="mx-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                    {SAMPLE_AUTOMATION.trigger}
                  </span>
                </div>
                <div className="flex items-center text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Then</span>
                  <span className="mx-2 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                    {SAMPLE_AUTOMATION.action}
                  </span>
                </div>
              </div>
            </Card>

            <Button
              variant="secondary"
              onClick={() => {}}
              className="w-full flex items-center justify-center space-x-2"
            >
              <Plus size={16} />
              <span>Add new automation</span>
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-dashed border-gray-300 dark:border-gray-600">
        <div className="text-center">
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">
            Need help with automation?
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Our AI can suggest automations based on your data and workflows
          </p>
          <Button
            variant="secondary"
            onClick={() => {}}
            className="mt-4"
          >
            Generate suggestions
          </Button>
        </div>
      </Card>
    </div>
  );
}

