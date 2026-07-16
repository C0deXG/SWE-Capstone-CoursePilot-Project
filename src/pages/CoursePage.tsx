import { ArrowRight, CalendarDays, FileText, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useState, type ChangeEvent, type DragEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AssignmentEditorModal } from "../components/AssignmentEditorModal";
import { CourseEditorModal } from "../components/CourseEditorModal";
import { CourseFileDetailsModal } from "../components/CourseFileDetailsModal";
import { EmptyState, Modal, StatusPill } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import { assignmentsForView, pastDueAssignments, upcomingAssignments, type AssignmentView } from "../lib/assignment-schedule";
import { courseFileAccept, courseFileUploadNotice, filesFromDrop, orderCourseFiles, prepareCourseFiles, processingOrderForFilename } from "../lib/course-file-drop";
import { formatDueCompact, formatDueDate, timeUntil } from "../lib/format";
import type { AssignmentStatus, CourseFile, DocumentType } from "../types";

const tabs = ["overview", "assignments", "files", "details", "assistant"] as const;
type Tab = typeof tabs[number];
const documentTypeLabels: Record<DocumentType, string> = {
  unclassified: "Classifying",
  syllabus: "Syllabus",
  course_schedule: "Course schedule",
  assignment_brief: "Assignment brief",
  rubric: "Rubric",
  lecture_notes: "Lecture notes",
  slides: "Slides",
  reading: "Reading",
  reference: "Reference",
  other: "Other material",
};

function documentGroup(file: CourseFile) {
  if (file.documentType === "unclassified") return "Processing";
  if (["syllabus", "course_schedule"].includes(file.documentType)) return "Course documents";
  if (["assignment_brief", "rubric"].includes(file.documentType)) return "Assignment documents";
  return "Learning materials";
}

export function CoursePage() {
  const { courseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const data = useAppData();
  const course = data.courses.find((item) => item.id === courseId);
  const tab = (tabs.includes(searchParams.get("tab") as Tab) ? searchParams.get("tab") : "overview") as Tab;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  if (!course) return <Navigate to="/app" replace />;
  if (course.setupStatus !== "ready") return <Navigate to={`/app/courses/new?course=${course.id}`} replace />;
  const activeCourse = course;

  const assignments = data.assignments.filter((item) => item.courseId === course.id);
  const files = data.files.filter((item) => item.courseId === course.id);
  const upcoming = upcomingAssignments(assignments);
  const pastDue = pastDueAssignments(assignments);
  const next = upcoming[0];

  function addUploadFiles(selected: File[]) {
    const { accepted, skipped } = prepareCourseFiles(selected);
    const ordered = orderCourseFiles(accepted);
    data.addFiles(courseId!, ordered.map((file, index) => ({ file, processingOrder: processingOrderForFilename(file.name, index) })));
    setUploadNotice(courseFileUploadNotice(accepted.length, skipped));
  }

  function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addUploadFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  async function dropUploadFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setUploadDragging(false);
    setUploadNotice("Reading dropped files...");
    try {
      addUploadFiles(await filesFromDrop(event.dataTransfer));
    } catch {
      setUploadNotice("That folder could not be read. Try dropping it again or choose its files.");
    }
  }

  function openCourseEditor() {
    setEditOpen(true);
  }

  return (
    <>
      <header className="course-header">
        <div className="course-identity"><span className="course-badge" style={{ borderColor: course.accent, color: course.accent }}>{course.code.split(" ")[0]}</span><div><p className="eyebrow">{course.term}</p><h1>{course.code}: {course.title}</h1><p>{course.instructor} <span>|</span> {course.meetingTime} <span>|</span> {course.room}</p></div></div>
        <div className="page-actions"><Link className="button" to="/app/calendar"><CalendarDays size={16} /> Calendar</Link><button className="button primary" type="button" onClick={() => setUploadOpen(true)}><Upload size={16} /> Upload files</button><details className="dropdown dropdown-end course-action-menu"><summary className="btn btn-sm btn-square button icon-button" aria-label={`Manage ${course.code}`} title={`Manage ${course.code}`}><MoreHorizontal size={17} /></summary><ul className="dropdown-content menu course-action-dropdown"><li><button type="button" onClick={openCourseEditor}><Pencil size={14} /> Edit course</button></li><li><button className="danger-menu-item" type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /> Delete course</button></li></ul></details></div>
      </header>
      <nav className="tabs tabs-border tab-nav" aria-label="Course sections">{tabs.map((item) => <button key={item} className={`tab ${tab === item ? "tab-active active" : ""}`} type="button" onClick={() => setSearchParams({ tab: item })}>{item === "assistant" ? "Ask CoursePilot" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav>

      {tab === "overview" && <CourseOverview courseId={course.id} next={next} upcoming={upcoming} pastDueCount={pastDue.length} assignments={assignments} files={files} progress={course.progress} onStatus={data.updateAssignmentStatus} />}
      {tab === "assignments" && <AssignmentsTab assignments={assignments} courseId={course.id} />}
      {tab === "files" && <FilesTab files={files} onUpload={() => setUploadOpen(true)} />}
      {tab === "details" && <DetailsTab course={course} meetings={data.meetings.filter((meeting) => meeting.courseId === course.id)} policies={data.policies.filter((policy) => policy.courseId === course.id)} files={files} onEdit={openCourseEditor} />}
      {tab === "assistant" && <CourseAssistantShortcut courseId={course.id} courseCode={course.code} />}

      <Modal open={uploadOpen} title={`Upload to ${course.code}`} description="Add course material to this private workspace." onClose={() => setUploadOpen(false)}>
        <div className="modal-body"><label className={`drop-zone compact ${uploadDragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setUploadDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setUploadDragging(false); }} onDrop={(event) => void dropUploadFiles(event)}><Upload size={23} /><strong>{uploadDragging ? "Drop files or folders here" : "Choose files or drag folders here"}</strong><span>Nested folders supported. Up to 16 MB per file</span><input type="file" multiple accept={courseFileAccept} onChange={uploadFiles} /></label>{uploadNotice && <p className="upload-notice" role="status">{uploadNotice}</p>}</div>
        <footer className="modal-actions"><button className="button" type="button" onClick={() => setUploadOpen(false)}>Cancel</button></footer>
      </Modal>
      {editOpen && <CourseEditorModal course={activeCourse} onClose={() => setEditOpen(false)} />}
      <Modal open={deleteOpen} title="Delete course?" description="This permanently removes the course and its saved information." size="small" onClose={() => setDeleteOpen(false)}>
        <div className="modal-body"><p>Delete <strong>{course.code}: {course.title}</strong>, including its files, assignments, review questions, and assistant history?</p></div>
        <footer className="modal-actions"><button className="button" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="button danger" type="button" onClick={() => { data.removeCourse(course.id); setDeleteOpen(false); navigate("/app"); }}><Trash2 size={15} /> Delete course</button></footer>
      </Modal>
    </>
  );
}

function CourseOverview({ courseId, next, upcoming, pastDueCount, assignments, files, progress, onStatus }: { courseId: string; next: ReturnType<typeof useAppData>["assignments"][number] | undefined; upcoming: ReturnType<typeof useAppData>["assignments"]; pastDueCount: number; assignments: ReturnType<typeof useAppData>["assignments"]; files: ReturnType<typeof useAppData>["files"]; progress: number; onStatus: (id: string, status: AssignmentStatus) => void }) {
  const acceptedFiles = files.filter((file) => file.status === "Accepted").length;
  const visibleAssignments = upcoming.slice(0, 6);
  const alsoDueNext = next ? upcoming.filter((assignment) => assignment.id !== next.id && assignment.dueAt === next.dueAt) : [];
  return (
    <div className="course-overview">
      <section className="course-stats panel">
        <div>
          <span>Next deadline</span>
          <strong>{next?.title || "Nothing upcoming"}</strong>
          <small>{next ? `${formatDueCompact(next.dueAt)} | ${timeUntil(next.dueAt)}${alsoDueNext.length ? ` | +${alsoDueNext.length} more` : ""}` : "You are caught up"}</small>
        </div>
        <div>
          <span>Upcoming</span>
          <strong>{upcoming.length}</strong>
          <small>{pastDueCount ? `${pastDueCount} past due hidden` : `${assignments.length} total in this course`}</small>
        </div>
        <div>
          <span>Course files</span>
          <strong>{files.length}</strong>
          <small>{acceptedFiles} ready to use</small>
        </div>
        <div>
          <span>Course progress</span>
          <strong>{progress}%</strong>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      <div className="course-main-grid">
        <div>
          <section className="panel section-panel upcoming-panel">
            <div className="section-heading">
              <div><p className="eyebrow">What to work on</p><h2>Upcoming assignments</h2></div>
              <Link to="?tab=assignments">View schedule</Link>
            </div>
            <div className="assignment-list">
              {visibleAssignments.map((assignment) => (
                <div className="assignment-line" key={assignment.id}>
                  <button className="completion-check" type="button" aria-label={`Mark ${assignment.title} complete`} onClick={() => onStatus(assignment.id, "Completed")} />
                  <Link to={`/app/assignments/${assignment.id}`}>
                    <strong>{assignment.title}</strong>
                    <small>{assignment.description}</small>
                  </Link>
                  <span className="assignment-due">
                    <strong>{formatDueCompact(assignment.dueAt).split("|")[0]}</strong>
                    <small>{timeUntil(assignment.dueAt)}</small>
                  </span>
                  <StatusPill>{assignment.status}</StatusPill>
                </div>
              ))}
              {visibleAssignments.length === 0 && <EmptyState title="Nothing upcoming" description="There are no incomplete assignments with a future deadline." />}
            </div>
          </section>

          <section className="panel section-panel">
            <div className="section-heading">
              <div><p className="eyebrow">Source documents</p><h2>Recent files</h2></div>
              <Link to="?tab=files">Manage files</Link>
            </div>
            <div className="file-grid">{files.slice(0, 4).map((file) => <div className="file-card" key={file.id}><span className="file-type">{file.fileType}</span><span><strong>{file.filename}</strong><small>{file.size} | {file.uploadedAt}</small></span><StatusPill tone={file.status === "Accepted" ? "success" : file.status === "Needs review" ? "warning" : "neutral"}>{file.status}</StatusPill></div>)}</div>
          </section>
        </div>

        <aside className="course-aside">
          {next ? (
            <section className="panel aside-card next-assignment-card">
              <p className="eyebrow">Do next</p>
              <span className="next-due-label">{timeUntil(next.dueAt)}</span>
              <h2>{next.title}</h2>
              <p>{next.description}</p>
              <dl>
                <div><dt>Due</dt><dd>{formatDueDate(next.dueAt)}</dd></div>
                <div><dt>Points</dt><dd>{next.points || "Not listed"}</dd></div>
                <div><dt>Status</dt><dd>{next.status}</dd></div>
              </dl>
              {alsoDueNext.length > 0 && <div className="also-due-list"><span>Also due at this time</span>{alsoDueNext.map((assignment) => <Link key={assignment.id} to={`/app/assignments/${assignment.id}`}>{assignment.title}</Link>)}</div>}
              <div className="next-assignment-actions">
                <Link className="button primary full" to={`/app/assignments/${next.id}`}>Open assignment</Link>
                <Link className="button full" to={`/app/assistant?course=${courseId}&assignment=${next.id}`}><Sparkles size={14} /> Ask CoursePilot</Link>
              </div>
            </section>
          ) : (
            <section className="panel aside-card next-assignment-card">
              <p className="eyebrow">Do next</p>
              <h2>You are caught up</h2>
              <p>No incomplete assignments have an upcoming deadline.</p>
            </section>
          )}
          <section className="panel aside-card"><p className="eyebrow">Course details</p><h2>Class information</h2><p>Open the Details tab for meeting information, instructor notes, and confirmed course policies.</p><Link className="text-link" to="?tab=details">View course details <ArrowRight size={14} /></Link></section>
        </aside>
      </div>
    </div>
  );
}

function AssignmentsTab({ assignments, courseId }: { assignments: ReturnType<typeof useAppData>["assignments"]; courseId: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [view, setView] = useState<AssignmentView>("upcoming");
  const visibleAssignments = assignmentsForView(assignments, view);
  return (
    <>
      <section className="card panel section-panel tab-panel assignments-panel">
        <div className="section-heading assignment-toolbar">
          <div><p className="eyebrow">Course work</p><h2>Assignments</h2></div>
          <div className="assignment-toolbar-actions">
            <select className="select select-sm assignment-view-select" aria-label="Assignment view" value={view} onChange={(event) => setView(event.target.value as AssignmentView)}>
              <option value="upcoming">Upcoming</option>
              <option value="past_due">Past due</option>
              <option value="completed">Completed</option>
              <option value="all">All assignments</option>
            </select>
            <button className="btn btn-sm button" type="button" onClick={() => setAddOpen(true)}><Plus size={15} /> Add manually</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table table-sm data-table assignment-table">
            <thead><tr><th>Due</th><th>Assignment</th><th>Points</th><th>Status</th></tr></thead>
            <tbody>{visibleAssignments.map((assignment) => <tr key={assignment.id}><td><strong>{formatDueCompact(assignment.dueAt).split("|")[0]}</strong><small>{formatDueCompact(assignment.dueAt).split("|")[1]}</small></td><td><Link to={`/app/assignments/${assignment.id}`}><strong>{assignment.title}</strong><small>{assignment.description || (assignment.createdBy === "student" ? "Added manually" : assignment.sourceLocation)}</small></Link></td><td>{assignment.points || "—"}</td><td><StatusPill>{assignment.status}</StatusPill></td></tr>)}</tbody>
          </table>
        </div>
        {visibleAssignments.length === 0 && <EmptyState title={view === "upcoming" ? "Nothing upcoming" : `No ${view.replace("_", " ")} assignments`} description={view === "upcoming" ? "Past deadlines are hidden here. Use the assignment view to see earlier work." : "There are no assignments in this view."} action={assignments.length === 0 ? <button className="button primary" type="button" onClick={() => setAddOpen(true)}>Add first assignment</button> : undefined} />}
      </section>
      {addOpen && <AssignmentEditorModal courseId={courseId} onClose={() => setAddOpen(false)} />}
    </>
  );
}

function FilesTab({ files, onUpload }: { files: ReturnType<typeof useAppData>["files"]; onUpload: () => void }) {
  const [selectedFile, setSelectedFile] = useState<(typeof files)[number] | null>(null);
  const groups = ["Course documents", "Assignment documents", "Learning materials", "Processing"].map((label) => ({ label, files: files.filter((file) => documentGroup(file) === label) })).filter((group) => group.files.length);
  return <><section className="panel section-panel tab-panel"><div className="section-heading"><div><p className="eyebrow">Private course sources</p><h2>Files</h2></div><button className="button primary" type="button" onClick={onUpload}><Upload size={15} /> Upload files</button></div>{files.length ? <div className="file-groups">{groups.map((group) => <section className="file-group" key={group.label}><div className="file-group-heading"><h3>{group.label}</h3><span>{group.files.length}</span></div><div className="file-list">{group.files.map((file) => <div key={file.id}><span className="file-type">{file.fileType}</span><span><strong>{file.filename}</strong><small>{documentTypeLabels[file.documentType]} | {file.size} | {file.pageCount ? `${file.pageCount} pages | ` : ""}{file.uploadedAt}</small></span><StatusPill tone={file.status === "Accepted" ? "success" : file.status === "Failed" ? "danger" : file.status === "Needs review" ? "warning" : "neutral"}>{file.status}</StatusPill><button className="text-link" type="button" onClick={() => setSelectedFile(file)}>{file.status === "Needs review" ? "Check file" : "Details"}</button></div>)}</div></section>)}</div> : <EmptyState title="No course files yet" description="Upload a syllabus, schedule, or assignment sheet to organize this course." action={<button className="button primary" type="button" onClick={onUpload}>Upload first file</button>} />}</section>{selectedFile && <CourseFileDetailsModal file={selectedFile} onClose={() => setSelectedFile(null)} />}</>;
}

function DetailsTab({ course, meetings, policies, files, onEdit }: { course: ReturnType<typeof useAppData>["courses"][number]; meetings: ReturnType<typeof useAppData>["meetings"]; policies: ReturnType<typeof useAppData>["policies"]; files: ReturnType<typeof useAppData>["files"]; onEdit: () => void }) {
  const sourceLabel = (sourceFileId?: string, location?: string) => [files.find((file) => file.id === sourceFileId)?.filename, location].filter(Boolean).join(", ");
  return <div className="details-grid tab-panel"><section className="panel settings-section"><p className="eyebrow">Class information</p><h2>{course.code}</h2><dl className="detail-list"><div><dt>Course title</dt><dd>{course.title}</dd></div><div><dt>Instructor</dt><dd>{course.instructor || "Not confirmed"}</dd></div><div><dt>Meets</dt><dd>{course.meetingTime || "Not confirmed"}</dd></div><div><dt>Location</dt><dd>{course.room || "Not confirmed"}</dd></div><div><dt>Term</dt><dd>{course.term}</dd></div></dl>{meetings.length > 0 && <div className="policy-list"><h3>Extracted meetings</h3>{meetings.map((meeting) => <div key={meeting.id}><strong>{meeting.title}</strong><span>{[meeting.startTime, meeting.endTime, meeting.location].filter(Boolean).join(" | ")}</span><small>{sourceLabel(meeting.sourceFileId)}</small></div>)}</div>}<button className="button" type="button" onClick={onEdit}><Pencil size={14} /> Edit course details</button></section><section className="panel settings-section"><p className="eyebrow">Confirmed course information</p><h2>Policies and materials</h2>{policies.length ? <div className="policy-list">{policies.map((policy) => <div key={policy.id}><strong>{policy.title}</strong><span>{policy.policyText}</span><small>{sourceLabel(policy.sourceFileId, policy.sourceLocation) || policy.category.replaceAll("_", " ")}</small></div>)}</div> : <EmptyState title="No confirmed policies yet" description="Upload a syllabus or rubric to organize official course policies." />}</section></div>;
}

function CourseAssistantShortcut({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  return <section className="panel course-assistant-shortcut tab-panel"><div className="flow-icon"><FileText size={21} /></div><p className="eyebrow">Ask from accepted sources</p><h2>Ask about {courseCode}</h2><p>Questions stay scoped to this course unless you choose all courses in the Assistant.</p><Link className="button primary" to={`/app/assistant?course=${courseId}`}>Open CoursePilot Assistant <ArrowRight size={15} /></Link></section>;
}
