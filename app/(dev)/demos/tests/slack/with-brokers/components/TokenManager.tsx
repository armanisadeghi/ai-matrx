'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerActions, brokerSelectors } from '@/lib/redux/brokerSlice';
import { SLACK_BROKER_IDS } from './BrokerSlackClient';

export function TokenManager() {
  const dispatch = useAppDispatch();
  const [savedTokens, setSavedTokens] = useState<string[]>([]);
  
  // Get token from broker
  const token = useAppSelector(state => 
    brokerSelectors.selectText(state, SLACK_BROKER_IDS.token) || ''
  );
  
  // Load saved tokens from localStorage on component mount
  useEffect(() => {
    const storedTokens = localStorage.getItem('slackTokens');
    if (storedTokens) {
      const parsedTokens = JSON.parse(storedTokens);
      setSavedTokens(parsedTokens);
      
      // If we have tokens but none is selected, use the first one
      if (parsedTokens.length > 0 && !token) {
        setToken(parsedTokens[0]);
      }
    }
  }, []);
  
  // Update token in broker state - memoize callback
  const setToken = useCallback((newToken: string) => {
    dispatch(brokerActions.setText({
      idArgs: SLACK_BROKER_IDS.token,
      text: newToken
    }));
  }, [dispatch]);
  
  // Handle token input change - memoize callback
  const handleTokenChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setToken(e.target.value);
  }, [setToken]);
  
  // Save token to localStorage - memoize callback
  const saveToken = useCallback(() => {
    if (!token) return;
    
    if (!savedTokens.includes(token)) {
      const newTokens = [...savedTokens, token];
      localStorage.setItem('slackTokens', JSON.stringify(newTokens));
      setSavedTokens(newTokens);
    }
  }, [token, savedTokens]);
  
  // Select a saved token - memoize callback
  const selectToken = useCallback((savedToken: string) => {
    setToken(savedToken);
  }, [setToken]);
  
  // Remove a saved token - memoize callback
  const removeToken = useCallback((tokenToRemove: string) => {
    const newTokens = savedTokens.filter(t => t !== tokenToRemove);
    localStorage.setItem('slackTokens', JSON.stringify(newTokens));
    setSavedTokens(newTokens);
    
    if (token === tokenToRemove) {
      setToken(newTokens.length > 0 ? newTokens[0] : '');
    }
  }, [savedTokens, token, setToken]);
  
  // Memoize the saved tokens list
  const savedTokensList = useMemo(() => {
    if (savedTokens.length === 0) return null;
    
    return (
      <div className="mt-4">
        <h3 className="font-medium mb-2 text-slate-800 dark:text-slate-200">Saved Tokens:</h3>
        <div className="flex flex-wrap gap-2">
          {savedTokens.map((savedToken, index) => (
            <div key={index} className="flex items-center bg-slate-200 dark:bg-slate-700 p-2 rounded-md">
              <button
                onClick={() => selectToken(savedToken)}
                className="text-slate-800 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white mr-2"
              >
                {savedToken.substring(0, 12)}...
              </button>
              <button
                onClick={() => removeToken(savedToken)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                aria-label="Remove token"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }, [savedTokens, selectToken, removeToken]);
  
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Token Management</h2>
      
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          value={token}
          onChange={handleTokenChange}
          placeholder="Enter Slack OAuth token (xoxb-...)"
          className="flex-grow p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-md focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
        />
        <button
          onClick={saveToken}
          className="bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors"
        >
          Save Token
        </button>
      </div>
      
      {savedTokensList}
    </div>
  );
} 