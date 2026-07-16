import { describe, expect, it } from "vitest";
import { isSyllabusFilename, maximumCourseFileSize, orderCourseFiles, prepareCourseFiles } from "./course-file-drop";

describe("prepareCourseFiles", () => {
  it("accepts supported folder files and skips unsupported or oversized files", () => {
    const accepted = new File(["course"], "syllabus.pdf", { type: "application/pdf", lastModified: 1 });
    const unsupported = new File(["course"], ".DS_Store", { lastModified: 2 });
    const oversized = new File([""], "lecture.pptx", { lastModified: 3 });
    Object.defineProperty(oversized, "size", { value: maximumCourseFileSize + 1 });

    const result = prepareCourseFiles([accepted, unsupported, oversized]);

    expect(result.accepted).toEqual([accepted]);
    expect(result.skipped).toBe(2);
  });

  it("removes duplicate files from the same drop", () => {
    const file = new File(["homework"], "homework.docx", { lastModified: 4 });

    const result = prepareCourseFiles([file, file]);

    expect(result.accepted).toEqual([file]);
    expect(result.skipped).toBe(1);
  });

  it("places the syllabus before schedules, assignments, rubrics, and notes", () => {
    const files = [
      new File([""], "week-1-notes.pdf"),
      new File([""], "Sprint 2 Assignment.docx"),
      new File([""], "Course Syllabus.docx"),
      new File([""], "Grading Rubric.pdf"),
      new File([""], "Course Schedule.pdf"),
    ];

    expect(orderCourseFiles(files).map((file) => file.name)).toEqual([
      "Course Syllabus.docx",
      "Course Schedule.pdf",
      "Sprint 2 Assignment.docx",
      "Grading Rubric.pdf",
      "week-1-notes.pdf",
    ]);
    expect(isSyllabusFilename("COURSE SYLLABUS 2026.PDF")).toBe(true);
  });
});
