import { SlackTokenResponse, SlackChannel, SlackUser, SlackMessage } from '../types/oauth';

/**
 * Initialize the Slack data for the manager component
 */
export async function initializeSlackData(token: string) {
  try {
    // Fetch channels list
    const channelsData = await fetchChannelsList(token);

    // Fetch users list
    const usersData = await fetchUsersList(token);

    // Get bot info from users list
    const botUser = usersData.members.find((user: SlackUser) => user.is_bot);
    const botInfo = {
      id: botUser?.id || 'unknown',
      user: botUser?.name || 'Bot User',
      app: 'slack-app'
    };

    return {
      channels: channelsData.channels,
      users: usersData.members,
      botInfo
    };
  } catch (error) {
    console.error('Error initializing Slack data:', error);
    throw error;
  }
}

/**
 * Fetch list of channels from Slack API
 */
export async function fetchChannelsList(token: string) {
  const response = await fetch('/api/slack-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      endpoint: 'conversations.list',
      method: 'POST',
      payload: {
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 100
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Slack channels: ${text}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to fetch Slack channels');
  }

  return data;
}

/**
 * Fetch list of users from Slack API
 */
export async function fetchUsersList(token: string) {
  const response = await fetch('/api/slack-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      endpoint: 'users.list',
      method: 'GET'
    })
  });

  // Handle response...
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch Slack users: ${text}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to fetch Slack users');
  }

  return data;
}

/**
 * Fetch channel history from Slack API
 */
export async function getChannelHistory(token: string, channelId: string) {
  const response = await fetch('/api/slack-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      endpoint: 'conversations.history',
      method: 'POST',
      payload: {
        channel: channelId,
        limit: 50
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch channel history: ${text}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to fetch channel history');
  }

  return data;
}

/**
 * Send message to a Slack channel
 */
export async function sendMessage(token: string, channelId: string, text: string) {
  const response = await fetch('/api/slack-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      endpoint: 'chat.postMessage',
      method: 'POST',
      payload: {
        channel: channelId,
        text
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send message: ${errorText}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to send message');
  }

  return data;
}

/**
 * Get channel info
 */
export async function getChannelInfo(token: string, channelId: string) {
  const response = await fetch('/api/slack-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      endpoint: 'conversations.info',
      method: 'GET',
      payload: {
        channel: channelId
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get channel info: ${errorText}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to get channel info');
  }

  return data;
}

/**
 * Join a channel
 */
export async function joinChannel(token: string, channelId: string) {
  const response = await fetch('/api/slack-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      token,
      endpoint: 'conversations.join',
      method: 'POST',
      payload: {
        channel: channelId
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to join channel: ${errorText}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Failed to join channel');
  }

  return data;
}