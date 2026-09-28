-- Add priority and assignee_id columns to tasks table
-- Run this migration in your Supabase SQL Editor

-- 1. Add priority column with enum type
DO $$ 
BEGIN
  -- Create priority enum type if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

-- 2. Add priority column to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS priority task_priority NULL;

-- 3. Add assignee_id column to tasks table
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS assignee_id UUID NULL;

-- 4. Add foreign key constraint for assignee_id (references iam.users)
-- This ensures the assignee is a valid user
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tasks_assignee_id_fkey' 
    AND table_name = 'tasks'
  ) THEN
    ALTER TABLE tasks
    ADD CONSTRAINT tasks_assignee_id_fkey 
    FOREIGN KEY (assignee_id) 
    REFERENCES iam.users(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- 5. Create index for faster assignee queries
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id 
ON tasks(assignee_id);

-- 6. Create index for faster priority queries
CREATE INDEX IF NOT EXISTS idx_tasks_priority 
ON tasks(priority);

-- 7. Create task_comments table for activity tracking
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES iam.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create index for faster comment queries
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id 
ON task_comments(task_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_created_at 
ON task_comments(created_at DESC);

-- 9. Enable RLS on task_comments
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

-- 10. Create RLS policies for task_comments
-- Users can view comments on tasks they own or are assigned to
CREATE POLICY "Users can view comments on their tasks" 
ON task_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks 
    WHERE tasks.id = task_comments.task_id 
    AND (tasks.user_id = auth.uid() OR tasks.assignee_id = auth.uid())
  )
);

-- Users can create comments on tasks they own or are assigned to
CREATE POLICY "Users can create comments on their tasks" 
ON task_comments FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tasks 
    WHERE tasks.id = task_comments.task_id 
    AND (tasks.user_id = auth.uid() OR tasks.assignee_id = auth.uid())
  )
  AND user_id = auth.uid()
);

-- Users can update their own comments
CREATE POLICY "Users can update their own comments" 
ON task_comments FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments" 
ON task_comments FOR DELETE
USING (user_id = auth.uid());

-- 11. Add updated_at trigger for task_comments
CREATE OR REPLACE FUNCTION update_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_comments_updated_at ON task_comments;
CREATE TRIGGER task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_task_comments_updated_at();

-- 12. Update existing tasks RLS policies to include assignee access (if needed)
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own tasks and assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Users can update their own tasks and assigned tasks" ON tasks;

-- Recreate policies with assignee support
CREATE POLICY "Users can view their own tasks and assigned tasks" 
ON tasks FOR SELECT
USING (user_id = auth.uid() OR assignee_id = auth.uid());

CREATE POLICY "Users can update their own tasks and assigned tasks" 
ON tasks FOR UPDATE
USING (user_id = auth.uid() OR assignee_id = auth.uid())
WITH CHECK (user_id = auth.uid() OR assignee_id = auth.uid());

-- Migration complete!
-- Summary:
-- ✅ Added priority column (low, medium, high)
-- ✅ Added assignee_id column with foreign key to users
-- ✅ Created task_comments table
-- ✅ Added indexes for performance
-- ✅ Set up RLS policies
-- ✅ Updated tasks RLS policies to include assignee access

