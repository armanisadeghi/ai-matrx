import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { enqueueDueReminder } from "@/features/tasks/services/dueReminderOutbox";

/**
 * GET /api/cron/due-date-reminders
 * Queue one due-date notice per recipient and organization per day through the notification
 * spine (email and its paired DM come from the one pairing rule).
 * 
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * Recommended schedule: Daily at 8:00 AM
 * 
 * To secure this endpoint, add CRON_SECRET to your environment variables
 * and check the Authorization header.
 */
export async function GET(request: Request) {
  try {
    // vercel.json is shared by all three Vercel projects (main/admin/demos),
    // so this cron would fire three times a day and triple every email.
    // Only the main app runs it; the satellites (which pin MATRX_PROFILE to
    // admin/demos) no-op.
    const profile = process.env.MATRX_PROFILE;
    if (profile === 'admin' || profile === 'demos') {
      return NextResponse.json({ success: true, msg: `Skipped on ${profile} deployment` });
    }

    // Fail CLOSED: without a configured secret this endpoint must not be
    // publicly triggerable (it sends email).
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[due-date-reminders] CRON_SECRET is not configured — refusing to run.');
      return NextResponse.json(
        { success: false, msg: "CRON_SECRET not configured" },
        { status: 503 }
      );
    }
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createAdminClient();
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setUTCDate(dayAfterTomorrow.getUTCDate() + 2);

    const results: {
      processed: number;
      queued: number;
      duplicates: number;
      skipped: number;
      errors: number;
    } = {
      processed: 0,
      queued: 0,
      duplicates: 0,
      skipped: 0,
      errors: 0,
    };

    // Get open tasks with upcoming or past due dates (canonical lifecycle:
    // anything not completed/cancelled/dismissed is open). Bounded window:
    // tasks overdue by more than 30 days have stopped being "reminders" —
    // without the lower bound, ancient overdue rows would permanently occupy
    // PostgREST's row cap and starve tasks that are actually due now.
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const { data: tasks, error } = await projectsDb(supabase)
      .from('tasks')
      .select('id, title, created_by, due_date, assignee_id, organization_id')
      .is('deleted_at', null)
      .not('status', 'in', '(completed,cancelled,dismissed)')
      .not('due_date', 'is', null)
      .gte('due_date', thirtyDaysAgo.toISOString())
      .lte('due_date', dayAfterTomorrow.toISOString())
      .order('due_date', { ascending: true })
      .order('id', { ascending: true })
      .limit(2000);

    if (error) {
      console.error('Error fetching tasks:', error);
      return NextResponse.json(
        { success: false, msg: "Failed to fetch tasks", error: error.message },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        success: true,
        msg: "No tasks with upcoming due dates",
        results,
      });
    }

    // Per-user snooze/dismiss state — a snoozed or dismissed task never nags.
    // Chunked (URL-length safety) and FAIL-CLOSED: if we can't read mute
    // state we abort the run rather than email people who snoozed.
    const muted = new Set<string>();
    const taskIds = tasks.map((t) => t.id);
    for (let i = 0; i < taskIds.length; i += 150) {
      const chunk = taskIds.slice(i, i + 150);
      const { data: userStates, error: muteError } = await projectsDb(supabase)
        .from('task_user_state')
        .select('task_id, user_id, snoozed_until, dismissed_at')
        .in('task_id', chunk);
      if (muteError) {
        console.error('[due-date-reminders] mute-state read failed — aborting run:', muteError.message);
        return NextResponse.json(
          { success: false, msg: "Failed to read snooze state; no emails sent", error: muteError.message },
          { status: 500 }
        );
      }
      for (const s of userStates ?? []) {
        const snoozed = s.snoozed_until && new Date(s.snoozed_until) > now;
        if (snoozed || s.dismissed_at) muted.add(`${s.task_id}:${s.user_id}`);
      }
    }

    // At most three notices per person per day (one per organization). The outbox's dedupe key
    // (recipient/organization/day) is the atomic claim across overlapping cron requests.
    const PER_USER_CAP = 3;
    const perUserQueued = new Map<string, number>();
    const reminderDay = today.toISOString().slice(0, 10);

    // A notice is scoped to one recipient AND one organization. Putting tasks from several
    // organizations in one notice discloses their titles to the wrong organization.
    const perUserTasks = new Map<string, Map<string, string[]>>();

    for (const task of tasks) {
      results.processed++;

      // Determine who to notify (assignee if assigned, otherwise owner)
      const notifyUserId = task.assignee_id || task.created_by;
      if (!notifyUserId) {
        results.skipped++;
        continue;
      }
      if (muted.has(`${task.id}:${notifyUserId}`)) {
        results.skipped++;
        continue;
      }
      if (!task.organization_id) {
        console.error(`[due-date-reminders] Task ${task.id} has no organization; refusing notification`);
        results.errors++;
        continue;
      }

      const organizations = perUserTasks.get(notifyUserId) ?? new Map<string, string[]>();
      const bucket = organizations.get(task.organization_id) ?? [];
      bucket.push(task.id);
      organizations.set(task.organization_id, bucket);
      perUserTasks.set(notifyUserId, organizations);
    }

    for (const [userId, organizations] of perUserTasks) {
      for (const [organizationId, taskIdsForOrg] of organizations) {
        if ((perUserQueued.get(userId) ?? 0) >= PER_USER_CAP) {
          results.skipped++;
          continue;
        }
        try {
          const result = await enqueueDueReminder(
            supabase, userId, organizationId, taskIdsForOrg, reminderDay,
          );
          if (result === "queued") {
            results.queued++;
            perUserQueued.set(userId, (perUserQueued.get(userId) ?? 0) + 1);
          } else if (result === "duplicate") {
            results.duplicates++;
            perUserQueued.set(userId, (perUserQueued.get(userId) ?? 0) + 1);
          } else {
            results.skipped++;
          }
        } catch (err) {
          results.errors++;
          console.error(`[due-date-reminders] Exception queueing reminder for ${userId}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      msg: `Processed ${results.processed} tasks, queued ${results.queued} reminder notices`,
      results,
    });
  } catch (error) {
    console.error("Error in GET /api/cron/due-date-reminders:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to process reminders" },
      { status: 500 }
    );
  }
}
