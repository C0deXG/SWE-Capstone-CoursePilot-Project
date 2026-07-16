import { ArrowRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader, StatusPill } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import { dueThisWeek, formatDueCompact } from "../lib/format";

type Filter = "all" | "week" | "review";

export function DashboardPage() {
  const { courses, assignments, profile } = useAppData();
  const [filter, setFilter] = useState<Filter>("all");
  const sorted = useMemo(() => [...assignments].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()), [assignments]);
  const filtered = sorted.filter((assignment) => filter === "all" || (filter === "week" && dueThisWeek(assignment.dueAt)) || (filter === "review" && assignment.confidence !== "High"));
  const setupCourseCount = courses.filter((course) => course.setupStatus !== "ready").length;

  return (
    <>
      <PageHeader eyebrow="Wednesday, July 15" title="All courses" description="One view for your university courses and upcoming work." actions={<Link className="btn btn-sm button" to="/app/courses/new"><Plus size={16} /> Add course</Link>} />

      <section className="stat-grid" aria-label="Course summary">
        <div><strong>{courses.filter((course) => course.setupStatus === "ready").length}</strong><span>Active courses</span></div>
        <div><strong>{assignments.filter((assignment) => assignment.status !== "Completed" && assignment.status !== "Submitted").length}</strong><span>Upcoming items</span></div>
        <div><strong>{setupCourseCount}</strong><span>Courses being set up</span></div>
        <div><strong>{profile.currentTerm}</strong><span>Current term</span></div>
      </section>

      <section className="course-grid" aria-label="Current courses">
        {courses.map((course) => {
          const next = sorted.find((assignment) => assignment.courseId === course.id && assignment.status !== "Completed" && assignment.status !== "Submitted");
          const coursePath = course.setupStatus === "ready" ? `/app/courses/${course.id}` : `/app/courses/new?course=${course.id}`;
          return (
            <article className="card course-card" key={course.id}>
              <div className="course-card-top"><span className="course-dot large" style={{ backgroundColor: course.accent }} /><Link to={coursePath}>{course.code}</Link>{course.setupStatus !== "ready" && <StatusPill tone="warning">Setup {course.setupStep} of 5</StatusPill>}</div>
              <h2>{course.title}</h2><p>{course.instructor || "Instructor not added"}</p>
              <dl className="next-due"><dt>Next due</dt>{next ? <><dd>{next.title}</dd><dd>{formatDueCompact(next.dueAt)}</dd></> : <dd>No upcoming assignment</dd>}</dl>
              <div className="progress-meta"><span>Progress</span><strong>{course.progress}%</strong></div><div className="progress-track"><span style={{ width: `${course.progress}%` }} /></div>
              <Link className="card-open" to={coursePath}>{course.setupStatus === "ready" ? "Open course" : "Continue setup"}<ArrowRight size={14} /></Link>
            </article>
          );
        })}
      </section>

      <section className="card panel section-panel">
        <div className="section-heading"><div><p className="eyebrow">Across all courses</p><h2>Upcoming assignments</h2></div><div className="filter-row" aria-label="Assignment filters">{(["all", "week", "review"] as Filter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "week" ? "This week" : "Needs review"}</button>)}</div></div>
        <div className="table-wrap"><table className="table table-sm data-table"><thead><tr><th>Due</th><th>Assignment</th><th>Course</th><th>Points</th><th>Status</th><th>Confidence</th></tr></thead><tbody>
          {filtered.map((assignment) => { const course = courses.find((item) => item.id === assignment.courseId); return <tr key={assignment.id}><td>{formatDueCompact(assignment.dueAt)}</td><td><Link to={`/app/assignments/${assignment.id}`}><strong>{assignment.title}</strong></Link></td><td>{course?.code}</td><td>{assignment.points}</td><td><StatusPill>{assignment.status}</StatusPill></td><td><span className={`confidence confidence-${assignment.confidence.toLowerCase()}`}>{assignment.confidence}</span></td></tr>; })}
          {filtered.length === 0 && <tr><td colSpan={6} className="table-empty">No assignments match this filter.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
