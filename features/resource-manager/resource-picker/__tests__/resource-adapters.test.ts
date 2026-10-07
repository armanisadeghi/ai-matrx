import { noteResourceData, taskResourceData } from "../resource-adapters";

describe("chat resource DTO adapters", () => {
  it("keeps the note fields the chat attachment contract consumes", () => {
    const note = {
      id: "1de15f18-6002-4c73-8381-2fe90b6fab47",
      label: "Harbor Dental intake follow-up",
      content: "Confirm the insurance card before the appointment.",
      folder_name: "Patient intake",
      tags: ["follow-up"],
    } satisfies Parameters<typeof noteResourceData>[0];

    expect(noteResourceData(note)).toEqual({
      id: note.id,
      label: note.label,
      content: note.content,
      folder_name: note.folder_name,
      tags: note.tags,
    });
  });

  it("keeps the task fields the chat attachment contract consumes", () => {
    const task = {
      id: "c20b0419-33d4-45b5-8a50-b0c5e9fbe587",
      title: "Verify new-patient insurance card",
      status: "in_progress",
      priority: "high",
      due_date: "2026-10-08",
      project_id: "d41f158d-c416-452c-b777-ab9172d1ac15",
      description: "Confirm both sides are legible before Thursday's visit.",
    } satisfies Parameters<typeof taskResourceData>[0];

    expect(taskResourceData(task)).toEqual({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      project_id: task.project_id,
      description: task.description,
    });
  });
});
