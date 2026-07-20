# Canvas Social Sharing & Gamification System 🎮
## The Ultimate Viral Content Platform

---

## 🎯 Vision

Create a **viral sharing ecosystem** where users can:
1. **Create** interactive content (quizzes, flashcards, games, diagrams)
2. **Share** with unique URLs (like Wordle, Minesweeper)
3. **Remix/Fork** others' content with full attribution
4. **Compete** on leaderboards for scored content
5. **Discover** trending content through social features
6. **Tag & Challenge** friends
7. **Earn Recognition** through likes, shares, and high scores

---

## 🏗️ System Architecture

### Core Components

#### 1. **Shareable Canvas Items**
- Every canvas (quiz, flashcard, game, diagram) gets a unique shareable URL
- Public vs Private visibility settings
- Fork/Remix tracking with version tree
- Original creator attribution
- License settings (allow remixes, require attribution)

#### 2. **Social Features**
- ❤️ Likes/Hearts
- 🔄 Shares/Reposts
- 💬 Comments
- 🏷️ Tags
- 👥 User mentions
- 📊 View counts
- ⭐ Favorites/Bookmarks

#### 3. **Gamification System**
- 🏆 Leaderboards (global, friends, weekly)
- 🎯 Achievements/Badges
- 📈 Score tracking
- 🔥 Streak tracking
- 👑 Creator rankings
- 🎖️ Skill ratings

#### 4. **Discovery & Trending**
- 🔥 Trending algorithm (views + likes + recency)
- 📅 Daily/Weekly/Monthly top content
- 🎲 Random discovery
- 🔍 Search & filters
- 📱 Feed (following, discover, trending)
- 🏷️ Tag-based discovery

#### 5. **Version Control & Attribution**
- 🌳 Fork tree visualization
- 📜 Version history
- 👤 Credit chain (original → forks)
- 📊 Fork statistics
- 🎨 Highlight improvements

---

## 📊 Database Schema

### Tables

#### `shared_canvas_items`
```sql
CREATE TABLE shared_canvas_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    share_token TEXT UNIQUE NOT NULL, -- URL-safe token
    
    -- Content
    title TEXT NOT NULL,
    description TEXT,
    canvas_type TEXT NOT NULL, -- 'quiz', 'flashcard', 'game', 'diagram', etc.
    canvas_data JSONB NOT NULL, -- Full canvas content
    thumbnail_url TEXT,
    
    -- Creator
    created_by UUID REFERENCES auth.users(id),
    creator_username TEXT,
    creator_display_name TEXT,
    
    -- Versioning
    original_id UUID REFERENCES shared_canvas_items(id), -- NULL if original
    forked_from UUID REFERENCES shared_canvas_items(id), -- Direct parent
    version_number INTEGER DEFAULT 1,
    fork_count INTEGER DEFAULT 0,
    
    -- Social Stats
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    play_count INTEGER DEFAULT 0, -- For games/quizzes
    completion_rate DECIMAL(5,2), -- Average completion %
    
    -- Gamification (for scored content)
    has_scoring BOOLEAN DEFAULT false,
    high_score INTEGER,
    high_score_user UUID REFERENCES auth.users(id),
    average_score DECIMAL(8,2),
    total_attempts INTEGER DEFAULT 0,
    
    -- Visibility & Settings
    visibility TEXT DEFAULT 'public', -- 'public', 'unlisted', 'private'
    allow_remixes BOOLEAN DEFAULT true,
    require_attribution BOOLEAN DEFAULT true,
    featured BOOLEAN DEFAULT false,
    
    -- Tags & Categories
    tags TEXT[] DEFAULT '{}',
    categories TEXT[] DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    
    -- Trending Score (calculated field)
    trending_score DECIMAL(10,2) DEFAULT 0,
    
    -- Search
    search_vector tsvector
);

-- Indexes
CREATE INDEX idx_shared_canvas_token ON shared_canvas_items(share_token);
CREATE INDEX idx_shared_canvas_creator ON shared_canvas_items(created_by);
CREATE INDEX idx_shared_canvas_original ON shared_canvas_items(original_id);
CREATE INDEX idx_shared_canvas_type ON shared_canvas_items(canvas_type);
CREATE INDEX idx_shared_canvas_trending ON shared_canvas_items(trending_score DESC);
CREATE INDEX idx_shared_canvas_tags ON shared_canvas_items USING GIN(tags);
CREATE INDEX idx_shared_canvas_search ON shared_canvas_items USING GIN(search_vector);
```

#### `canvas_likes`
```sql
CREATE TABLE canvas_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID REFERENCES shared_canvas_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(canvas_id, user_id)
);

CREATE INDEX idx_canvas_likes_canvas ON canvas_likes(canvas_id);
CREATE INDEX idx_canvas_likes_user ON canvas_likes(user_id);
```

#### `canvas_scores`
```sql
CREATE TABLE canvas_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID REFERENCES shared_canvas_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    username TEXT,
    
    -- Score Data
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    percentage DECIMAL(5,2),
    time_taken INTEGER, -- seconds
    
    -- Context
    completed BOOLEAN DEFAULT false,
    attempt_number INTEGER DEFAULT 1,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    data JSONB -- Additional game-specific data
);

CREATE INDEX idx_canvas_scores_canvas ON canvas_scores(canvas_id);
CREATE INDEX idx_canvas_scores_user ON canvas_scores(user_id);
CREATE INDEX idx_canvas_scores_leaderboard ON canvas_scores(canvas_id, score DESC);
```

#### `canvas_comments`
```sql
CREATE TABLE canvas_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID REFERENCES shared_canvas_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    username TEXT NOT NULL,
    
    -- Comment Data
    content TEXT NOT NULL,
    parent_comment_id UUID REFERENCES canvas_comments(id), -- For replies
    
    -- Social
    like_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted BOOLEAN DEFAULT false
);

CREATE INDEX idx_canvas_comments_canvas ON canvas_comments(canvas_id);
CREATE INDEX idx_canvas_comments_user ON canvas_comments(user_id);
```

#### `canvas_views`
```sql
CREATE TABLE canvas_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID REFERENCES shared_canvas_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id), -- NULL for anonymous
    
    -- View Data
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    session_id TEXT,
    referrer TEXT,
    
    -- Engagement
    time_spent INTEGER, -- seconds
    completed BOOLEAN DEFAULT false
);

CREATE INDEX idx_canvas_views_canvas ON canvas_views(canvas_id);
CREATE INDEX idx_canvas_views_date ON canvas_views(viewed_at);
```

#### `user_achievements`
```sql
CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    achievement_type TEXT NOT NULL, -- 'quiz_master', 'creator', 'viral', etc.
    achievement_data JSONB,
    
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, achievement_type)
);
```

#### `user_stats`
```sql
CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Creation Stats
    total_created INTEGER DEFAULT 0,
    total_likes_received INTEGER DEFAULT 0,
    total_views_received INTEGER DEFAULT 0,
    total_forks_received INTEGER DEFAULT 0,
    
    -- Engagement Stats
    total_plays INTEGER DEFAULT 0,
    total_likes_given INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    
    -- Scores
    average_score DECIMAL(8,2),
    total_high_scores INTEGER DEFAULT 0, -- Times had #1 score
    
    -- Social
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    
    -- Gamification
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak_days INTEGER DEFAULT 0,
    last_active_date DATE,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🎨 User Interface Components

### 1. **Share Modal/Sheet**
Component: `CanvasShareSheet.tsx`
- 🔗 Generate shareable link
- 📋 Copy link button
- 🎨 Social media share buttons (Twitter, Facebook, LinkedIn)
- 👥 Direct share to users
- ⚙️ Settings: visibility, allow remixes, require attribution
- 📊 View share stats

### 2. **Canvas Gallery/Discover Page**
Route: `/canvas/discover`
Component: `CanvasDiscoverPage.tsx`
- 🔥 Trending section
- 📅 New releases
- 🏆 Top rated
- 🎲 Random discovery
- 🔍 Search & filters
- 🏷️ Browse by tags/categories
- 📱 Infinite scroll grid

### 3. **Canvas Detail Page**
Route: `/canvas/shared/[token]`
Component: `SharedCanvasPage.tsx`
- 🎮 Interactive canvas player
- 👤 Creator info card
- 📊 Stats (views, likes, plays)
- ❤️ Like button
- 🔄 Share/Fork buttons
- 💬 Comments section
- 🏆 Leaderboard (if scored)
- 🌳 Fork tree visualization
- 🏷️ Tags
- 📱 Related content

### 4. **Leaderboard Component**
Component: `CanvasLeaderboard.tsx`
- 🏆 Top scores
- 👑 User rankings
- 📊 Stats comparison
- ⏱️ Time filters (all-time, weekly, daily)
- 🎯 Your rank highlight
- 👥 Friends filter

### 5. **Fork Tree Visualization**
Component: `ForkTreeView.tsx`
- 🌳 Interactive tree diagram
- 👤 Creator attribution chain
- 📊 Stats per version
- 🎨 Visual improvements highlight
- 🔗 Navigate between versions

### 6. **User Profile Page**
Route: `/canvas/creator/[username]`
Component: `CreatorProfilePage.tsx`
- 👤 Profile info & avatar
- 📊 Creator stats
- 🎨 Created content grid
- 🏆 Achievements & badges
- 📈 Activity graph
- 👥 Followers/Following
- ❤️ Liked content

### 7. **Feed Component**
Component: `CanvasFeed.tsx`
- 📱 Infinite scroll feed
- 🔥 Trending
- 👥 Following
- 🎲 Discover
- 💬 Activity (comments, likes)
- 🎮 Quick play cards

### 8. **Quick Action Bar** (on canvases)
Component: `CanvasSocialActions.tsx`
- ❤️ Like button (with count)
- 🔄 Share button
- 💬 Comment button
- 🔖 Bookmark button
- 🍴 Fork button
- 📊 Stats button

---

## 🔥 Trending Algorithm

```typescript
// Trending score calculation
function calculateTrendingScore(item: SharedCanvasItem): number {
    const now = Date.now();
    const ageInHours = (now - item.created_at.getTime()) / (1000 * 60 * 60);
    
    // Decay factor - newer content gets boost
    const decayFactor = Math.pow(0.8, ageInHours / 24); // 80% decay per day
    
    // Engagement score
    const engagementScore = (
        item.like_count * 3 +
        item.play_count * 2 +
        item.comment_count * 5 +
        item.share_count * 10 +
        item.fork_count * 15 +
        item.view_count * 0.1
    );
    
    // Quality multiplier (completion rate, average score)
    const qualityMultiplier = 1 + (item.completion_rate || 0) / 100;
    
    // Featured boost
    const featuredBoost = item.featured ? 2 : 1;
    
    return engagementScore * decayFactor * qualityMultiplier * featuredBoost;
}
```

---

## 🎮 Gamification System

### Achievement Types

1. **Creator Achievements**
   - 🎨 First Creation
   - 🔥 Viral Creator (1K+ views)
   - 🌟 Top Creator (100+ likes)
   - 🏆 Hall of Fame (10K+ views)
   - 🎯 Perfectionist (10 items with 100% completion)

2. **Player Achievements**
   - 🎮 First Play
   - 🏆 High Scorer (Top 10 in any board)
   - 👑 Champion (3+ #1 scores)
   - 🔥 Streak Master (7+ day streak)
   - 🎯 Completionist (50+ items completed)

3. **Social Achievements**
   - 💬 Conversationalist (100+ comments)
   - ❤️ Supporter (500+ likes given)
   - 👥 Popular (100+ followers)
   - 🤝 Connector (10+ successful tags)

### XP System

```typescript
const XP_REWARDS = {
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
    daily_streak: 10
};
```

### Levels

- Level 1-10: Beginner (0-1000 XP)
- Level 11-25: Intermediate (1000-5000 XP)
- Level 26-50: Advanced (5000-15000 XP)
- Level 51-100: Expert (15000+ XP)

---

## 📱 User Flows

### Flow 1: Creating & Sharing
1. User creates quiz/flashcard in canvas
2. Clicks "Share" button
3. Modal opens with share options
4. Generates unique URL
5. Copy link or share to social
6. Content appears in public gallery

### Flow 2: Discovering & Playing
1. User visits discover page
2. Sees trending quizzes
3. Clicks to play
4. Completes quiz
5. Sees score & leaderboard
6. Option to like, comment, fork

### Flow 3: Remixing
1. User finds quiz they like
2. Clicks "Fork/Remix"
3. Opens in editor with original content
4. Makes improvements
5. Publishes with attribution
6. Original creator gets notification
7. Fork appears in version tree

### Flow 4: Competition
1. User plays scored quiz
2. Achieves high score
3. Automatically enters leaderboard
4. Can tag friends to challenge
5. Friends receive notification
6. Compete for #1 spot
7. Winner gets achievement

---

## 🔐 Security & Privacy

### Considerations
- ✅ Anonymous viewing allowed
- ✅ Auth required for: likes, comments, scoring
- ✅ Rate limiting on API endpoints
- ✅ Content moderation flags
- ✅ Report abuse system
- ✅ Privacy settings per item
- ✅ DMCA compliance for content
- ✅ Age restrictions for certain content

---

## 📈 Analytics & Insights

### For Creators
- 📊 View/play trends over time
- 🌍 Geographic distribution
- 👥 Audience demographics
- 🔥 Peak engagement times
- 🎯 Completion funnels
- 💡 Improvement suggestions

### For Platform
- 📈 Growth metrics
- 🎯 Retention rates
- 🔥 Viral coefficients
- 💰 Engagement metrics
- 🏆 Top performers
- 🎮 Content type popularity

---

## 🚀 Implementation Priority

### Phase 1: Core Sharing (Week 1)
- [ ] Database schema
- [ ] Share modal/URL generation
- [ ] Public canvas viewer
- [ ] Basic social actions (like, view count)

### Phase 2: Discovery (Week 2)
- [ ] Gallery/discover page
- [ ] Search & filters
- [ ] Trending algorithm
- [ ] Tag system

### Phase 3: Social Features (Week 3)
- [ ] Comments system
- [ ] User profiles
- [ ] Following system
- [ ] Feed

### Phase 4: Gamification (Week 4)
- [ ] Leaderboards
- [ ] Achievements
- [ ] XP/Level system
- [ ] Streak tracking

### Phase 5: Versioning (Week 5)
- [ ] Fork/remix functionality
- [ ] Version tree visualization
- [ ] Attribution system
- [ ] Fork stats

### Phase 6: Polish (Week 6)
- [ ] Analytics dashboard
- [ ] Mobile optimization
- [ ] Performance optimization
- [ ] Content moderation

---

## 🎯 Success Metrics

### Key Performance Indicators

1. **Engagement**
   - Daily Active Users (DAU)
   - Average time spent
   - Play-through rate
   - Return rate

2. **Social**
   - Shares per item
   - Likes per item
   - Comments per item
   - Fork rate

3. **Growth**
   - New creators per week
   - New content per day
   - Viral coefficient (shares/user)
   - Retention rate

4. **Quality**
   - Average completion rate
   - Content quality score
   - User satisfaction rating

---

## 💻 Technical Stack

### Frontend
- Next.js 15 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Shadcn UI
- React Query (data fetching)
- Zustand (client state)

### Backend
- Supabase (database and auth) plus the canonical S3-backed file system
- PostgreSQL (main database)
- Redis (caching, rate limiting)
- Edge Functions (API routes)

### Services
- Vercel (hosting)
- Cloudflare (CDN)
- Upstash (Redis)
- Sentry (error tracking)

---

## 🎨 Design Principles

1. **Make Sharing Effortless** - One-click share
2. **Attribution Always** - Credit creators prominently
3. **Gamify Everything** - Make it fun and competitive
4. **Mobile-First** - Optimized for sharing on phones
5. **Fast & Smooth** - Instant feedback, smooth animations
6. **Discoverable** - Easy to find great content
7. **Social** - Encourage interaction and community

---

## 🔮 Future Ideas

- AI-generated content suggestions
- Collaborative canvas creation
- Live multiplayer modes
- Creator monetization
- Premium features
- Branded content partnerships
- Educational institution integration
- API for third-party integrations
- Mobile apps (iOS/Android)
- Browser extension for quick share

---

## 📝 Notes for Implementation

- Use optimistic updates for instant feedback
- Implement infinite scroll everywhere
- Cache trending data (5-minute refresh)
- Lazy load images and heavy components
- Implement PWA features for mobile
- Add meta tags for social previews
- Implement OpenGraph for link previews
- Use WebSockets for real-time updates
- Implement analytics from day 1
- Build with accessibility in mind (ARIA)

---

This is the complete vision. Now let's build it! 🚀
