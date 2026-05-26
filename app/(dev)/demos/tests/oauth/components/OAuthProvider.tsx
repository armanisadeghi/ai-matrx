import React, {useState} from 'react';
import {OAuthProviderConfig, ProviderState, SlackTokenResponse} from '../types/oauth';
import SlackManager from './SlackManager';

interface OAuthProviderProps {
  config: OAuthProviderConfig;
  state: ProviderState;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function OAuthProvider({
                                        config,
                                        state,
                                        onConnect,
                                        onDisconnect
                                      }: OAuthProviderProps) {
  const [showToken, setShowToken] = useState(false);
  const isSlack = config.name.toLowerCase() === 'slack';

  return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <div className={`text-${config.color}`}>
            {config.iconSvg}
          </div>
          <h2 className="text-xl font-semibold ml-2 text-gray-800">{config.name}</h2>
        </div>

        {state.error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p className="text-sm">{state.error}</p>
            </div>
        )}

        {state.isLoading ? (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
              <span className="ml-2">Connecting to {config.name}...</span>
            </div>
        ) : !state.isConnected ? (
            <div>
              <p className="mb-4 text-gray-600">
                Connect to your {config.name} account to access data and services.
              </p>
              <div className="flex flex-col space-y-3">
                <button
                    className={`bg-${config.color} hover:bg-${config.color}/90 text-${config.textColor || 'white'} font-medium py-2 px-4 rounded flex items-center justify-center`}
                    onClick={onConnect}
                >
                  <span>Connect to {config.name}</span>
                </button>
              </div>
            </div>
        ) : (
            <div>
              {/* Connected state with token and data display */}
              {state.token && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-semibold">Access Token</h3>
                      <button
                          onClick={() => setShowToken(!showToken)}
                          className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                      >
                        {showToken ? 'Hide' : 'Show'} Token
                      </button>
                    </div>

                    {showToken ? (
                        <div className="bg-gray-100 p-4 rounded-md overflow-x-auto">
                          <code className="text-sm break-all">{state.token}</code>
                        </div>
                    ) : (
                        <div className="bg-gray-100 p-4 rounded-md">
                          <p className="text-sm text-gray-500">Token is hidden. Click "Show Token" to reveal.</p>
                        </div>
                    )}
                  </div>
              )}

              {/* Slack Manager */}
              {isSlack && state.token && (
                  <div className="mt-6">
                    <SlackManager tokenData={{access_token: state.token}}/>
                  </div>
              )}

              <button
                  className="mt-4 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded"
                  onClick={onDisconnect}
              >
                Disconnect
              </button>
            </div>
        )}
      </div>
  );
}