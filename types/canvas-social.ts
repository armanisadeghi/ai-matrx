// Canvas Social System Types

export type CanvasVisibility = "public" | "unlisted" | "private";

export type CanvasType =
  | "quiz"
  | "flashcards"
  | "flashcard"
  | "game"
  | "diagram"
  | "mermaid"
  | "timeline"
  | "comparison"
  | "decision-tree"
  | "troubleshooting"
  | "research"
  | "progress"
  | "presentation"
  | "resources"
  | "recipe"
  | "math_problem"
  | "iframe"
  | "html"
  | "code"
  | "image"
  | "other";

export interface SharedCanvasItem {
  id: string;
  share_token: string;

  // Content
  title: string;
  description: string | null;
  canvas_type: CanvasType;
  canvas_data: any; // Canvas-specific data
  thumbnail_url: string | null;

  // Creator
  created_by: string | null;
  creator_username: string | null;
  creator_display_name: string | null;

  // Versioning
  original_id: string | null;
  forked_from: string | null;
  version_number: number;
  fork_count: number;

  // Social Stats
  view_count: number;
  like_count: number;
  share_count: number;
  comment_count: number;
  play_count: number;
  completion_rate: number | null;

  // Gamification
  has_scoring: boolean;
  high_score: number | null;
  high_score_user: string | null;
  average_score: number | null;
  total_attempts: number;

  // Settings
  visibility: CanvasVisibility;
  allow_remixes: boolean;
  require_attribution: boolean;
  featured: boolean;

  // Tags
  tags: string[];
  categories: string[];

  // Metadata
  created_at: string;
  updated_at: string;
  published_at: string | null;
  last_played_at: string | null;
  trending_score: number;
}

export interface CanvasLike {
  id: string;
  canvas_id: string;
  user_id: string;
  created_at: string;
}

export interface CanvasComment {
  id: string;
  canvas_id: string;
  user_id: string | null;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  parent_comment_id: string | null;
  like_count: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
  edited: boolean;
  deleted: boolean;

  // For nested comments
  replies?: CanvasComment[];
}

export interface CanvasScore {
  id: string;
  canvas_id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  score: number;
  max_score: number;
  percentage: number;
  time_taken: number | null;
  completed: boolean;
  attempt_number: number;
  created_at: string;
  data: any;
}

export interface CanvasView {
  id: string;
  canvas_id: string;
  user_id: string | null;
  viewed_at: string;
  session_id: string | null;
  referrer: string | null;
  time_spent: number | null;
  completed: boolean;
  interacted: boolean;
}

export interface UserStats {
  user_id: string;
  total_created: number;
  total_likes_received: number;
  total_views_received: number;
  total_forks_received: number;
  total_plays: number;
  total_likes_given: number;
  total_comments: number;
  average_score: number | null;
  total_high_scores: number;
  best_score: number | null;
  follower_count: number;
  following_count: number;
  total_xp: number;
  level: number;
  streak_days: number;
  last_active_date: string | null;
  longest_streak: number;
  updated_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_type: AchievementType;
  achievement_data: any;
  unlocked_at: string;
}

export type AchievementType =
  // Creator
  | "first_creation"
  | "viral_creator"
  | "top_creator"
  | "hall_of_fame"
  | "perfectionist"
  | "remix_master"
  // Player
  | "first_play"
  | "high_scorer"
  | "champion"
  | "streak_master"
  | "completionist"
  | "speed_demon"
  // Social
  | "conversationalist"
  | "supporter"
  | "popular"
  | "connector"
  // Special
  | "early_adopter"
  | "beta_tester"
  | "community_hero";

export interface Achievement {
  type: AchievementType;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  requirement: {
    type: string;
    count: number;
  };
}

export interface UserFollow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface UserBookmark {
  id: string;
  user_id: string;
  canvas_id: string;
  created_at: string;
}

// Request/Response types
export interface CreateShareRequest {
  canvas_data: any;
  title: string;
  description?: string;
  canvas_type: CanvasType;
  /** Optional cover image URL used for Open Graph / social share previews */
  thumbnail_url?: string | null;
  visibility?: CanvasVisibility;
  allow_remixes?: boolean;
  require_attribution?: boolean;
  has_scoring?: boolean;
  tags?: string[];
  categories?: string[];
}

export interface CreateShareResponse {
  canvas: SharedCanvasItem;
  share_url: string;
  share_token: string;
}

export interface ForkCanvasRequest {
  canvas_id: string;
  title?: string;
  description?: string;
  modifications?: any;
}

export interface ForkCanvasResponse {
  canvas: SharedCanvasItem;
  share_url: string;
  share_token: string;
}

export interface SubmitScoreRequest {
  canvas_id: string;
  score: number;
  max_score: number;
  time_taken?: number;
  completed: boolean;
  data?: any;
}

export interface SubmitScoreResponse {
  score: CanvasScore;
  rank: number;
  is_high_score: boolean;
  is_personal_best: boolean;
  xp_earned: number;
  achievements_unlocked: AchievementType[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  time_taken: number | null;
  created_at: string;
  is_current_user: boolean;
}

export interface TrendingParams {
  limit?: number;
  offset?: number;
  canvas_type?: CanvasType;
  tags?: string[];
  timeframe?: "day" | "week" | "month" | "all";
}

export interface FeedParams {
  limit?: number;
  cursor?: string;
  filter?: "following" | "trending" | "discover" | "top";
}

// XP Rewards
export const XP_REWARDS = {
  create_canvas: 50,
  play_canvas: 5,
  complete_canvas: 10,
  like_canvas: 1,
  comment: 5,
  share: 10,
  fork: 20,
  get_like: 2,
  get_fork: 25,
  get_top_score: 50,
  daily_streak: 10,
  achievement: 100,
} as const;

// Level thresholds
export const LEVEL_THRESHOLDS = [
  0, // Level 1
  100, // Level 2
  250, // Level 3
  500, // Level 4
  1000, // Level 5
  2000, // Level 6
  3500, // Level 7
  5000, // Level 8
  7500, // Level 9
  10000, // Level 10
  // Continue exponentially
];

export function calculateLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      return i + 1;
    }
  }
  return 1;
}

export function getXPForNextLevel(currentLevel: number): number {
  return (
    LEVEL_THRESHOLDS[currentLevel] ||
    LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] * 2
  );
}

export function getXPProgress(
  currentXP: number,
  currentLevel: number,
): {
  current: number;
  required: number;
  percentage: number;
} {
  const levelStart = LEVEL_THRESHOLDS[currentLevel - 1] || 0;
  const levelEnd = getXPForNextLevel(currentLevel);
  const current = currentXP - levelStart;
  const required = levelEnd - levelStart;
  const percentage = (current / required) * 100;

  return { current, required, percentage };
}

// Achievement definitions
export const ACHIEVEMENTS: Record<AchievementType, Achievement> = {
  first_creation: {
    type: "first_creation",
    name: "Creator",
    description: "Create your first canvas",
    icon: "🎨",
    xp_reward: 50,
    requirement: { type: "create", count: 1 },
  },
  viral_creator: {
    type: "viral_creator",
    name: "Viral Creator",
    description: "Get 1,000+ views on a canvas",
    icon: "🔥",
    xp_reward: 200,
    requirement: { type: "views", count: 1000 },
  },
  top_creator: {
    type: "top_creator",
    name: "Top Creator",
    description: "Get 100+ likes on a canvas",
    icon: "⭐",
    xp_reward: 150,
    requirement: { type: "likes", count: 100 },
  },
  hall_of_fame: {
    type: "hall_of_fame",
    name: "Hall of Fame",
    description: "Get 10,000+ views total",
    icon: "🏆",
    xp_reward: 500,
    requirement: { type: "total_views", count: 10000 },
  },
  perfectionist: {
    type: "perfectionist",
    name: "Perfectionist",
    description: "Create 10 canvases with 100% completion rate",
    icon: "💯",
    xp_reward: 300,
    requirement: { type: "perfect_canvases", count: 10 },
  },
  remix_master: {
    type: "remix_master",
    name: "Remix Master",
    description: "Have your canvas forked 50+ times",
    icon: "🍴",
    xp_reward: 250,
    requirement: { type: "forks", count: 50 },
  },
  first_play: {
    type: "first_play",
    name: "Player One",
    description: "Play your first canvas",
    icon: "🎮",
    xp_reward: 25,
    requirement: { type: "play", count: 1 },
  },
  high_scorer: {
    type: "high_scorer",
    name: "High Scorer",
    description: "Get in the top 10 of any leaderboard",
    icon: "🎯",
    xp_reward: 100,
    requirement: { type: "top_10", count: 1 },
  },
  champion: {
    type: "champion",
    name: "Champion",
    description: "Get #1 on 3+ leaderboards",
    icon: "👑",
    xp_reward: 300,
    requirement: { type: "first_place", count: 3 },
  },
  streak_master: {
    type: "streak_master",
    name: "Streak Master",
    description: "Maintain a 7+ day streak",
    icon: "🔥",
    xp_reward: 150,
    requirement: { type: "streak", count: 7 },
  },
  completionist: {
    type: "completionist",
    name: "Completionist",
    description: "Complete 50+ canvases",
    icon: "✅",
    xp_reward: 200,
    requirement: { type: "completed", count: 50 },
  },
  speed_demon: {
    type: "speed_demon",
    name: "Speed Demon",
    description: "Set a top 3 speed record",
    icon: "⚡",
    xp_reward: 150,
    requirement: { type: "speed_record", count: 1 },
  },
  conversationalist: {
    type: "conversationalist",
    name: "Conversationalist",
    description: "Leave 100+ comments",
    icon: "💬",
    xp_reward: 100,
    requirement: { type: "comments", count: 100 },
  },
  supporter: {
    type: "supporter",
    name: "Supporter",
    description: "Give 500+ likes",
    icon: "❤️",
    xp_reward: 100,
    requirement: { type: "likes_given", count: 500 },
  },
  popular: {
    type: "popular",
    name: "Popular",
    description: "Get 100+ followers",
    icon: "🌟",
    xp_reward: 200,
    requirement: { type: "followers", count: 100 },
  },
  connector: {
    type: "connector",
    name: "Connector",
    description: "Successfully challenge 10+ friends",
    icon: "🤝",
    xp_reward: 150,
    requirement: { type: "challenges", count: 10 },
  },
  early_adopter: {
    type: "early_adopter",
    name: "Early Adopter",
    description: "Join during beta",
    icon: "🚀",
    xp_reward: 500,
    requirement: { type: "special", count: 1 },
  },
  beta_tester: {
    type: "beta_tester",
    name: "Beta Tester",
    description: "Report 5+ bugs during beta",
    icon: "🐛",
    xp_reward: 300,
    requirement: { type: "special", count: 1 },
  },
  community_hero: {
    type: "community_hero",
    name: "Community Hero",
    description: "Contribute to the community",
    icon: "🦸",
    xp_reward: 1000,
    requirement: { type: "special", count: 1 },
  },
};
