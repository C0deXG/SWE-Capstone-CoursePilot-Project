import { Check, Pipette } from "lucide-react";
import { courseAccentOptions } from "../lib/course-colors";

export function CourseColorPicker({ value, onChange, compact = false }: { value: string; onChange: (color: string) => void; compact?: boolean }) {
  const customSelected = !courseAccentOptions.some((option) => option.value === value.toLowerCase());
  return (
    <div className={`course-color-options ${compact ? "compact" : ""}`}>
      {courseAccentOptions.map((option) => <button key={option.value} className={value.toLowerCase() === option.value ? "selected" : ""} style={{ backgroundColor: option.value }} type="button" onClick={() => onChange(option.value)} aria-label={`Use ${option.label} for this course`} title={option.label}>{value.toLowerCase() === option.value && <Check size={compact ? 11 : 14} />}</button>)}
      <label className={`custom-color-control ${customSelected ? "selected" : ""}`} style={customSelected ? { backgroundColor: value } : undefined} title="Custom color">
        <span className="sr-only">Choose a custom course color</span>
        {customSelected ? <Check size={compact ? 11 : 14} /> : <Pipette size={compact ? 11 : 14} />}
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Choose a custom course color" />
      </label>
    </div>
  );
}
