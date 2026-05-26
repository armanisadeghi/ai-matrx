// Base OAuth response with common fields
export interface OAuthBaseResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

// Slack-specific types
export interface SlackTokenResponse extends OAuthBaseResponse {
  ok: boolean;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: SlackTeam;
  authed_user: SlackUser;
  error?: string;
}

// Slack channel type
export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_member?: boolean;
  topic?: {
    value: string;
  };
  purpose?: {
    value: string;
  };
  num_members?: number;
  created?: number;
}

// Enhanced Slack user type
export interface SlackUser {
  id: string;
  name?: string;
  real_name?: string;
  email?: string;
  is_bot?: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
  profile?: {
    image_24?: string;
    image_48?: string;
    image_72?: string;
    status_text?: string;
    status_emoji?: string;
    display_name?: string;
    real_name?: string;
    email?: string;
    phone?: string;
  };
  team_id?: string;
  updated?: number;
}

// Slack message type
export interface SlackMessage {
  type: string;
  user: string;
  text: string;
  ts: string;
  bot_id?: string;
  team?: string;
  attachments?: SlackAttachment[];
  files?: SlackFile[];
  reactions?: SlackReaction[];
  thread_ts?: string;
  reply_count?: number;
  edited?: {
    user: string;
    ts: string;
  };
}

// Slack attachment type
export interface SlackAttachment {
  fallback: string;
  text?: string;
  pretext?: string;
  title?: string;
  title_link?: string;
  image_url?: string;
  thumb_url?: string;
  color?: string;
  fields?: {
    title: string;
    value: string;
    short: boolean;
  }[];
}

// Slack file type
export interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_360_w?: number;
  thumb_360_h?: number;
}

// Slack reaction type
export interface SlackReaction {
  name: string;
  users: string[];
  count: number;
}

export interface SlackTeam {
  id: string;
  name: string;
  domain?: string;
}

// Provider configuration for UI
export interface OAuthProviderConfig {
  name: string;
  clientId: string | undefined;
  authUrl: string;
  redirectUri: string;
  scopes: string[];
  scopeDelimiter: string;
  color: string;
  textColor?: string;
  additionalParams?: Record<string, string>;
  iconSvg: React.ReactElement;
}

// Provider state information
export interface ProviderState {
  isLoading: boolean;
  isConnected: boolean;
  token: string | null;
  data: any | null;
  error: string | null;
}

// Slack channel type with additional fields
export interface EnhancedSlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_member?: boolean;
  is_archived?: boolean;
  is_general?: boolean;
  topic?: {
    value: string;
    creator?: string;
    last_set?: number;
  };
  purpose?: {
    value: string;
    creator?: string;
    last_set?: number;
  };
  num_members?: number;
  created?: number;
  creator?: string;
  is_starred?: boolean;
  unread_count?: number;
  members?: string[];
}

// Enhanced Slack user type
export interface EnhancedSlackUser {
  id: string;
  name?: string;
  real_name?: string;
  email?: string;
  is_bot?: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
  is_primary_owner?: boolean;
  is_restricted?: boolean;
  is_ultra_restricted?: boolean;
  is_app_user?: boolean;
  updated?: number;
  has_2fa?: boolean;
  tz?: string;
  tz_label?: string;
  tz_offset?: number;
  profile?: {
    avatar_hash?: string;
    status_text?: string;
    status_emoji?: string;
    real_name?: string;
    display_name?: string;
    real_name_normalized?: string;
    display_name_normalized?: string;
    email?: string;
    image_24?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    image_192?: string;
    image_512?: string;
    team?: string;
    title?: string;
    phone?: string;
    skype?: string;
  };
  team_id?: string;
  color?: string;
}

// Enhanced Slack message type
export interface EnhancedSlackMessage {
  type: string;
  subtype?: string;
  user?: string;
  text: string;
  ts: string;
  bot_id?: string;
  team?: string;
  client_msg_id?: string;
  attachments?: SlackAttachment[];
  files?: SlackFile[];
  reactions?: SlackReaction[];
  thread_ts?: string;
  reply_count?: number;
  reply_users_count?: number;
  reply_users?: string[];
  latest_reply?: string;
  is_locked?: boolean;
  subscribed?: boolean;
  edited?: {
    user: string;
    ts: string;
  };
  blocks?: any[]; // Slack Block Kit blocks
  pinned_to?: string[];
  permalink?: string;
  is_starred?: boolean;
  app_id?: string;
  username?: string; // For messages from integrations
  icons?: {
    emoji?: string;
    image_64?: string;
  };
}

// Slack file type with expanded fields
export interface EnhancedSlackFile {
  id: string;
  created: number;
  timestamp: number;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  pretty_type: string;
  user: string;
  user_team?: string;
  editable?: boolean;
  size: number;
  mode: string;
  is_external?: boolean;
  external_type?: string;
  is_public?: boolean;
  public_url_shared?: boolean;
  display_as_bot?: boolean;
  username?: string;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  permalink_public?: string;
  edit_link?: string;
  preview?: string;
  preview_highlight?: string;
  lines?: number;
  lines_more?: number;
  is_truncated?: boolean;
  preview_is_truncated?: boolean;
  thumb_64?: string;
  thumb_80?: string;
  thumb_160?: string;
  thumb_360?: string;
  thumb_360_w?: number;
  thumb_360_h?: number;
  thumb_480?: string;
  thumb_480_w?: number;
  thumb_480_h?: number;
  thumb_720?: string;
  thumb_720_w?: number;
  thumb_720_h?: number;
  thumb_960?: string;
  thumb_960_w?: number;
  thumb_960_h?: number;
  thumb_1024?: string;
  thumb_1024_w?: number;
  thumb_1024_h?: number;
  original_w?: number;
  original_h?: number;
  thumb_tiny?: string;
  has_rich_preview?: boolean;
}

// Slack attachment for messages
export interface SlackAttachment {
  fallback: string;
  text?: string;
  pretext?: string;
  title?: string;
  title_link?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  image_url?: string;
  image_width?: number;
  image_height?: number;
  image_bytes?: number;
  thumb_url?: string;
  video_html?: string;
  video_html_width?: number;
  video_html_height?: number;
  footer?: string;
  footer_icon?: string;
  ts?: string;
  color?: string;
  fields?: {
    title: string;
    value: string;
    short: boolean;
  }[];
  actions?: any[]; // Interactive message actions
  callback_id?: string;
  mrkdwn_in?: string[];
}

// Slack file type for messages
export interface SlackFile {
  id: string;
  name: string;
  title: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  thumb_64?: string;
  thumb_80?: string;
  thumb_360?: string;
  thumb_360_w?: number;
  thumb_360_h?: number;
}

// Slack reaction type
export interface SlackReaction {
  name: string;
  users: string[];
  count: number;
}

// Slack API response for channels list
export interface SlackChannelsListResponse {
  ok: boolean;
  channels: EnhancedSlackChannel[];
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
}

// Slack API response for users list
export interface SlackUsersListResponse {
  ok: boolean;
  members: EnhancedSlackUser[];
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
}

// Slack API response for messages history
export interface SlackMessagesHistoryResponse {
  ok: boolean;
  messages: EnhancedSlackMessage[];
  has_more?: boolean;
  pin_count?: number;
  channel_actions_count?: number;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
}

// Slack API response for message post
export interface SlackPostMessageResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message: EnhancedSlackMessage;
  error?: string;
}