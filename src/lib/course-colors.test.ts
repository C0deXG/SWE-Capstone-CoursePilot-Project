import { describe, expect, it } from "vitest";
import { courseAccentOptions, defaultCourseAccent } from "./course-colors";

describe("course colors", () => {
  it("provides unique valid preset colors", () => {
    const values = courseAccentOptions.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => /^#[0-9a-f]{6}$/.test(value))).toBe(true);
  });

  it("uses one of the visible presets as the default", () => {
    expect(courseAccentOptions.some((option) => option.value === defaultCourseAccent)).toBe(true);
  });
});
