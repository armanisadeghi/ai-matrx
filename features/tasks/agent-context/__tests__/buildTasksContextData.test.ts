import {
  buildTasksContextData,
  buildTasksListContextData,
} from "@/features/tasks/agent-context/buildTasksContextData";
import type { Project, TaskWithProject } from "@/features/tasks/types";

const task: TaskWithProject = {
  id: "task-1",
  title: "Ship the surface",
  completed: false,
  status: "planned",
  description: "",
  attachments: [],
  dueDate: "2026-09-01",
  priority: "high",
  projectId: "project-1",
  projectName: "Launch",
};

describe("Tasks surface context", () => {
  it("emits list values from the visible workspace state", () => {
    const projects: Project[] = [
      { id: "project-1", name: "Launch", tasks: [task] },
    ];

    expect(
      buildTasksListContextData({
        tasks: [task],
        projects,
        searchQuery: "surface",
      }),
    ).toMatchObject({
      task_list: [
        {
          id: "task-1",
          title: "Ship the surface",
          status: "planned",
          priority: "high",
          due_date: "2026-09-01",
        },
      ],
      project_list: [{ id: "project-1", name: "Launch", task_count: 1 }],
      task_count: 1,
      search_query: "surface",
    });
  });

  it("keeps derived attention status separate from the lifecycle read twin", () => {
    expect(
      buildTasksContextData({
        taskId: "task-1",
        title: "Ship the surface",
        description: "",
        status: "active",
        dueDate: "2999-09-01",
      }),
    ).toMatchObject({
      active_task_status: "pending",
      active_task_lifecycle_status: "active",
      active_task: {
        status: "pending",
        lifecycle_status: "active",
      },
    });
  });

  it("emits priority as an exact read twin, including honest None", () => {
    const savedMedium = buildTasksContextData({
      taskId: "task-1",
      title: "Ship the surface",
      description: "",
      priority: "medium",
    });
    expect(savedMedium).toMatchObject({
      active_task_priority: "medium",
      active_task: { priority: "medium" },
    });

    const savedNone = buildTasksContextData({
      taskId: "task-1",
      title: "Ship the surface",
      description: "",
      priority: null,
    });
    expect(savedNone).toHaveProperty("active_task_priority", null);
    expect(savedNone).toHaveProperty("active_task.priority", null);
  });

  it("rebuilds the next submitted turn from fresh saved priority", () => {
    const firstTurn = buildTasksContextData({
      taskId: "task-1",
      title: "Ship the surface",
      description: "",
      priority: null,
    });
    const nextTurn = buildTasksContextData({
      taskId: "task-1",
      title: "Ship the surface",
      description: "",
      priority: "medium",
    });

    expect(firstTurn).toHaveProperty("active_task_priority", null);
    expect(nextTurn).toHaveProperty("active_task_priority", "medium");
  });
});
