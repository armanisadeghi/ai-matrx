import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { sendDueDateReminderEmail } from "@/lib/email/notificationService";

/**
 * GET /api/cron/due-date-reminders
 * Process and send due date reminders
 * 
 * This endpoint should be called by a cron job (e.g., Vercel Cron)
 * Recommended schedule: Daily at 8:00 AM
 * 
 * To secure this endpoint, add CRON_SECRET to your environment variables
 * and check the Authorization header.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret if configured
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { success: false, msg: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const supabase = createAdminClient();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Get open tasks with upcoming or past due dates (canonical lifecycle:
    // anything not completed/cancelled/dismissed is open).
    const { data: tasks, error } = await workspaceDb(supabase)
      .from('tasks')
      .select('id, title, created_by, due_date, assignee_id')
      .is('deleted_at', null)
      .not('status', 'in', '(completed,cancelled,dismissed)')
      .not('due_date', 'is', null)
      .lte('due_date', dayAfterTomorrow.toISOString())
      .order('due_date', { ascending: true });

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
    const { data: userStates } = await workspaceDb(supabase)
      .from('task_user_state')
      .select('task_id, user_id, snoozed_until, dismissed_at')
      .in('task_id', tasks.map((t) => t.id));
    const muted = new Set<string>();
    for (const s of userStates ?? []) {
      const snoozed = s.snoozed_until && new Date(s.snoozed_until) > now;
      if (snoozed || s.dismissed_at) muted.add(`${s.task_id}:${s.user_id}`);
    }

    // Volume-aware: at most 3 reminder emails per user per run — a flooded
    // inbox trains users to ignore every reminder.
    const PER_USER_CAP = 3;
    const perUserSent = new Map<string, number>();

    // Process each task
    for (const task of tasks) {
      results.processed++;

      // Determine urgency
      const dueDate = new Date(task.due_date);
      let urgency: 'upcoming' | 'due_today' | 'overdue';

      if (dueDate < today) {
        urgency = 'overdue';
      } else if (dueDate < tomorrow) {
        urgency = 'due_today';
      } else {
        urgency = 'upcoming';
      }

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
      if ((perUserSent.get(notifyUserId) ?? 0) >= PER_USER_CAP) {
        results.skipped++;
        continue;
      }

      try {
        const result = await sendDueDateReminderEmail({
          userId: notifyUserId,
          taskTitle: task.title,
          taskId: task.id,
          dueDate: dueDate,
          urgency,
        });

        if (result.success) {
          if (result.skipped) {
            results.skipped++;
          } else {
            results.sent++;
            perUserSent.set(
              notifyUserId,
              (perUserSent.get(notifyUserId) ?? 0) + 1,
            );
          }
        } else {
          results.errors++;
          console.error(`Failed to send reminder for task ${task.id}:`, result.error);
        }
      } catch (err) {
        results.errors++;
        console.error(`Exception sending reminder for task ${task.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      msg: `Processed ${results.processed} tasks, sent ${results.sent} reminders`,
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
