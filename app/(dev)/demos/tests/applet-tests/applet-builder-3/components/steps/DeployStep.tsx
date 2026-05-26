// components/steps/DeployStep.tsx
import { Card } from '../common';
import { StepHeader } from '../common';
import { Button } from '../common';
import { useAppletStore } from '../../hooks/useAppletState';

const DEPLOYMENT_OPTIONS = [
  {
    id: 'private',
    title: 'Private',
    description: 'Only invited members',
    icon: '🔒'
  },
  {
    id: 'team',
    title: 'Team',
    description: 'All workspace members',
    icon: '👥'
  },
  {
    id: 'public',
    title: 'Public',
    description: 'Anyone with the link',
    icon: '🌍'
  }
] as const;

export function DeployStep() {
  const { deployment, setDeployment } = useAppletStore();

  return (
    <div className="space-y-8">
      <StepHeader
        title="Deploy your Applet"
        description="Publish and share your application"
      />

      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-900 p-6 rounded-lg border-border">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Deployment Options
          </h3>

          <div className="space-y-4">
            {DEPLOYMENT_OPTIONS.map((option) => (
              <div
                key={option.id}
                className={`flex items-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  deployment === option.id
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/50'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => setDeployment(option.id as typeof deployment)}
              >
                <div className="flex-1 flex items-center space-x-3">
                  <span className="text-2xl">{option.icon}</span>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {option.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {option.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-center h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600">
                  {deployment === option.id && (
                    <div className="h-3 w-3 rounded-full bg-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Card className="bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
          <div className="flex items-start space-x-4">
            <div className="flex-1">
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                Ready to launch?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your applet has been validated and is ready for deployment
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {}}
              className="flex-shrink-0"
            >
              Launch Applet
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}