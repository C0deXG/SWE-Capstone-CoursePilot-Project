import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAppData } from "../context/AppDataContext";
import type { Assignment, AssignmentStatus } from "../types";
import { Modal } from "./ui";

const statuses: AssignmentStatus[] = ["Not started", "In progress", "Completed", "Submitted"];

function defaultDueValue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AssignmentEditorModal({ courseId, assignment, onClose }: { courseId: string; assignment?: Assignment; onClose: () => void }) {
  const data = useAppData();
  const [title, setTitle] = useState(assignment?.title || "");
  const [description, setDescription] = useState(assignment?.description || "");
  const [dueAt, setDueAt] = useState(assignment ? toLocalInput(assignment.dueAt) : defaultDueValue());
  const [points, setPoints] = useState(assignment?.points.toString() || "0");
  const [status, setStatus] = useState<AssignmentStatus>(assignment?.status || "Not started");

  function save(event: FormEvent) {
    event.preventDefault();
    const values = { title: title.trim(), description: description.trim(), dueAt: new Date(dueAt).toISOString(), points: Math.max(0, Number(points) || 0), status };
    if (assignment) data.updateAssignment(assignment.id, values);
    else data.addAssignment(courseId, values);
    onClose();
  }

  const formId = `assignment-editor-${assignment?.id || courseId}`;
  return <Modal open title={assignment ? "Edit assignment" : "Add assignment"} description="Keep the deadline and progress connected to this course." onClose={onClose}><form id={formId} className="modal-body" onSubmit={save}><div className="form-grid"><label className="wide-field">Assignment title<input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label><label className="wide-field">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><label>Due date and time<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label><label>Points<input type="number" min="0" step="0.5" value={points} onChange={(event) => setPoints(event.target.value)} /></label><label className="wide-field">Status<select value={status} onChange={(event) => setStatus(event.target.value as AssignmentStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div></form><footer className="modal-actions"><button className="button" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit" form={formId}><Check size={15} /> Save assignment</button></footer></Modal>;
}
