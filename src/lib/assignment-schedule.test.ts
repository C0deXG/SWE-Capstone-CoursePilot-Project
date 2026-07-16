import { describe, expect, it } from "vitest";
import type { Assignment } from "../types";
import { assignmentsForView, pastDueAssignments, upcomingAssignments } from "./assignment-schedule";

function assignment(id: string, dueAt: string, status: Assignment["status"] = "Not started"): Assignment {
  return {
    id,
    courseId: "course-1",
    title: id,
    dueAt,
    points: 10,
    status,
    confidence: "High",
    description: "",
    createdBy: "extracted",
  };
}

describe("assignment schedule", () => {
  const now = new Date("2026-07-14T12:00:00-05:00");
  const assignments = [
    assignment("May 28", "2026-05-28T18:00:00-05:00"),
    assignment("July 16", "2026-07-16T18:00:00-05:00"),
    assignment("July 15", "2026-07-15T18:00:00-05:00"),
    assignment("Completed July 15", "2026-07-15T12:00:00-05:00", "Completed"),
  ];

  it("selects the nearest upcoming incomplete assignment", () => {
    expect(upcomingAssignments(assignments, now).map((item) => item.id)).toEqual(["July 15", "July 16"]);
  });

  it("keeps expired work out of the upcoming list", () => {
    expect(pastDueAssignments(assignments, now).map((item) => item.id)).toEqual(["May 28"]);
  });

  it("supports a separate completed view", () => {
    expect(assignmentsForView(assignments, "completed", now).map((item) => item.id)).toEqual(["Completed July 15"]);
  });
});
