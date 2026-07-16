import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAppData } from "../context/AppDataContext";
import type { Course } from "../types";
import { CourseColorPicker } from "./CourseColorPicker";
import { Modal } from "./ui";

type CourseDraft = Pick<Course, "code" | "shortName" | "title" | "instructor" | "term" | "meetingTime" | "room" | "accent">;

export function CourseEditorModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const { updateCourse } = useAppData();
  const [draft, setDraft] = useState<CourseDraft>({
    code: course.code,
    shortName: course.shortName,
    title: course.title,
    instructor: course.instructor,
    term: course.term,
    meetingTime: course.meetingTime,
    room: course.room,
    accent: course.accent,
  });

  function saveCourse(event: FormEvent) {
    event.preventDefault();
    updateCourse(course.id, draft);
    onClose();
  }

  return (
    <Modal open title={`Edit ${course.code}`} description="Update the course details and color shown throughout CoursePilot." onClose={onClose}>
      <form id={`edit-course-${course.id}`} className="modal-body" onSubmit={saveCourse}>
        <div className="form-grid">
          <label>Course code<input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} required /></label>
          <label>Short name<input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} required /></label>
          <label className="wide-field">Course title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
          <label>Instructor<input value={draft.instructor} onChange={(event) => setDraft({ ...draft, instructor: event.target.value })} /></label>
          <label>Term<input value={draft.term} onChange={(event) => setDraft({ ...draft, term: event.target.value })} required /></label>
          <label>Meeting time<input value={draft.meetingTime} onChange={(event) => setDraft({ ...draft, meetingTime: event.target.value })} /></label>
          <label>Room or link<input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} /></label>
          <fieldset className="wide-field accent-field"><legend>Course color</legend><CourseColorPicker value={draft.accent} onChange={(accent) => setDraft({ ...draft, accent })} /></fieldset>
        </div>
      </form>
      <footer className="modal-actions"><button className="button" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" form={`edit-course-${course.id}`}><Check size={15} /> Save course</button></footer>
    </Modal>
  );
}
