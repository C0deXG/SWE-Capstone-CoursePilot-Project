import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, FileText, LoaderCircle, Save, Upload, X } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CourseColorPicker } from "../components/CourseColorPicker";
import { Stepper, StatusPill } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import { courseFileAccept, courseFileUploadNotice, filesFromDrop, isSyllabusFilename, orderCourseFiles, prepareCourseFiles, processingOrderForFilename } from "../lib/course-file-drop";
import { defaultCourseAccent } from "../lib/course-colors";
import { defaultProcessingStages } from "../lib/processing-stages";
import type { ProcessingJobStage, ReviewItem, ReviewStatus } from "../types";

const steps = ["Course details", "Add materials", "Organize files", "Review details", "Course ready"];
const blankCourse = { code: "", shortName: "", title: "", instructor: "", term: "Summer 2026", meetingTime: "", room: "", accent: defaultCourseAccent };
const stageIndex: Record<ProcessingJobStage, number> = {
  queued: 0,
  validating: 1,
  extracting_text: 2,
  chunking: 3,
  embedding: 4,
  extracting_facts: 5,
  creating_reviews: 6,
  completed: 7,
  needs_review: 7,
  failed: 0,
};

function fileStageLabel(stage?: ProcessingJobStage) {
  return ({
    queued: "Waiting",
    validating: "Validating file",
    extracting_text: "Extracting text",
    chunking: "Organizing sections",
    embedding: "Indexing for questions",
    extracting_facts: "Reading course details",
    creating_reviews: "Updating course features",
    completed: "Ready",
    needs_review: "Ready for review",
    failed: "Needs attention",
  } as Partial<Record<ProcessingJobStage, string>>)[stage || "queued"] || "Uploading";
}

export function NewCoursePage() {
  const data = useAppData();
  const [searchParams] = useSearchParams();
  const existingId = searchParams.get("course");
  const existing = existingId ? data.courses.find((course) => course.id === existingId) : undefined;
  const [courseId, setCourseId] = useState(existing?.id || "");
  const [current, setCurrent] = useState(existing?.setupStep || 1);
  const [details, setDetails] = useState(existing ? { code: existing.code, shortName: existing.shortName, title: existing.title, instructor: existing.instructor, term: existing.term, meetingTime: existing.meetingTime, room: existing.room, accent: existing.accent } : blankCourse);
  const [fileIds, setFileIds] = useState<string[]>(() => existing ? data.files.filter((file) => file.courseId === existing.id).map((file) => file.id) : []);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const navigate = useNavigate();
  const courseFiles = useMemo(() => data.files.filter((file) => fileIds.includes(file.id)), [data.files, fileIds]);
  const orderedCourseFiles = useMemo(() => [...courseFiles].sort((left, right) => {
    const typeOrder = processingOrderForFilename(left.filename) - processingOrderForFilename(right.filename);
    return typeOrder || left.processingOrder - right.processingOrder || left.filename.localeCompare(right.filename);
  }), [courseFiles]);
  const hasSyllabus = orderedCourseFiles.some((file) => isSyllabusFilename(file.filename));
  const activeCourse = data.courses.find((course) => course.id === courseId);
  const courseJobs = useMemo(() => orderedCourseFiles.map((file) => data.processingJobs[file.id]).filter(Boolean), [orderedCourseFiles, data.processingJobs]);
  const failedJobs = useMemo(() => courseJobs.filter((job) => job.stage === "failed"), [courseJobs]);
  const setupReviews = useMemo(() => data.reviews.filter((review) => review.courseId === courseId && review.requiredForSetup && ["Needs review", "Deferred"].includes(review.status)), [courseId, data.reviews]);
  const currentReview = setupReviews[0];
  const serverProcessing = useMemo(() => {
    if (current !== 3) return null;
    if (!orderedCourseFiles.length || !courseJobs.length) return { complete: false, stages: defaultProcessingStages.map((stage, index) => ({ ...stage, status: index === 0 ? "active" as const : "waiting" as const })) };
    const complete = orderedCourseFiles.every((file) => {
      const job = data.processingJobs[file.id];
      return job && ["completed", "needs_review"].includes(job.stage);
    });
    if (complete) return { complete: true, stages: defaultProcessingStages.map((stage) => ({ ...stage, status: "complete" as const })) };

    const activeJob = courseJobs.find((job) => job.stage === "failed") || courseJobs.find((job) => !["completed", "needs_review"].includes(job.stage));
    if (!activeJob) return null;
    const activeIndex = activeJob.stage === "failed"
      ? Math.min(defaultProcessingStages.length - 1, Math.floor((activeJob.progress / 100) * defaultProcessingStages.length))
      : stageIndex[activeJob.stage];
    return {
      complete: false,
      stages: defaultProcessingStages.map((stage, index) => ({
        ...stage,
        status: index < activeIndex ? "complete" as const : index === activeIndex ? (activeJob.stage === "failed" ? "failed" as const : "active" as const) : "waiting" as const,
      })),
    };
  }, [courseJobs, current, data.processingJobs, orderedCourseFiles]);
  const visibleStages = serverProcessing?.stages || defaultProcessingStages;
  const setupProcessingComplete = serverProcessing?.complete ?? false;
  const completedFileCount = orderedCourseFiles.filter((file) => {
    const stage = data.processingJobs[file.id]?.stage;
    return stage === "completed" || stage === "needs_review";
  }).length;
  const activeProcessingFile = orderedCourseFiles.find((file) => {
    const stage = data.processingJobs[file.id]?.stage;
    return stage && !["queued", "completed", "needs_review", "failed"].includes(stage);
  }) || orderedCourseFiles.find((file) => data.processingJobs[file.id]?.errorCode === "provider_busy")
    || orderedCourseFiles.find((file) => data.processingJobs[file.id]?.stage === "failed")
    || orderedCourseFiles.find((file) => !["completed", "needs_review"].includes(data.processingJobs[file.id]?.stage || "queued"));
  const activeProcessingJob = activeProcessingFile ? data.processingJobs[activeProcessingFile.id] : undefined;
  const activeFileIndex = activeProcessingFile ? orderedCourseFiles.findIndex((file) => file.id === activeProcessingFile.id) : -1;
  const activeStage = visibleStages[Math.min(visibleStages.length - 1, stageIndex[activeProcessingJob?.stage || "queued"])] || visibleStages[0];
  const providerBusy = activeProcessingJob?.errorCode === "provider_busy";

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    let id = courseId;
    if (!id) { const created = data.addCourse(details); id = created.id; setCourseId(id); }
    else data.updateCourse(id, { ...details, setupStep: 2 });
    data.updateCourse(id, { setupStep: 2, setupStatus: "draft" });
    setCurrent(2);
  }

  function chooseAccent(accent: string) {
    setDetails((currentDetails) => ({ ...currentDetails, accent }));
    if (courseId) data.updateCourse(courseId, { accent });
  }

  function addSelectedFiles(files: File[]) {
    if (!courseId) return;
    const { accepted, skipped } = prepareCourseFiles(files);
    const ordered = orderCourseFiles(accepted);
    const next = data.addFiles(courseId, ordered.map((file, index) => ({ file, processingOrder: processingOrderForFilename(file.name, index) })));
    setFileIds((currentIds) => [...currentIds, ...next.map((file) => file.id)]);
    setUploadNotice(courseFileUploadNotice(accepted.length, skipped));
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return;
    addSelectedFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  async function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDraggingFiles(false);
    setUploadNotice("Reading dropped files...");
    try {
      addSelectedFiles(await filesFromDrop(event.dataTransfer));
    } catch {
      setUploadNotice("That folder could not be read. Try dropping it again or choose its files.");
    }
  }

  function beginOrganizing() {
    if (!courseId || !hasSyllabus) {
      setUploadNotice('Add a file with "syllabus" in its filename before continuing.');
      return;
    }
    data.updateCourse(courseId, { setupStep: 3, setupStatus: "processing" });
    setCurrent(3);
  }

  function retryFailedFiles() {
    failedJobs.forEach((job) => data.retryFile(job.fileId));
  }

  function goToReview() { data.updateCourse(courseId, { setupStep: 4, setupStatus: "review" }); setCurrent(4); }
  function finishReview() { data.updateCourse(courseId, { setupStep: 5 }); setCurrent(5); }
  function finishCourse() { data.updateCourse(courseId, { setupStep: 5, setupStatus: "ready" }); navigate(`/app/courses/${courseId}`); }

  function resolveSetupReview(status: ReviewStatus, editedValue?: string) {
    if (!currentReview) return;
    data.resolveReview(currentReview.id, status, editedValue);
    if (setupReviews.length === 1 && currentReview.fileId) data.updateFile(currentReview.fileId, { status: "Accepted" });
  }

  const summary = useMemo(() => ({ files: courseFiles.length, assignments: data.assignments.filter((assignment) => assignment.courseId === courseId).length, meetings: data.meetings.filter((meeting) => meeting.courseId === courseId).length }), [courseFiles.length, courseId, data.assignments, data.meetings]);

  return (
    <div className="setup-page">
      <header className="setup-header"><div><Link className="back-link" to="/app"><X size={17} /> Exit setup</Link><p className="eyebrow">Guided course setup</p><div className="setup-title-row">{activeCourse && <span className="course-dot large" style={{ backgroundColor: details.accent }} aria-hidden="true" />}<h1>{activeCourse ? activeCourse.code : "Add a course"}</h1></div></div>{activeCourse && <div className="setup-header-actions"><div className="header-accent-picker"><span>Course color</span><CourseColorPicker value={details.accent} onChange={chooseAccent} compact /></div><span className="save-state"><Check size={14} /> Progress saved</span></div>}</header>
      <Stepper steps={steps} current={current} />
      <section className="setup-card">
        {current === 1 && <form onSubmit={saveDetails}><div className="flow-title"><span className="flow-icon"><BookOpen size={21} /></span><div><p className="eyebrow">Step 1 of 5</p><h2>Course details</h2><p>Add the basics now. Materials can fill in missing details later.</p></div></div><div className="form-grid"><label>Course code<input value={details.code} placeholder="ICS 499" onChange={(event) => setDetails({ ...details, code: event.target.value.toUpperCase() })} autoFocus required /></label><label>Short name<input value={details.shortName} placeholder="Capstone" onChange={(event) => setDetails({ ...details, shortName: event.target.value })} required /></label><label className="wide-field">Course title<input value={details.title} placeholder="Software Engineering and Capstone Project" onChange={(event) => setDetails({ ...details, title: event.target.value })} required /></label><label>Instructor<input value={details.instructor} placeholder="Professor name" onChange={(event) => setDetails({ ...details, instructor: event.target.value })} /></label><label>Term<input value={details.term} onChange={(event) => setDetails({ ...details, term: event.target.value })} required /></label><label>Meeting time<input value={details.meetingTime} placeholder="Thursday, 6:00 PM" onChange={(event) => setDetails({ ...details, meetingTime: event.target.value })} /></label><label>Room or link<input value={details.room} placeholder="Building 20, Room 201" onChange={(event) => setDetails({ ...details, room: event.target.value })} /></label><fieldset className="wide-field accent-field"><legend>Course color</legend><CourseColorPicker value={details.accent} onChange={chooseAccent} /></fieldset></div><div className="flow-actions"><Link className="button" to="/app">Cancel</Link><button className="button primary" type="submit">Save and continue <ArrowRight size={16} /></button></div></form>}

        {current === 2 && <div><div className="flow-title"><span className="flow-icon"><Upload size={21} /></span><div><p className="eyebrow">Step 2 of 5</p><h2>Add course materials</h2><p>Start with the syllabus, then add schedules, assignments, rubrics, presentations, and notes.</p></div></div><label className={`drop-zone ${draggingFiles ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFiles(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFiles(false); }} onDrop={(event) => void dropFiles(event)}><Upload size={25} /><strong>{draggingFiles ? "Drop files or folders here" : "Choose files or drag folders here"}</strong><span>Include a file with "syllabus" in its name. Nested folders are supported.</span><input type="file" multiple accept={courseFileAccept} onChange={selectFiles} /></label>{uploadNotice && <p className="upload-notice" role="status">{uploadNotice}</p>}{orderedCourseFiles.length > 0 && <div className="selected-files ordered-files">{orderedCourseFiles.map((file, index) => <div key={file.id}><span className="queue-number">{index + 1}</span><span><strong>{file.filename}</strong><small>{index === 0 && isSyllabusFilename(file.filename) ? `Syllabus first | ${file.size}` : `${file.size} | Processes after ${orderedCourseFiles[index - 1]?.filename || "the syllabus"}`}</small></span><StatusPill>{file.status}</StatusPill></div>)}</div>}{!hasSyllabus && orderedCourseFiles.length > 0 && <div className="alert alert-warning syllabus-required"><span>Add a file with "syllabus" in its filename to continue. CoursePilot processes it first so dates and course rules guide the remaining documents.</span></div>}<div className="flow-note">You can leave setup after processing starts. Progress is saved, and this same queue will be here when you return.</div><div className="flow-actions"><button className="button" type="button" onClick={() => setCurrent(1)}><ArrowLeft size={16} /> Back</button><button className="button primary" type="button" disabled={orderedCourseFiles.length === 0 || !hasSyllabus} onClick={beginOrganizing}>Upload and organize <ArrowRight size={16} /></button></div></div>}

        {current === 3 && <div>
          <div className="flow-title"><span className="flow-icon"><FileText size={21} /></span><div><p className="eyebrow">Step 3 of 5</p><h2>Organizing your course</h2><p>CoursePilot works through one file at a time, beginning with the syllabus.</p></div></div>
          <section className={`processing-overview ${failedJobs.length ? "has-error" : ""}`}>
            <span className="processing-overview-icon">{setupProcessingComplete ? <Check size={18} /> : failedJobs.length ? <X size={18} /> : <LoaderCircle className="spin" size={18} />}</span>
            <div>
              <p className="eyebrow">{setupProcessingComplete ? "Processing complete" : providerBusy ? "Waiting to retry automatically" : `Processing file ${Math.max(1, activeFileIndex + 1)} of ${orderedCourseFiles.length}`}</p>
              <h3>{setupProcessingComplete ? "Your course materials are ready" : activeProcessingFile?.filename || "Preparing uploads"}</h3>
              <p>{setupProcessingComplete ? `${completedFileCount} files organized.` : providerBusy ? "The AI service is temporarily busy. Your file is safe, and CoursePilot will continue automatically." : failedJobs.length ? "The upload is safe. Try the failed files again to continue from this queue." : activeStage.detail}</p>
            </div>
            <strong>{setupProcessingComplete ? "100%" : `${activeProcessingJob?.progress ?? 0}%`}</strong>
          </section>
          <div className="processing-progress" aria-hidden="true"><span style={{ width: `${setupProcessingComplete ? 100 : activeProcessingJob?.progress ?? 0}%` }} /></div>
          <div className="processing-layout processing-layout-simple">
            <div className="processing-queue">
              {orderedCourseFiles.map((file, index) => {
                const job = data.processingJobs[file.id];
                const terminal = job && ["completed", "needs_review"].includes(job.stage);
                const active = job && !["queued", "completed", "needs_review", "failed"].includes(job.stage);
                return <div className={`processing-queue-item ${active ? "active" : ""} ${terminal ? "complete" : ""}`} key={file.id}>
                  <span className="queue-number">{terminal ? <Check size={13} /> : index + 1}</span>
                  <span className="file-type">{file.fileType}</span>
                  <span className="processing-queue-copy"><strong title={file.filename}>{file.filename}</strong><small>{index === 0 ? "Syllabus first" : `Queue position ${index + 1}`}</small></span>
                  <span className="processing-queue-status"><strong>{job?.errorCode === "provider_busy" ? "Retrying soon" : fileStageLabel(job?.stage)}</strong><small>{terminal ? "Complete" : job?.stage === "failed" ? "Retry available" : `${job?.progress ?? 0}%`}</small></span>
                </div>;
              })}
            </div>
            <aside className="current-file-status">
              <p className="eyebrow">Current activity</p>
              <h3>{providerBusy ? "Paused briefly" : failedJobs.length ? "Needs another attempt" : activeStage.label}</h3>
              <p>{providerBusy ? "No action is needed. CoursePilot will retry with increasing wait times until the provider is available." : failedJobs.length ? "The provider stayed unavailable after automatic retries. Use Try again when you are ready." : activeStage.detail}</p>
              <dl>
                <div><dt>Completed</dt><dd>{completedFileCount} of {orderedCourseFiles.length}</dd></div>
                <div><dt>Current file</dt><dd>{activeFileIndex >= 0 ? activeFileIndex + 1 : orderedCourseFiles.length}</dd></div>
                <div><dt>Queue</dt><dd>{Math.max(0, orderedCourseFiles.length - completedFileCount - (setupProcessingComplete ? 0 : 1))} waiting</dd></div>
              </dl>
            </aside>
          </div>
          {failedJobs.length > 0 && <div className="alert alert-error processing-error"><span>{failedJobs.length} file{failedJobs.length === 1 ? "" : "s"} could not be organized after several attempts. Your uploads are still safe.</span><button className="btn btn-sm" type="button" onClick={retryFailedFiles}>Try again</button></div>}
          <div className="flow-note">Progress is stored in your workspace. Exit setup or open another course at any time, then select this unfinished course from My Courses to return.</div>
          <div className="flow-actions"><button className="button" type="button" onClick={() => setCurrent(2)} disabled={!setupProcessingComplete}><ArrowLeft size={16} /> Back</button><button className="button primary" type="button" disabled={!setupProcessingComplete} onClick={goToReview}>{setupProcessingComplete ? "Review course details" : failedJobs.length ? "Retry to continue" : "Organizing..."} <ArrowRight size={16} /></button></div>
        </div>}

        {current === 4 && <div><div className="flow-title"><span className="flow-icon"><CheckCircle2 size={21} /></span><div><p className="eyebrow">Step 4 of 5</p><h2>Review important details</h2><p>Confirm uncertain information before it enters your course plan.</p></div></div>{currentReview ? <SetupReviewCard key={currentReview.id} review={currentReview} courseCode={details.code} onResolve={resolveSetupReview} /> : <div className="flow-note">{courseFiles.length ? "All extracted details are confirmed." : "No files were added, so there are no extracted details to review."}</div>}<div className="extraction-summary"><div><strong>{summary.assignments}</strong><span>Assignments found</span></div><div><strong>{summary.meetings}</strong><span>Meeting patterns found</span></div><div><strong>{setupReviews.length}</strong><span>Questions remaining</span></div></div><div className="flow-actions"><button className="button" type="button" onClick={() => setCurrent(courseFiles.length ? 3 : 2)}><ArrowLeft size={16} /> Back</button><button className="button primary" type="button" disabled={setupReviews.length > 0} onClick={finishReview}>Finish course setup <ArrowRight size={16} /></button></div></div>}

        {current === 5 && <div className="course-ready"><span className="ready-icon"><Check size={26} /></span><p className="eyebrow">Step 5 of 5</p><h2>{details.code} is ready</h2><p>Your course workspace is organized. You can upload more files or edit details at any time.</p><div className="ready-course-card"><div><span className="course-dot large" style={{ backgroundColor: details.accent }} /><strong>{details.code}: {details.title}</strong></div><dl><div><dt>Files processed</dt><dd>{summary.files}</dd></div><div><dt>Assignments found</dt><dd>{summary.assignments}</dd></div><div><dt>Meetings found</dt><dd>{summary.meetings}</dd></div><div><dt>Questions remaining</dt><dd>0</dd></div></dl></div><div className="flow-actions"><button className="button" type="button" onClick={() => setCurrent(4)}><ArrowLeft size={16} /> Review again</button><button className="button primary" type="button" onClick={finishCourse}>Open course workspace <ArrowRight size={16} /></button></div></div>}
      </section>
      {current > 1 && current < 5 && <p className="setup-save-note"><Save size={14} /> Setup is saved automatically. You can exit and return from My Courses.</p>}
    </div>
  );
}

function SetupReviewCard({ review, courseCode, onResolve }: { review: ReviewItem; courseCode: string; onResolve: (status: ReviewStatus, editedValue?: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(review.extractedValue);

  return <article className="setup-review"><div className="review-meta"><span>{review.fieldName}</span><strong>{courseCode}</strong><StatusPill tone="warning">Needs review</StatusPill></div><h3>{review.question}</h3><div className="evidence-grid"><div><span>Found in document</span>{editing ? <input value={editedValue} onChange={(event) => setEditedValue(event.target.value)} autoFocus /> : <strong>{review.extractedValue}</strong>}</div><div><span>Source</span><strong>{review.sourceReference}</strong><small>{review.confidence} confidence</small></div></div><div className="review-inline-actions">{editing ? <><button className="button" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="button primary" type="button" onClick={() => onResolve("Edited", editedValue)}>Save correction</button></> : <><button className="button" type="button" onClick={() => onResolve("Rejected")}>Reject</button><button className="button" type="button" onClick={() => setEditing(true)}>Edit</button><button className="button primary" type="button" onClick={() => onResolve("Accepted")}>Accept</button></>}</div></article>;
}
