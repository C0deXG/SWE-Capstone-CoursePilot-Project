import { describe, expect, it } from "vitest";
import { fileSize, formatDueCompact, initials } from "./format";

describe("format helpers", () => {
  it("formats assignment due dates consistently", () => {
    expect(formatDueCompact("2026-07-16T18:00:00-05:00")).toBe("Jul 16 | 6:00 PM");
  });

  it("builds readable profile initials", () => {
    expect(initials("Alex Student")).toBe("AS");
    expect(initials("Kheder")).toBe("K");
  });

  it("formats upload sizes", () => {
    expect(fileSize(512)).toBe("512 B");
    expect(fileSize(2048)).toBe("2 KB");
    expect(fileSize(1572864)).toBe("1.5 MB");
  });
});
