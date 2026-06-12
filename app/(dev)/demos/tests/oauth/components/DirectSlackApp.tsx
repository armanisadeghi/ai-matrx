"use client";

import React, { useState } from 'react';
import SlackManager from "@/app/(dev)/demos/tests/oauth/components/SlackManager";

export default function DirectSlackApp() {
  const [token, setToken] = useState<string>('');
  const [isTokenSubmitted, setIsTokenSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Pre-filled token for testing
  const prefillToken = () => {
    setToken('362271694758.8796274997699.42e7fa8270d780dbe66a8051046c146c86c147569d530b84a2c661bde01d9b18');
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      setError('Please enter a Slack token');
      return;
    }

    try {
      setError(null);
      setIsTokenSubmitted(true);

      // Just a simple check to make sure token looks valid
      if (!token.includes('.')) {
        throw new Error('Invalid token format');
      }

      // Verify token works by making a simple API call
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Invalid token');
      }

      setIsConnected(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify token');
      setIsTokenSubmitted(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsTokenSubmitted(false);
    setToken('');
  };

  return (
      <div className="min-h-dvh bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Slack Direct Integration</h1>
            <p className="text-gray-600 mt-2">
              Access and manage your Slack workspace directly with a token.
            </p>
          </div>

          {!isConnected ? (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">Enter Your Slack Token</h2>

                {error && (
                    <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                      <p className="text-sm">{error}</p>
                    </div>
                )}

                <form onSubmit={handleTokenSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                      Slack Bot User OAuth Token
                    </label>
                    <input
                        type="text"
                        id="token"
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="xoxb-your-token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={isTokenSubmitted}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This should be a Bot User OAuth Token beginning with "xoxb-"
                    </p>
                  </div>

                  <div className="flex space-x-3">
                    <button
                        type="submit"
                        className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded"
                        disabled={isTokenSubmitted}
                    >
                      {isTokenSubmitted ? 'Connecting...' : 'Connect to Slack'}
                    </button>

                    <button
                        type="button"
                        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded"
                        onClick={prefillToken}
                        disabled={isTokenSubmitted}
                    >
                      Use Example Token
                    </button>
                  </div>
                </form>
              </div>
          ) : (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-400 text-green-700 px-4 py-3 rounded">
                  <p className="font-medium">Successfully connected to Slack with your token</p>
                </div>

                <SlackManager tokenData={{ access_token: token }} />

                <div className="flex justify-end">
                  <button
                      className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded"
                      onClick={handleDisconnect}
                  >
                    Disconnect from Slack
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>
  );
}