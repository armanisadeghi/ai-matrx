# AI runs

**Status:** Live. **Page:** `/administration/ai/ai-tasks` (title "AI runs").

Reads `runtime.global_execution` (the platform's single record of server-run work) through `services/executions-service.ts`. The retired `public.ai_tasks` table is gone. On the admin seat there is no owner filter (`platform_admin_read` admits every row behind the lane); off the seat the list is the caller's own runs (`context.user_id`). Rows are named with `EntityRef token="global_execution"`. Guard: `__tests__/executions-service.test.ts`.
