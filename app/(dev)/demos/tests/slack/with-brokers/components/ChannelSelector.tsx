'use client';

import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { brokerSelectors, brokerActions } from '@/lib/redux/brokerSlice';
import { SLACK_BROKER_IDS } from './BrokerSlackClient';
import { SlackChannel } from "@/app/(dev)/demos/tests/slack/slackClientUtils";
import { Hash, RefreshCw, Loader2 } from 'lucide-react';
import { useState } from 'react';

export function ChannelSelector() {
  const dispatch = useAppDispatch();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Get token and channel data from brokers
  const token = useAppSelector(state => 
    brokerSelectors.selectText(state, SLACK_BROKER_IDS.token)
  );
  const channelsJson = useAppSelector(state => 
    brokerSelectors.selectText(state, SLACK_BROKER_IDS.channels)
  );
  const selectedChannel = useAppSelector(state => 
    brokerSelectors.selectText(state, SLACK_BROKER_IDS.selectedChannel)
  );
  
  // Parse channels or use empty array if not available
  const channels: SlackChannel[] = channelsJson ? JSON.parse(channelsJson) : [];
  
  // No token = no channels to select
  if (!token) {
    return null;
  }
  
  // Handle channel selection
  const handleChannelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(brokerActions.setText({
      idArgs: SLACK_BROKER_IDS.selectedChannel,
      text: e.target.value
    }));
  };
  
  // Refresh channels
  const handleRefreshChannels = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      const response = await fetch('/api/slack/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: 'conversations.list',
          method: 'GET',
          token
        })
      });
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || 'Failed to fetch channels');
      }
      
      const channelsList = (data.channels || []).map((channel: any) => ({
        id: channel.id,
        name: channel.name
      }));
      
      // Store channels in broker
      dispatch(brokerActions.setText({
        idArgs: SLACK_BROKER_IDS.channels,
        text: JSON.stringify(channelsList)
      }));
      
      // Auto-select first channel if none selected
      if (channelsList.length > 0 && !selectedChannel) {
        dispatch(brokerActions.setText({
          idArgs: SLACK_BROKER_IDS.selectedChannel,
          text: channelsList[0].id
        }));
      }
    } catch (error) {
      console.error('Error refreshing channels:', error);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  return (
    <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Hash className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          <label htmlFor="channel-select" className="font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
            Select Channel:
          </label>
        </div>
        
        <div className="flex-1 flex gap-2">
          <select
            id="channel-select"
            value={selectedChannel || ''}
            onChange={handleChannelSelect}
            className="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-md p-2 focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          >
            <option value="">Select a channel</option>
            {channels.map(channel => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleRefreshChannels}
            disabled={isRefreshing}
            className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 p-2 rounded-md transition-colors flex items-center justify-center disabled:opacity-50"
            aria-label="Refresh Channels"
          >
            {isRefreshing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
      
      {channels.length === 0 && (
        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          No channels found. Click refresh to load available channels.
        </div>
      )}
    </div>
  );
} 