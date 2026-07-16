import type { Assignment } from "../types";

export type AssignmentView = "upcoming" | "past_due" | "completed" | "all";

export function isFinishedAssignment(assignment: Assignment) {
  return assignment.status === "Completed" || assignment.status === "Submitted";
}

export function upcomingAssignments(assignments: Assignment[], now = new Date()) {
  const currentTime = now.getTime();
  return assignments
    .filter((assignment) => !isFinishedAssignment(assignment) && new Date(assignment.dueAt).getTime() >= currentTime)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export function pastDueAssignments(assignments: Assignment[], now = new Date()) {
  const currentTime = now.getTime();
  return assignments
    .filter((assignment) => !isFinishedAssignment(assignment) && new Date(assignment.dueAt).getTime() < currentTime)
    .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
}

export function assignmentsForView(assignments: Assignment[], view: AssignmentView, now = new Date()) {
  if (view === "upcoming") return upcomingAssignments(assignments, now);
  if (view === "past_due") return pastDueAssignments(assignments, now);
  if (view === "completed") {
    return assignments
      .filter(isFinishedAssignment)
      .sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
  }
  return [...assignments].sort((a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime());
}
