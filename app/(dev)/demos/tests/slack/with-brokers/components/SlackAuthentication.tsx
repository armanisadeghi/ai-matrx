'use client';
import { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { brokerActions, brokerSelectors } from '@/lib/redux/brokerSlice';
import { SLACK_BROKER_IDS } from './BrokerSlackClient';
import { MessageSquare, Shield, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react';
import { FaSlack } from "react-icons/fa";

// Define scopes required for our Slack app
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

export function SlackAuthentication() {
  const dispatch = useAppDispatch();
  const [savedTokens, setSavedTokens] = useState<string[]>([]);
  const [authUrl, setAuthUrl] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  // Get token from broker
  const token = useAppSelector(state => 
    brokerSelectors.selectText(state, SLACK_BROKER_IDS.token)
  );
  
  useEffect(() => {
    // Get environment variables
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_SLACK_REDIRECT_URL;
    
    if (clientId && redirectUri) {
      const callbackUrl = `${redirectUri}/api/slack/oauth/callback`;
      const url = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes.join(',')}&redirect_uri=${encodeURIComponent(callbackUrl)}`;
      setAuthUrl(url);
    }
    
    // Check for tokens in localStorage
    const storedTokens = localStorage.getItem('slackTokens');
    if (storedTokens) {
      const parsedTokens = JSON.parse(storedTokens);
      setSavedTokens(parsedTokens);
      
      // Auto-select first token if we have one and no token is set
      if (parsedTokens.length > 0 && !token) {
        dispatch(brokerActions.setText({
          idArgs: SLACK_BROKER_IDS.token,
          text: parsedTokens[0]
        }));
      }
    }
    
    // Check for token in URL (from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    
    if (urlToken) {
      setIsConnecting(true);
      dispatch(brokerActions.setText({
        idArgs: SLACK_BROKER_IDS.token,
        text: urlToken
      }));
      
      const updatedTokens = storedTokens 
        ? [...JSON.parse(storedTokens).filter((t: string) => t !== urlToken), urlToken]
        : [urlToken];
      
      localStorage.setItem('slackTokens', JSON.stringify(updatedTokens));
      setSavedTokens(updatedTokens);
      
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setTimeout(() => setIsConnecting(false), 1000);
    }
  }, [dispatch, token]);
  
  const handleDisconnect = () => {
    if (token) {
      dispatch(brokerActions.setText({
        idArgs: SLACK_BROKER_IDS.token,
        text: ''
      }));
      
      const updatedTokens = savedTokens.filter(t => t !== token);
      localStorage.setItem('slackTokens', JSON.stringify(updatedTokens));
      setSavedTokens(updatedTokens);
      setShowDetails(false);
    }
  };
  
  const handleSwitchToken = (savedToken: string) => {
    dispatch(brokerActions.setText({
      idArgs: SLACK_BROKER_IDS.token,
      text: savedToken
    }));
  };
  
  if (isConnecting) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl shadow-lg p-4">
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-green-600 dark:text-green-400 animate-spin" />
          <p className="text-green-800 dark:text-green-300 font-medium">Connecting to Slack...</p>
        </div>
      </div>
    );
  }
  
  if (!token) {
    return (
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Slack Icon and Title */}
            <div className="flex items-center gap-3 flex-1">
              <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm">
                <FaSlack className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Connect Slack</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">Enable workspace integrations</p>
              </div>
            </div>
            
            {/* Feature pills - hidden on mobile */}
            <div className="hidden lg:flex items-center gap-2 flex-1">
              <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full">
                <MessageSquare className="w-3 h-3 text-green-600 dark:text-green-400" />
                <span className="text-xs text-green-700 dark:text-green-300">Messaging</span>
              </div>
              <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                <Shield className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-700 dark:text-blue-300">Secure</span>
              </div>
              <div className="flex items-center gap-1 bg-purple-100 dark:bg-purple-900/30 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span className="text-xs text-purple-700 dark:text-purple-300">Easy Setup</span>
              </div>
            </div>
            
            {/* Connect Button */}
            <div className="flex items-center gap-2">
              {savedTokens.length > 0 && (
                <select
                  className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  onChange={(e) => e.target.value && handleSwitchToken(e.target.value)}
                >
                  <option value="">Previous connections</option>
                  {savedTokens.map((savedToken, index) => (
                    <option key={index} value={savedToken}>
                      {savedToken.substring(0, 10)}...
                    </option>
                  ))}
                </select>
              )}
              
              {authUrl ? (
                <a 
                  href={authUrl}
                  className="inline-flex items-center gap-2 bg-[#4A154B] hover:bg-[#611f64] text-white font-medium py-2 px-4 rounded-lg transition-all hover:scale-105 shadow-md whitespace-nowrap"
                >
                  <FaSlack className="w-4 h-4" />
                  Add to Slack
                </a>
              ) : (
                <button 
                  className="bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium py-2 px-4 rounded-lg cursor-not-allowed flex items-center gap-2"
                  disabled
                >
                  <XCircle className="w-4 h-4" />
                  Config Missing
                </button>
              )}
            </div>
          </div>
          
          {/* Mobile feature pills */}
          <div className="flex lg:hidden items-center gap-2 mt-4">
            <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full">
              <MessageSquare className="w-3 h-3 text-green-600 dark:text-green-400" />
              <span className="text-xs text-green-700 dark:text-green-300">Messaging</span>
            </div>
            <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
              <Shield className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-blue-700 dark:text-blue-300">Secure</span>
            </div>
            <div className="flex items-center gap-1 bg-purple-100 dark:bg-purple-900/30 px-3 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span className="text-xs text-purple-700 dark:text-purple-300">Easy Setup</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl shadow-lg overflow-hidden">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Connected Status */}
          <div className="flex items-center gap-3 flex-1">
            <div className="bg-white dark:bg-green-800 p-3 rounded-lg shadow-sm">
              <FaSlack className="w-6 h-6 text-[#4A154B] dark:text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-800 dark:text-green-200">Slack Connected</h3>
              <p className="text-sm text-green-600 dark:text-green-400">Workspace authenticated</p>
            </div>
          </div>
          
          {/* Connection Info - hidden on mobile unless expanded */}
          <div className={`${showDetails ? 'flex' : 'hidden'} sm:flex items-center gap-4 flex-1`}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-700 dark:text-green-300">Token:</span>
              <code className="text-sm font-mono bg-white dark:bg-green-900/30 px-2 py-1 rounded">
                {token.substring(0, 12)}...
              </code>
            </div>
            {savedTokens.length > 1 && (
              <select
                className="text-sm border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 bg-white dark:bg-green-900/30 text-green-700 dark:text-green-300"
                onChange={(e) => e.target.value && handleSwitchToken(e.target.value)}
                value={token}
              >
                {savedTokens.map((savedToken, index) => (
                  <option key={index} value={savedToken}>
                    {savedToken.substring(0, 10)}...
                  </option>
                ))}
              </select>
            )}
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile details toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="sm:hidden inline-flex items-center gap-1 text-green-600 dark:text-green-400"
            >
              <span className="text-sm">{showDetails ? 'Hide' : 'Details'}</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
            </button>
            
            <button
              onClick={handleDisconnect}
              className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          </div>
        </div>
        
        {/* Mobile connection info */}
        {showDetails && (
          <div className="sm:hidden mt-4 pt-4 border-t border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-700 dark:text-green-300">Token:</span>
              <code className="text-sm font-mono bg-white dark:bg-green-900/30 px-2 py-1 rounded">
                {token.substring(0, 12)}...
              </code>
            </div>
            {savedTokens.length > 1 && (
              <div className="mt-2">
                <select
                  className="w-full text-sm border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 bg-white dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  onChange={(e) => e.target.value && handleSwitchToken(e.target.value)}
                  value={token}
                >
                  <option>Switch workspace</option>
                  {savedTokens.map((savedToken, index) => (
                    <option key={index} value={savedToken}>
                      {savedToken.substring(0, 10)}...
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}