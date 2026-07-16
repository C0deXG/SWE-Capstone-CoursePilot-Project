import { ArrowLeft, Bell, Check, ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AssignmentEditorModal } from "../components/AssignmentEditorModal";
import { CourseFileDetailsModal } from "../components/CourseFileDetailsModal";
import { FormError, Modal, StatusPill } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import { formatDueDate, timeUntil } from "../lib/format";
import type { AssignmentStatus } from "../types";

const statuses: AssignmentStatus[] = ["Not started", "In progress", "Completed", "Submitted"];

export function AssignmentPage() {
  const { assignmentId } = useParams();
  const data = useAppData();
  const assignment = data.assignments.find((item) => item.id === assignmentId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const navigate = useNavigate();
  if (!assignment) return <Navigate to="/app" replace />;
  const course = data.courses.find((item) => item.id === assignment.courseId);
  const file = data.files.find((item) => item.id === assignment.sourceFileId);
  const reminderTimes = [...new Set(data.reminders.filter((reminder) => reminder.assignmentId === assignment.id && reminder.status === "scheduled").map((reminder) => reminder.remindAt))].sort();
  return <><Link className="back-link page-back" to={`/app/courses/${course?.id}`}><ArrowLeft size={15} /> Back to {course?.code}</Link><header className="assignment-header"><div><p className="eyebrow">{course?.code} | {assignment.createdBy === "extracted" ? "Confirmed from course source" : "Added manually"}</p><h1>{assignment.title}</h1><p>{assignment.description}</p></div><div className="page-actions"><StatusPill tone={assignment.status === "Completed" || assignment.status === "Submitted" ? "success" : "neutral"}>{assignment.status}</StatusPill><Link className="button primary" to={`/app/assistant?course=${assignment.courseId}&assignment=${assignment.id}`}><Sparkles size={14} /> Ask CoursePilot</Link><button className="button" type="button" onClick={() => setEditOpen(true)}>Edit</button><button className="button danger-text" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /> Delete</button></div></header><div className="assignment-detail-grid"><section className="panel assignment-main"><div className="assignment-facts"><div><span>Due</span><strong>{formatDueDate(assignment.dueAt)}</strong><small>{timeUntil(assignment.dueAt)}</small></div><div><span>Points</span><strong>{assignment.points}</strong><small>Course points</small></div><div><span>Confidence</span><strong>{assignment.confidence}</strong><small>{assignment.confidence === "High" ? "Confirmed source detail" : "Review recommended"}</small></div></div><section><p className="eyebrow">Description</p><h2>What to complete</h2><p>{assignment.description}</p></section><section><p className="eyebrow">Source</p><h2>Supporting course file</h2>{file ? <div className="source-card"><span className="file-type">{file.fileType}</span><span><strong>{file.filename}</strong><small>{assignment.sourceLocation}</small></span><button className="button" type="button" onClick={() => setFileOpen(true)}><ExternalLink size={14} /> View source</button></div> : <p className="quiet">This assignment was added manually.</p>}</section></section><aside className="panel assignment-status-card"><p className="eyebrow">Progress</p><h2>Assignment status</h2><div className="status-options">{statuses.map((status) => <button key={status} className={assignment.status === status ? "selected" : ""} type="button" onClick={() => data.updateAssignmentStatus(assignment.id, status)}><span>{assignment.status === status && <Check size={13} />}</span>{status}</button>)}</div><div className="reminder-box"><strong><Bell size={14} /> Reminders</strong>{reminderTimes.length ? reminderTimes.map((remindAt) => <span key={remindAt}>{formatDueDate(remindAt)}</span>) : <span>No reminders scheduled</span>}<button className="text-link" type="button" onClick={() => setReminderOpen(true)}>Edit reminders</button></div></aside></div>{editOpen && <AssignmentEditorModal courseId={assignment.courseId} assignment={assignment} onClose={() => setEditOpen(false)} />}{fileOpen && file && <CourseFileDetailsModal file={file} onClose={() => setFileOpen(false)} />}{reminderOpen && <ReminderEditor assignmentId={assignment.id} remindAtValues={reminderTimes} onClose={() => setReminderOpen(false)} />}<Modal open={deleteOpen} title="Delete assignment?" description="This removes the assignment from the course and calendar." size="small" onClose={() => setDeleteOpen(false)}><div className="modal-body"><p>Delete <strong>{assignment.title}</strong>? You cannot undo this action.</p></div><footer className="modal-actions"><button className="button" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="button danger" type="button" onClick={() => { data.removeAssignment(assignment.id); navigate(`/app/courses/${assignment.courseId}?tab=assignments`); }}><Trash2 size={14} /> Delete assignment</button></footer></Modal></>;
}

function toLocalInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function ReminderEditor({ assignmentId, remindAtValues, onClose }: { assignmentId: string; remindAtValues: string[]; onClose: () => void }) {
  const data = useAppData();
  const [times, setTimes] = useState(() => remindAtValues.map(toLocalInput));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError("");
    try {
      await data.replaceAssignmentReminders(assignmentId, times.filter(Boolean).map((value) => new Date(value).toISOString()));
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reminders could not be saved.");
      setSaving(false);
    }
  }

  return <Modal open title="Edit reminders" description="Choose when CoursePilot should remind you." size="small" onClose={onClose}><div className="modal-body"><div className="reminder-editor-list">{times.map((time, index) => <div key={index}><input aria-label={`Reminder ${index + 1}`} type="datetime-local" value={time} onChange={(event) => setTimes((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><button className="icon-button" type="button" aria-label={`Remove reminder ${index + 1}`} onClick={() => setTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div>)}</div><button className="button" type="button" onClick={() => setTimes((current) => [...current, ""])}><Plus size={14} /> Add reminder</button><p className="flow-note">Enabled notification channels use these saved times. Delivery automation is planned for Sprint 3.</p><FormError message={error} /></div><footer className="modal-actions"><button className="button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save reminders"}</button></footer></Modal>;
}
