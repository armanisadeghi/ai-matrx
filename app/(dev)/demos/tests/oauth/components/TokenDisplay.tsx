import React, { useState, useEffect } from 'react';
import { ProviderState } from '../types/oauth';
import { OAUTH_PROVIDERS } from '../providers/providers';

interface TokenDisplayProps {
  providerStates: Record<string, ProviderState>;
}

const TokenDisplay: React.FC<TokenDisplayProps> = ({ providerStates }) => {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Get connected providers
  const connectedProviders = Object.entries(providerStates)
      .filter(([_, state]) => state.isConnected && state.token)
      .map(([providerId, state]) => ({
        providerId,
        name: OAUTH_PROVIDERS[providerId]?.name || providerId,
        color: OAUTH_PROVIDERS[providerId]?.color || 'blue-600',
        token: state.token
      }));

  // Log all tokens to console when they change
  useEffect(() => {
    connectedProviders.forEach(provider => {
      console.log(`${provider.name} Token:`, provider.token);
    });
  }, [connectedProviders.map(p => p.token).join(',')]);

  // Handle copy token to clipboard
  const copyToClipboard = (token: string, providerId: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedToken(providerId);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  if (connectedProviders.length === 0) {
    return null;
  }

  return (
      <div className="mt-8 bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Access Tokens</h2>
        <p className="text-sm text-gray-500 mb-4">
          These tokens can be used to access the respective APIs. Click to expand and view the full token.
        </p>

        <div className="space-y-4">
          {connectedProviders.map(provider => (
              <div key={provider.providerId} className="border rounded-lg overflow-hidden">
                <div
                    className={`flex justify-between items-center p-4 cursor-pointer bg-${provider.color}/10`}
                    onClick={() => setExpandedProvider(expandedProvider === provider.providerId ? null : provider.providerId)}
                >
                  <div className="flex items-center">
                    <div className={`text-${provider.color} w-6 h-6 mr-2`}>
                      {OAUTH_PROVIDERS[provider.providerId]?.iconSvg}
                    </div>
                    <span className="font-medium">{provider.name}</span>
                  </div>
                  <div>
                    <button
                        className="text-gray-500 hover:text-gray-700 px-2 py-1 text-sm"
                    >
                      {expandedProvider === provider.providerId ? 'Hide' : 'Show'} Token
                    </button>
                  </div>
                </div>

                {expandedProvider === provider.providerId && (
                    <div className="p-4 bg-gray-50 border-t">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-500">Token Value</span>
                        <button
                            className="text-blue-600 hover:text-blue-800 text-sm"
                            onClick={() => copyToClipboard(provider.token!, provider.providerId)}
                        >
                          {copiedToken === provider.providerId ? 'Copied!' : 'Copy to Clipboard'}
                        </button>
                      </div>
                      <div className="bg-gray-100 p-3 rounded overflow-x-auto">
                        <code className="text-sm break-all font-mono">{provider.token}</code>
                      </div>
                    </div>
                )}
              </div>
          ))}
        </div>
      </div>
  );
};

export default TokenDisplay;