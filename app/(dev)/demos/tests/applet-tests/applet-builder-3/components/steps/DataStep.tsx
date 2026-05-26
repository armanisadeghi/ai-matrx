// components/steps/DataStep.tsx
import { Plus } from 'lucide-react';
import { Card } from '../common';
import { StepHeader } from '../common';
import { Button } from '../common';

const SAMPLE_DATA = [
  { name: 'Tasks', records: 15 },
  { name: 'Users', records: 8 },
  { name: 'Projects', records: 4 }
] as const;

export function DataStep() {
  return (
    <div className="space-y-8">
      <StepHeader
        title="Configure your data"
        description="Set up tables, relationships, and permissions"
      />

      <Card className="bg-gray-50 dark:bg-gray-900">
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Data Structure
          </h3>

          <div className="space-y-4">
            {SAMPLE_DATA.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {item.name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {item.records} records
                </span>
              </div>
            ))}
          </div>

          <Button
            variant="secondary"
            onClick={() => {}}
            className="flex items-center space-x-2"
          >
            <Plus size={16} />
            <span>Add new table</span>
          </Button>
        </div>
      </Card>

      <Card className="border-dashed border-gray-300 dark:border-gray-600">
        <div className="text-center">
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">
            Need help with your data structure?
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Our AI can analyze your existing data and suggest an optimal structure
          </p>
          <Button
            variant="secondary"
            onClick={() => {}}
            className="mt-4"
          >
            Analyze my data
          </Button>
        </div>
      </Card>
    </div>
  );
}

