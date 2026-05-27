"use client"

import { useState, useEffect } from 'react';
import SlackManager from './components/SlackManager';

const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
const scopes = [
  'app_mentions:read',
  'channels:read',
  'channels:join',
  'chat:write',
  'commands',
  'files:read',
  'files:write',
  'users:read',
  'groups:read',
];
const redirectUri = process.env.NEXT_PUBLIC_SLACK_REDIRECT_URL;

const SlackPage = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if we have any tokens saved in localStorage
    const tokens = localStorage.getItem('slackTokens');
    if (tokens && JSON.parse(tokens).length > 0) {
      setIsLoggedIn(true);
    }

    // Also check if we have a token in the URL (from oauth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token) {
      // Save the token to localStorage
      const savedTokens = localStorage.getItem('slackTokens');
      const tokensList = savedTokens ? JSON.parse(savedTokens) : [];

      if (!tokensList.includes(token)) {
        tokensList.push(token);
        localStorage.setItem('slackTokens', JSON.stringify(tokensList));
      }

      setIsLoggedIn(true);

      // Remove token from URL to prevent it from being exposed
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes.join(',')}&redirect_uri=${encodeURIComponent(redirectUri + "/api/slack/oauth/callback")}`;

  const handleManualTokenAdd = () => {
    const token = prompt("Enter your Slack OAuth token (xoxb-...)");
    if (token) {
      const savedTokens = localStorage.getItem('slackTokens');
      const tokensList = savedTokens ? JSON.parse(savedTokens) : [];

      if (!tokensList.includes(token)) {
        tokensList.push(token);
        localStorage.setItem('slackTokens', JSON.stringify(tokensList));
      }

      setIsLoggedIn(true);
    }
  };

  return (
      <div className="overflow-y-scroll py-8 text-white">
        <div className="max-w-6xl mx-auto px-4">
          <header className="mb-8 flex justify-between items-center">
            <h1 className="text-3xl font-bold">Slack Integration</h1>

            <div className="flex gap-4">
              <a
                  href={slackAuthUrl}
                  className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 inline-flex items-center"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.712 33.642c0 2.862-2.332 5.193-5.193 5.193-2.862 0-5.193-2.331-5.193-5.193 0-2.861 2.331-5.192 5.193-5.192h5.193v5.192zm2.596 0c0-2.861 2.332-5.192 5.193-5.192 2.861 0 5.192 2.331 5.192 5.192v13.004c0 2.861-2.331 5.192-5.192 5.192-2.861 0-5.193-2.331-5.193-5.192V33.642z" fill="#E01E5A"></path>
                  <path d="M27.5 19.712c-2.861 0-5.192-2.332-5.192-5.193 0-2.862 2.331-5.193 5.192-5.193 2.861 0 5.192 2.331 5.192 5.193v5.193H27.5zm0 2.596c2.861 0 5.192 2.332 5.192 5.193 0 2.861-2.331 5.192-5.192 5.192H14.52c-2.862 0-5.193-2.331-5.193-5.192 0-2.861 2.331-5.193 5.193-5.193H27.5z" fill="#36C5F0"></path>
                  <path d="M41.454 27.5c0-2.861 2.332-5.192 5.193-5.192 2.861 0 5.192 2.331 5.192 5.192 0 2.861-2.331 5.192-5.192 5.192h-5.193V27.5zm-2.596 0c0 2.861-2.332 5.192-5.193 5.192-2.861 0-5.192-2.331-5.192-5.192V14.52c0-2.862 2.331-5.193 5.192-5.193 2.861 0 5.193 2.331 5.193 5.193V27.5z" fill="#2EB67D"></path>
                  <path d="M33.665 41.454c2.861 0 5.192 2.332 5.192 5.193 0 2.861-2.331 5.192-5.192 5.192-2.861 0-5.193-2.331-5.193-5.192v-5.193h5.193zm0-2.596c-2.861 0-5.193-2.332-5.193-5.193 0-2.861 2.332-5.192 5.193-5.192h13.004c2.861 0 5.192 2.331 5.192 5.192 0 2.861-2.331 5.193-5.192 5.193H33.665z" fill="#ECB22E"></path>
                </svg>
                Add to Slack
              </a>
              <button
                  onClick={handleManualTokenAdd}
                  className="bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300"
              >
                Add Token Manually
              </button>
            </div>
          </header>

          {isLoggedIn ? (
              <SlackManager />
          ) : (
              <div className="p-8 rounded-lg text-center border border-gray-500">
                <h2 className="text-xl font-semibold mb-4">Welcome to Slack Integration</h2>
                <p className="mb-6">To get started, add your Slack app to your workspace using the "Add to Slack" button above, or add your token manually if you already have one.</p>
                <p className="text-sm text-gray-300">Note: For testing purposes, we're storing your tokens in localStorage. In a production environment, these should be securely stored on your server.</p>
              </div>
          )}
        </div>
      </div>
  );
};

export default SlackPage;