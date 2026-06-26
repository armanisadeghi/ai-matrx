import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { fromDeprecatedTable } from "@/utils/supabase/deprecated-tables";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();

    // Query the ai_tasks table for the response
    const { data: task, error } = await fromDeprecatedTable(
      "ai_tasks",
      "app/api/public/apps/response/[taskId]/route.ts:GET",
    )
      .select("status, response_text, response_data, response_errors")
      .eq("task_id", taskId)
      .single();

    if (error) {
      return NextResponse.json({
        response: "",
        completed: false,
        error: null,
      });
    }

    // Extract response
    let response = "";
    let completed = false;
    let taskError = null;

    if (task) {
      if (task.status === "completed" || task.status === "failed") {
        completed = true;
      }

      if (task.status === "failed") {
        taskError = task.response_errors
          ? typeof task.response_errors === "string"
            ? task.response_errors
            : JSON.stringify(task.response_errors)
          : "Task failed";
      }

      // Use response_text as primary response
      if (task.response_text) {
        response = task.response_text;
      } else if (task.response_data) {
        // Fallback to response_data if no response_text
        try {
          const data =
            typeof task.response_data === "string"
              ? JSON.parse(task.response_data)
              : task.response_data;

          response =
            data.response ||
            data.text ||
            data.content ||
            data.message ||
            (typeof data === "string" ? data : "");
        } catch {
          response =
            typeof task.response_data === "string" ? task.response_data : "";
        }
      }
    }

    return NextResponse.json({
      response,
      completed,
      error: taskError,
    });
  } catch (error) {
    console.error("Error fetching task response:", error);
    return NextResponse.json(
      {
        response: "",
        completed: false,
        error: "Failed to fetch response",
      },
      { status: 500 },
    );
  }
}
