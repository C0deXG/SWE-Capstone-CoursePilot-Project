export const courseAccentOptions = [
  { value: "#2f6b4f", label: "Emerald" },
  { value: "#6b4fa1", label: "Violet" },
  { value: "#9a6a00", label: "Gold" },
  { value: "#2f6e9e", label: "Ocean" },
  { value: "#a54848", label: "Crimson" },
  { value: "#227a76", label: "Teal" },
  { value: "#9a3e70", label: "Berry" },
  { value: "#b45a2b", label: "Orange" },
] as const;

export const defaultCourseAccent = courseAccentOptions[0].value;
