"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { OAUTH_PROVIDERS } from './providers/providers';
import { startOAuthFlow, exchangeCodeForToken } from './utils/oauth';
import { ProviderState } from './types/oauth';
import OAuthProvider from './components/OAuthProvider';
import TokenDisplay from './components/TokenDisplay';
import SlackManager from './components/SlackManager';

export default function SlackApp() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'oauth' | 'direct'>('direct');
  const [directToken, setDirectToken] = useState<string>('');
  const [isUsingDirectToken, setIsUsingDirectToken] = useState<boolean>(false);
  const [directTokenError, setDirectTokenError] = useState<string | null>(null);

  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>({
    slack: {
      isLoading: false,
      isConnected: false,
      token: null,
      data: null,
      error: null
    }
  });

  // Process OAuth callbacks
  useEffect(() => {
    if (activeTab !== 'oauth') return;

    const provider = searchParams.get('provider');
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (!provider) return;

    // Handle OAuth error
    if (error) {
      console.error(`OAuth error for ${provider}:`, error);
      setProviderStates(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          isLoading: false,
          error: `Authentication failed: ${error}`
        }
      }));
      return;
    }

    // Process OAuth code
    if (code && !providerStates[provider]?.isConnected) {
      handleOAuthCode(provider, code);
    }
  }, [searchParams, activeTab]);

  // Pre-fill the example token
  useEffect(() => {
    setDirectToken('362271694758.8796274997699.42e7fa8270d780dbe66a8051046c146c86c147569d530b84a2c661bde01d9b18');
  }, []);

  // Handle OAuth code exchange
  const handleOAuthCode = async (provider: string, code: string) => {
    console.log(`Processing ${provider} authentication code`);

    // Set loading state
    setProviderStates(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        isLoading: true,
        error: null
      }
    }));

    try {
      // Exchange code for token
      const tokenData = await exchangeCodeForToken(provider, code);

      // Store token and data
      setProviderStates(prev => ({
        ...prev,
        [provider]: {
          isLoading: false,
          isConnected: true,
          token: tokenData.access_token,
          data: tokenData,
          error: null
        }
      }));

      console.log(`${provider} authentication successful`);
    } catch (error) {
      console.error(`Error exchanging ${provider} code:`, error);
      let errorMessage = 'Failed to authenticate';

      if (error instanceof Error) {
        errorMessage = error.message;
      }

      setProviderStates(prev => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          isLoading: false,
          error: errorMessage
        }
      }));
    }
  };

  // Connect to provider via OAuth
  const handleConnect = (providerId: string) => {
    const providerConfig = OAUTH_PROVIDERS[providerId];
    if (!providerConfig) {
      console.error(`Provider ${providerId} not found in configuration`);
      return;
    }

    // Start OAuth flow
    startOAuthFlow(providerConfig);
  };

  // Disconnect from provider (OAuth)
  const handleDisconnect = (providerId: string) => {
    setProviderStates(prev => ({
      ...prev,
      [providerId]: {
        isLoading: false,
        isConnected: false,
        token: null,
        data: null,
        error: null
      }
    }));
  };

  // Connect using direct token
  const handleDirectTokenConnect = async () => {
    if (!directToken.trim()) {
      setDirectTokenError('Please enter a Slack token');
      return;
    }

    try {
      setDirectTokenError(null);

      // Just a simple check to make sure token looks valid
      if (!directToken.includes('.')) {
        throw new Error('Invalid token format');
      }

      // Verify token works by making a simple API call
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${directToken}`
        }
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Invalid token');
      }

      setIsUsingDirectToken(true);

    } catch (err) {
      setDirectTokenError(err instanceof Error ? err.message : 'Failed to verify token');
    }
  };

  // Disconnect direct token
  const handleDirectTokenDisconnect = () => {
    setIsUsingDirectToken(false);
    setDirectToken('');
  };

  return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Slack Integration</h1>
            <p className="text-gray-600 mt-2">
              Connect and manage your Slack workspace with our application.
            </p>
          </div>

          {/* Tab navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex -mb-px">
              <button
                  className={`py-2 px-4 border-b-2 font-medium text-sm ${
                      activeTab === 'direct'
                          ? 'border-purple-500 text-purple-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('direct')}
              >
                Direct Token
              </button>
              <button
                  className={`py-2 px-4 border-b-2 font-medium text-sm ${
                      activeTab === 'oauth'
                          ? 'border-purple-500 text-purple-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('oauth')}
              >
                OAuth Flow
              </button>
            </nav>
          </div>

          {/* Tab content */}
          {activeTab === 'oauth' ? (
              <div className="grid grid-cols-1 gap-6">
                {/* Slack Provider with OAuth */}
                <OAuthProvider
                    config={OAUTH_PROVIDERS.slack}
                    state={providerStates.slack}
                    onConnect={() => handleConnect('slack')}
                    onDisconnect={() => handleDisconnect('slack')}
                />

                {/* Token Display */}
                {Object.values(providerStates).some(state => state.isConnected) && (
                    <TokenDisplay providerStates={providerStates} />
                )}
              </div>
          ) : (
              <div className="grid grid-cols-1 gap-6">
                {/* Direct Token Interface */}
                {!isUsingDirectToken ? (
                    <div className="bg-white shadow rounded-lg p-6">
                      <h2 className="text-xl font-semibold text-gray-800 mb-4">Enter Your Slack Token</h2>

                      {directTokenError && (
                          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                            <p className="text-sm">{directTokenError}</p>
                          </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <label htmlFor="direct-token" className="block text-sm font-medium text-gray-700 mb-1">
                            Slack Bot User OAuth Token
                          </label>
                          <input
                              type="text"
                              id="direct-token"
                              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              placeholder="xoxb-your-token"
                              value={directToken}
                              onChange={(e) => setDirectToken(e.target.value)}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter your Slack token to connect directly without OAuth flow
                          </p>
                        </div>

                        <button
                            className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded"
                            onClick={handleDirectTokenConnect}
                        >
                          Connect with Token
                        </button>
                      </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                      <div className="bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded">
                        <p className="font-medium">Successfully connected to Slack with your token</p>
                      </div>

                      <SlackManager tokenData={{ access_token: directToken }} />

                      <div className="flex justify-end">
                        <button
                            className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded"
                            onClick={handleDirectTokenDisconnect}
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                )}
              </div>
          )}
        </div>
      </div>
  );
}