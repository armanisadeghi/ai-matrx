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

    // Get tasks with upcoming or past due dates that are not completed
    const { data: tasks, error } = await workspaceDb(supabase)
      .from('tasks')
      .select('id, title, created_by, due_date, assignee_id')
      .eq('status', 'incomplete')
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
