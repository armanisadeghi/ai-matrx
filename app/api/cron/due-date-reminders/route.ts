import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { sendDueDateReminderEmail } from "@/lib/email/notificationService";
import { sendDm } from "@/lib/services/system-dm";

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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const results: {
      processed: number;
      sent: number;
      skipped: number;
      errors: number;
      dmsSent?: number;
    } = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    // Get open tasks with upcoming or past due dates (canonical lifecycle:
    // anything not completed/cancelled/dismissed is open). Bounded window:
    // tasks overdue by more than 30 days have stopped being "reminders" —
    // without the lower bound, ancient overdue rows would permanently occupy
    // PostgREST's row cap and starve tasks that are actually due now.
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { data: tasks, error } = await workspaceDb(supabase)
      .from('tasks')
      .select('id, title, created_by, due_date, assignee_id')
      .is('deleted_at', null)
      .not('status', 'in', '(completed,cancelled,dismissed)')
      .not('due_date', 'is', null)
      .gte('due_date', thirtyDaysAgo.toISOString())
      .lte('due_date', dayAfterTomorrow.toISOString())
      .order('due_date', { ascending: true })
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
      const { data: userStates, error: muteError } = await workspaceDb(supabase)
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

    // Volume-aware: at most 3 reminder emails per user per run — a flooded
    // inbox trains users to ignore every reminder.
    const PER_USER_CAP = 3;
    const perUserSent = new Map<string, number>();

    // Collect each user's due/overdue tasks for the in-app DM digest.
    type ReminderTask = (typeof tasks)[number] & {
      urgency: 'upcoming' | 'due_today' | 'overdue';
    };
    const perUserTasks = new Map<string, ReminderTask[]>();

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

      const bucket = perUserTasks.get(notifyUserId) ?? [];
      bucket.push({ ...task, urgency });
      perUserTasks.set(notifyUserId, bucket);

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

    // In-app DM from the Matrx System bot — ONE message per user per run,
    // volume-aware: a single task gets actionable Open/Complete/Snooze chips;
    // several tasks collapse to a digest with a deep link into /tasks.
    const urgencyLabel = { overdue: 'overdue', due_today: 'due today', upcoming: 'due tomorrow' } as const;
    for (const [userId, userTasks] of perUserTasks) {
      try {
        const dm =
          userTasks.length === 1
            ? sendDm({
                senderId: null,
                recipientId: userId,
                content: `Task reminder — "${userTasks[0].title}" is ${urgencyLabel[userTasks[0].urgency]}.`,
                actionData: {
                  kind: 'task_reminder',
                  payload: {
                    task_id: userTasks[0].id,
                    title: userTasks[0].title,
                    due_date: userTasks[0].due_date,
                  },
                },
              })
            : sendDm({
                senderId: null,
                recipientId: userId,
                content: [
                  `You have ${userTasks.length} tasks needing attention:`,
                  ...userTasks
                    .slice(0, 2)
                    .map((t) => `• ${t.title} (${urgencyLabel[t.urgency]})`),
                  ...(userTasks.length > 2 ? [`…and ${userTasks.length - 2} more`] : []),
                ].join('\n'),
                actionData: {
                  kind: 'open_link',
                  payload: { href: '/tasks', label: 'Open tasks' },
                },
              });
        const dmResult = await dm;
        if (dmResult.ok) {
          results.dmsSent = (results.dmsSent ?? 0) + 1;
        } else if (dmResult.error !== 'self') {
          console.error(`[due-date-reminders] DM to ${userId} failed:`, dmResult.error);
        }
      } catch (err) {
        console.error(`[due-date-reminders] DM exception for ${userId}:`, err);
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
