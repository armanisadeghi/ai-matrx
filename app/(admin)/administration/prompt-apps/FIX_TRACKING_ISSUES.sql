-- ============================================================================
-- PROMPT APPS TRACKING FIXES
-- ============================================================================
-- Run this entire script in one go in Supabase SQL Editor
-- It will fix:
-- 1. Success rate double multiplication (10000% → 100%)
-- 2. Execution metrics not being recorded (time, tokens, cost)
-- 3. Errors not being tracked on failures
-- 4. Existing data cleanup
-- ============================================================================

-- ============================================================================
-- FIX 1: Success Rate Double Multiplication
-- ============================================================================

-- Drop and recreate the trigger function WITHOUT the * 100
-- (The view already multiplies by 100, so we don't need to do it twice)
CREATE OR REPLACE FUNCTION update_app_success_rate()
RETURNS TRIGGER AS $$
DECLARE
  success_count INTEGER;
  total_count INTEGER;
  rate DECIMAL(5,2);
BEGIN
  -- Calculate success rate for this app
  SELECT 
    COUNT(*) FILTER (WHERE success = true),
    COUNT(*)
  INTO success_count, total_count
  FROM prompt_app_executions
  WHERE app_id = NEW.app_id;
  
  IF total_count > 0 THEN
    -- Store as decimal (0.0 to 1.0), view will multiply by 100 for display
    rate := (success_count::DECIMAL / total_count);
    
    UPDATE prompt_apps
    SET success_rate = rate
    WHERE id = NEW.app_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix existing success_rate data (divide by 100 to get decimal)
UPDATE prompt_apps
SET success_rate = success_rate / 100
WHERE success_rate > 1;

-- ============================================================================
-- FIX 2: Link ai_tasks completion to prompt_app_executions
-- ============================================================================

-- Create trigger that updates prompt_app_executions when ai_tasks completes
CREATE OR REPLACE FUNCTION update_prompt_app_execution_from_task()
RETURNS TRIGGER AS $$
DECLARE
  v_execution_id UUID;
BEGIN
  -- Check if this ai_task is linked to a prompt_app_execution
  SELECT id INTO v_execution_id
  FROM prompt_app_executions
  WHERE task_id = NEW.task_id;
  
  -- If found, update the execution record with metrics from ai_task
  IF v_execution_id IS NOT NULL THEN
    UPDATE prompt_app_executions
    SET 
      execution_time_ms = COALESCE(NEW.total_time, execution_time_ms),
      tokens_used = COALESCE(NEW.tokens_total, tokens_used),
      cost = COALESCE(NEW.cost, cost),
      success = CASE 
        WHEN NEW.status = 'completed' THEN true
        WHEN NEW.status = 'failed' THEN false
        ELSE success
      END,
      error_type = CASE 
        WHEN NEW.status = 'failed' AND error_type IS NULL THEN 'execution_error'
        ELSE error_type
      END,
      error_message = CASE
        WHEN NEW.status = 'failed' AND error_message IS NULL THEN 
          COALESCE(NEW.response_errors::text, 'Task failed')
        ELSE error_message
      END
    WHERE id = v_execution_id;
    
    -- Log for debugging
    RAISE NOTICE 'Updated prompt_app_execution % with metrics from ai_task %', v_execution_id, NEW.task_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS update_prompt_app_exec_on_task_update ON ai_tasks;

CREATE TRIGGER update_prompt_app_exec_on_task_update
  AFTER UPDATE OF status, total_time, tokens_total, cost ON ai_tasks
  FOR EACH ROW
  WHEN (
    (OLD.status IS DISTINCT FROM NEW.status) OR 
    (OLD.total_time IS DISTINCT FROM NEW.total_time) OR
    (OLD.tokens_total IS DISTINCT FROM NEW.tokens_total) OR
    (OLD.cost IS DISTINCT FROM NEW.cost)
  )
  EXECUTE FUNCTION update_prompt_app_execution_from_task();

-- ============================================================================
-- FIX 3: Error Creation on Both INSERT and UPDATE
-- ============================================================================

-- The existing trigger only fires on INSERT, we need it on UPDATE too
-- Drop and recreate to handle both cases

DROP TRIGGER IF EXISTS create_error_on_execution_failure ON prompt_app_executions;

CREATE TRIGGER create_error_on_execution_failure
  AFTER INSERT OR UPDATE OF success, error_type ON prompt_app_executions
  FOR EACH ROW
  WHEN (NEW.success = false AND NEW.error_type IS NOT NULL)
  EXECUTE FUNCTION create_error_on_failed_execution();

-- ============================================================================
-- FIX 4: Update View to use corrected success_rate
-- ============================================================================

-- Recreate the analytics view to properly handle the decimal success_rate
CREATE OR REPLACE VIEW prompt_app_analytics AS
SELECT 
  pa.id AS app_id,
  pa.slug,
  pa.name,
  pa.user_id AS creator_id,
  pa.status,
  pa.total_executions,
  
  -- Time-based metrics
  COUNT(DISTINCT pae.id) FILTER (WHERE pae.created_at > NOW() - INTERVAL '24 hours') AS executions_24h,
  COUNT(DISTINCT pae.id) FILTER (WHERE pae.created_at > NOW() - INTERVAL '7 days') AS executions_7d,
  COUNT(DISTINCT pae.id) FILTER (WHERE pae.created_at > NOW() - INTERVAL '30 days') AS executions_30d,
  
  -- User metrics
  COUNT(DISTINCT pae.fingerprint) FILTER (WHERE pae.fingerprint IS NOT NULL) AS unique_anonymous_users,
  COUNT(DISTINCT pae.user_id) FILTER (WHERE pae.user_id IS NOT NULL) AS unique_authenticated_users,
  
  -- Success metrics
  COUNT(*) FILTER (WHERE pae.success = true) AS successful_executions,
  COUNT(*) FILTER (WHERE pae.success = false) AS failed_executions,
  ROUND(
    (COUNT(*) FILTER (WHERE pae.success = true)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) AS success_rate_percent,
  
  -- Performance metrics (only non-null values)
  AVG(pae.execution_time_ms) FILTER (WHERE pae.execution_time_ms IS NOT NULL)::INTEGER AS avg_execution_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pae.execution_time_ms) FILTER (WHERE pae.execution_time_ms IS NOT NULL)::INTEGER AS median_execution_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY pae.execution_time_ms) FILTER (WHERE pae.execution_time_ms IS NOT NULL)::INTEGER AS p95_execution_time_ms,
  
  -- Cost metrics
  SUM(pae.tokens_used) FILTER (WHERE pae.tokens_used IS NOT NULL)::BIGINT AS total_tokens,
  SUM(pae.cost) FILTER (WHERE pae.cost IS NOT NULL)::DECIMAL(10,4) AS total_cost,
  AVG(pae.cost) FILTER (WHERE pae.cost IS NOT NULL)::DECIMAL(10,6) AS avg_cost_per_execution,
  
  -- Timestamps
  MIN(pae.created_at) AS first_execution_at,
  MAX(pae.created_at) AS last_execution_at

FROM prompt_apps pa
LEFT JOIN prompt_app_executions pae ON pa.id = pae.app_id
GROUP BY pa.id, pa.slug, pa.name, pa.user_id, pa.status, pa.total_executions;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after to check)
-- ============================================================================

-- Check success rates are now 0-100%
-- SELECT name, success_rate, total_executions FROM prompt_apps;

-- Check if any executions have metrics now
-- SELECT app_id, success, execution_time_ms, tokens_used, cost, created_at 
-- FROM prompt_app_executions 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- Check analytics view
-- SELECT * FROM prompt_app_analytics LIMIT 5;

-- Check errors table
-- SELECT app_id, error_type, error_message, resolved, created_at 
-- FROM prompt_app_errors 
-- ORDER BY created_at DESC 
-- LIMIT 10;

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- After running this script:
-- 1. Success rates should be 0-100% (not 10000%)
-- 2. Future executions will automatically get metrics from ai_tasks
-- 3. Errors will be created when executions fail
-- 4. Analytics view will show accurate data
-- 
-- Note: Existing executions won't have metrics unless you re-run them.
-- The trigger only works on NEW ai_task updates after this script runs.
-- ============================================================================

