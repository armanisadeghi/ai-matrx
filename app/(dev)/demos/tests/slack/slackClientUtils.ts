export interface SlackMessage {
  channel: string;
  text: string;
  blocks?: any[];
}

export interface SlackChannel {
  id: string;
  name: string;
}

export class SlackClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  // Helper method to call our proxy API
  private async callProxyApi(endpoint: string, method: string, body?: any): Promise<any> {
    try {
      const response = await fetch('/api/slack/proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint,
          method,
          token: this.token,
          body
        })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Unknown Slack API error');
      }

      return data;
    } catch (error) {
      console.error(`Error in Slack API call to ${endpoint}:`, error);
      throw error;
    }
  }

  async joinChannel(channelId: string): Promise<boolean> {
    try {
      const result = await this.callProxyApi('conversations.join', 'POST', {
        channel: channelId
      });

      return result.ok === true;
    } catch (error) {
      console.error('Error joining Slack channel:', error);
      // Don't throw here - it's normal to fail for private channels
      return false;
    }
  }

  async sendMessage(message: SlackMessage): Promise<any> {
    try {
      // Try to join the channel first (this is optional but can be helpful)
      try {
        await this.joinChannel(message.channel);
      } catch (err) {
        // Continue even if join fails - might be a private channel where we're already a member
      }

      return await this.callProxyApi('chat.postMessage', 'POST', message);
    } catch (error) {
      console.error('Error sending message to Slack:', error);
      throw error;
    }
  }

  async listChannels(): Promise<SlackChannel[]> {
    try {
      const result = await this.callProxyApi('conversations.list', 'GET');

      return (result.channels || []).map((channel: any) => ({
        id: channel.id,
        name: channel.name
      }));
    } catch (error) {
      console.error('Error listing Slack channels:', error);
      throw error;
    }
  }

  // Upload file method using external upload route
}