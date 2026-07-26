import React, { useState, useEffect, useRef } from 'react';
import { SlackTokenResponse, SlackChannel, SlackUser, SlackMessage } from '../types/oauth';
import {
  initializeSlackData,
  getChannelHistory,
  sendMessage,
  joinChannel
} from '../utils/slackUtils';
import { InlineMediaRef } from '@/features/files';

interface SlackManagerProps {
  tokenData: SlackTokenResponse | { access_token: string };
}

const SlackManager: React.FC<SlackManagerProps> = ({ tokenData }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [users, setUsers] = useState<Record<string, SlackUser>>({});
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<SlackMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [botInfo, setBotInfo] = useState<any>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const accessToken = 'tokenData' in tokenData ? tokenData.access_token : tokenData.access_token;

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initialize data on component mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        setIsLoading(true);
        setError(null);

        const data = await initializeSlackData(accessToken);

        // Convert users array to map for easier lookup
        const usersMap: Record<string, SlackUser> = {};
        data.users.forEach((user: SlackUser) => {
          usersMap[user.id] = user;
        });

        setBotInfo(data.botInfo);
        setChannels(data.channels);
        setUsers(usersMap);

        // Select first channel by default if available
        if (data.channels && data.channels.length > 0) {
          setSelectedChannel(data.channels[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Slack data');
        console.error('Error loading Slack data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (accessToken) {
      loadInitialData();
    }
  }, [accessToken]);

  // Load channel messages when a channel is selected
  useEffect(() => {
    async function loadChannelMessages() {
      if (!selectedChannel) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await getChannelHistory(accessToken, selectedChannel);
        setMessages(result.messages.reverse()); // Most recent at the bottom
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load channel messages');
        console.error('Error loading channel messages:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (selectedChannel) {
      loadChannelMessages();
    }
  }, [selectedChannel, accessToken]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle sending a new message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedChannel || !newMessage.trim() || isSending) return;

    try {
      setIsSending(true);
      setError(null);

      await sendMessage(accessToken, selectedChannel, newMessage);

      // Refresh messages
      const result = await getChannelHistory(accessToken, selectedChannel);
      setMessages(result.messages.reverse());

      // Clear input
      setNewMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      console.error('Error sending message:', err);
    } finally {
      setIsSending(false);
    }
  };

  // Handle joining a channel
  const handleJoinChannel = async (channelId: string) => {
    if (isJoining) return;

    try {
      setIsJoining(true);
      setError(null);

      await joinChannel(accessToken, channelId);

      // Refresh channels
      const data = await initializeSlackData(accessToken);
      setChannels(data.channels);

      // Select the joined channel
      setSelectedChannel(channelId);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join channel');
      console.error('Error joining channel:', err);
    } finally {
      setIsJoining(false);
    }
  };


  // Handle refresh
  const handleRefresh = async () => {
    if (!selectedChannel || refreshing) return;

    try {
      setRefreshing(true);
      setError(null);

      const result = await getChannelHistory(accessToken, selectedChannel);
      setMessages(result.messages.reverse());

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh messages');
      console.error('Error refreshing messages:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Get user name from ID
  const getUserName = (userId: string): string => {
    if (users[userId]) {
      return users[userId].real_name || users[userId].name || userId;
    }
    return userId;
  };

  // Get user avatar from ID
  const getUserAvatar = (userId: string): string | null => {
    if (users[userId]?.profile?.image_48) {
      return users[userId].profile.image_48;
    }
    return null;
  };

  // Get bot message indicator
  const isBotMessage = (message: SlackMessage): boolean => {
    return !!message.bot_id;
  };

  // Get selected channel name
  const getSelectedChannelName = (): string => {
    if (!selectedChannel) return '';
    const channel = channels.find(c => c.id === selectedChannel);
    return channel ? `#${channel.name}` : selectedChannel;
  };

  // Filter channels by search term
  const filteredChannels = channels.filter(channel =>
      channel.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading && !selectedChannel) {
    return (
        <div className="flex items-center justify-center min-h-32">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
          <span className="ml-3 text-gray-700">Loading Slack data...</span>
        </div>
    );
  }

  if (error && !selectedChannel && !channels.length) {
    return (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <p className="font-bold">Error loading Slack data</p>
          <p>{error}</p>
        </div>
    );
  }

  return (
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="p-4 bg-purple-600 text-white">
          <h2 className="text-xl font-semibold">Slack Integration</h2>
          {botInfo && (
              <p className="text-sm opacity-80">
                Connected to Slack
              </p>
          )}
        </div>

        <div className="flex flex-col md:flex-row min-h-96">
          {/* Channels sidebar */}
          <div className="w-full md:w-64 border-r border-gray-200 bg-gray-50">
            <div className="p-3 border-b border-gray-200">
              <h3 className="font-medium text-gray-700 mb-2">Channels</h3>
              <div className="relative">
                <input
                    type="text"
                    placeholder="Search channels..."
                    className="w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setSearchTerm('')}
                    >
                      ✕
                    </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto max-h-80">
              {filteredChannels.map(channel => {
                const isSelected = selectedChannel === channel.id;
                const canJoin = !channel.is_member && !channel.is_private;

                return (
                    <div
                        key={channel.id}
                        className={`px-4 py-2 hover:bg-gray-100 cursor-pointer ${
                            isSelected ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700'
                        }`}
                    >
                      <div className="flex justify-between items-center">
                        <div
                            className="flex items-center flex-1"
                            onClick={() => channel.is_member ? setSelectedChannel(channel.id) : null}
                        >
                          <span className="mr-1">#</span>
                          <span className="truncate">{channel.name}</span>
                          {channel.is_private && (
                              <span className="ml-1 text-xs text-gray-500">(private)</span>
                          )}
                          {!channel.is_member && (
                              <span className="ml-1 text-xs text-gray-500">(not joined)</span>
                          )}
                        </div>
                        {canJoin && (
                            <button
                                className="text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 px-2 py-1 rounded"
                                onClick={() => handleJoinChannel(channel.id)}
                                disabled={isJoining}
                            >
                              {isJoining ? 'Joining...' : 'Join'}
                            </button>
                        )}
                      </div>
                    </div>
                );
              })}
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col">
            {/* Channel header */}
            <div className="p-3 border-b border-gray-200 bg-white flex justify-between items-center">
              <h3 className="font-medium">{getSelectedChannelName()}</h3>
              <button
                  className="text-sm bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center"
                  onClick={handleRefresh}
                  disabled={refreshing || !selectedChannel}
              >
                {refreshing ? (
                    <span className="flex items-center">
                  <span className="animate-spin h-3 w-3 border-b-2 border-gray-600 rounded-full mr-1"></span>
                  Refreshing...
                </span>
                ) : (
                    <span>🔄 Refresh</span>
                )}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white max-h-80">
              {isLoading && selectedChannel ? (
                  <div className="flex justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                  </div>
              ) : messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-6">
                    No messages in this channel yet.
                  </div>
              ) : (
                  <>
                    {messages.map(message => (
                        <div key={message.ts} className="flex items-start">
                          <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            {getUserAvatar(message.user) ? (
                                <InlineMediaRef
                                    ref={getUserAvatar(message.user)!}
                                    alt={getUserName(message.user)}
                                    size="fill"
                                    fit="cover"
                                    rounded="full"
                                />
                            ) : (
                                <span className="text-xs font-medium text-gray-600">
                          {isBotMessage(message) ? 'Bot' : getUserName(message.user).charAt(0)}
                        </span>
                            )}
                          </div>
                          <div className="ml-2 flex-1">
                            <div className="flex items-baseline">
                        <span className="font-medium text-gray-900">
                          {isBotMessage(message) ? 'Bot' : getUserName(message.user)}
                        </span>
                              <span className="ml-2 text-xs text-gray-500">
                          {new Date(parseInt(message.ts) * 1000).toLocaleTimeString()}
                        </span>
                            </div>
                            <div className="text-gray-700 whitespace-pre-wrap">{message.text}</div>

                            {/* Display file attachments */}
                            {message.files && message.files.length > 0 && (
                                <div className="mt-2">
                                  {message.files.map(file => (
                                      <div key={file.id} className="mt-1 p-2 border-border rounded bg-gray-50">
                                        <div className="flex items-center">
                                          <svg className="w-4 h-4 text-gray-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                          </svg>
                                          <span className="text-sm font-medium">{file.name}</span>
                                        </div>
                                        {file.mimetype.startsWith('image/') && file.thumb_360 && (
                                            <div className="mt-2">
                                              <img
                                                  src={file.thumb_360}
                                                  alt={file.name}
                                                  className="max-w-xs rounded border border-gray-300"
                                                  style={{
                                                    maxWidth: '100%',
                                                    maxHeight: '200px',
                                                    width: file.thumb_360_w || 'auto',
                                                    height: 'auto'
                                                  }}
                                              />
                                            </div>
                                        )}
                                      </div>
                                  ))}
                                </div>
                            )}
                          </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
              )}
            </div>

            {/* Message input */}
            <div className="border-t border-gray-200 p-3 bg-white">
              <form onSubmit={handleSendMessage} className="flex flex-col space-y-2">
                <div className="flex">
                  <input
                      type="text"
                      className="flex-1 border border-gray-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={isSending || !selectedChannel}
                  />
                  <button
                      type="submit"
                      className="bg-purple-600 text-white px-4 py-2 rounded-r-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50"
                      disabled={isSending || !selectedChannel || !newMessage.trim()}
                  >
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <div />

                  {error && (
                      <div className="text-sm text-red-600">
                        {error}
                      </div>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
  );
};

export default SlackManager;