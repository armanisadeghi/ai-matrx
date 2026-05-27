// app/(authenticated)/tests/slack/with-brokers/page.tsx

'use client';

import { useState } from 'react';
import { BrokerSlackClient } from './components/BrokerSlackClient';
import { SlackAuthentication } from './components/SlackAuthentication';
import { ChannelSelector } from './components/ChannelSelector';
import { BrokerFormExample } from './components/BrokerForm';
import { useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from '@/lib/redux/brokerSlice';
import { SLACK_BROKER_IDS } from './components/BrokerSlackClient';
import { MessageSquare, Users, Hash } from 'lucide-react';

type SlackTab = 'messages' | 'users' | 'channels';

export default function SlackWithBrokersPage() {
    const token = useAppSelector(state =>
        brokerSelectors.selectText(state, SLACK_BROKER_IDS.token)
    );

    const [activeTab, setActiveTab] = useState<SlackTab>('messages');
    
    return (
        <div className="p-6 space-y-6 bg-slate-100 dark:bg-slate-900">
            <h1 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-200">
                Slack Integration with Brokers
            </h1>
            
            <BrokerSlackClient>
                {/* Authentication component that provides the Slack connection UI */}
                <SlackAuthentication />
                
                {/* Channel selector appears only when authenticated */}
                {token && <ChannelSelector />}
                
                {/* Main content area with tabs */}
                {token ? (
                    <div className="mt-6">
                        {/* Tab Navigation */}
                        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
                            <button
                                onClick={() => setActiveTab('messages')}
                                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 ${
                                    activeTab === 'messages' 
                                        ? 'border-slate-600 text-slate-800 dark:border-slate-400 dark:text-slate-200' 
                                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                <MessageSquare className="w-4 h-4" />
                                <span>Messages</span>
                            </button>
                            
                            <button 
                                onClick={() => setActiveTab('users')}
                                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 ${
                                    activeTab === 'users' 
                                        ? 'border-slate-600 text-slate-800 dark:border-slate-400 dark:text-slate-200' 
                                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                <Users className="w-4 h-4" />
                                <span>Users</span>
                            </button>
                            
                            <button 
                                onClick={() => setActiveTab('channels')}
                                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 ${
                                    activeTab === 'channels' 
                                        ? 'border-slate-600 text-slate-800 dark:border-slate-400 dark:text-slate-200' 
                                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                <Hash className="w-4 h-4" />
                                <span>Channels</span>
                            </button>
                        </div>
                        
                        {/* Tab Content */}
                        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md">
                            {/* Messages Tab */}
                            {activeTab === 'messages' && (
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-md">
                                            <MessageSquare className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Send Slack Messages</h2>
                                    </div>
                                    <BrokerFormExample />
                                </div>
                            )}
                            
                            {/* Users Tab - Placeholder for future implementation */}
                            {activeTab === 'users' && (
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-md">
                                            <Users className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Workspace Users</h2>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-400 mb-4">
                                        This tab will display information about users in your Slack workspace.
                                    </p>
                                    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-6 text-center">
                                        <p className="text-slate-500 dark:text-slate-400">
                                            User information feature is coming soon!
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {/* Channels Tab - Placeholder for future implementation */}
                            {activeTab === 'channels' && (
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-md">
                                            <Hash className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Workspace Channels</h2>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-400 mb-4">
                                        This tab will display information about channels in your Slack workspace.
                                    </p>
                                    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-md p-6 text-center">
                                        <p className="text-slate-500 dark:text-slate-400">
                                            Channel management feature is coming soon!
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="mt-6 p-6 bg-white dark:bg-slate-900 rounded-lg shadow-md">
                        <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-slate-200">
                            Connect Your Slack Account
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400">
                            Use the authentication panel above to connect your Slack workspace before accessing Slack features.
                        </p>
                    </div>
                )}
            </BrokerSlackClient>
        </div>
    );
}
