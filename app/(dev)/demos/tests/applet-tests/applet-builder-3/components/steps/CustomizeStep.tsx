// components/steps/CustomizeStep.tsx
import { Input } from '../common';
import { Card } from '../common';
import { StepHeader } from '../common';
import { useAppletStore } from '../../hooks/useAppletState';
import { COLOR_OPTIONS } from '../../constants';

const LAYOUTS = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Overview with key metrics'
  },
  {
    id: 'list',
    name: 'List View',
    description: 'Detailed record listing'
  },
  {
    id: 'kanban',
    name: 'Kanban',
    description: 'Visual process management'
  }
] as const;

export function CustomizeStep() {
  const { appName, setAppName, selectedColor, setColor } = useAppletStore();

  return (
    <div className="space-y-8">
      <StepHeader
        title="Customize your applet"
        description="Configure the look and feel of your application"
      />

      <div className="space-y-8">
        <div>
          <Input
            label="Applet Name"
            value={appName}
            onChange={setAppName}
            placeholder="Enter applet name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Brand Color
          </label>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.id}
                className={`h-8 w-8 rounded-full transition-all duration-200 ${
                  selectedColor === color.value
                    ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600'
                    : ''
                }`}
                style={{ backgroundColor: color.value }}
                onClick={() => setColor(color.value)}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Layout
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {LAYOUTS.map((layout) => (
              <Card
                key={layout.id}
                className="border-gray-200 dark:border-gray-700 hover:border-blue-400"
              >
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {layout.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {layout.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}