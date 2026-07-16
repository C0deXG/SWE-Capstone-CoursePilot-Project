import { Bot, CalendarDays, ChevronLeft, ChevronRight, House, Menu, MoreHorizontal, Pencil, Plus, Settings, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { initials } from "../lib/format";
import type { Course } from "../types";
import { CourseEditorModal } from "./CourseEditorModal";
import { Logo } from "./Logo";
import { Modal } from "./ui";

const mainLinks = [
  { to: "/app", label: "Home", icon: House, end: true },
  { to: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/app/assistant", label: "Assistant", icon: Bot },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { courses, profile, removeCourse } = useAppData();
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("coursepilot.sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openCourseMenuId, setOpenCourseMenuId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Course | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Course | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!openCourseMenuId) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(".course-nav-menu")) return;
      setOpenCourseMenuId(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenCourseMenuId(null);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openCourseMenuId]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      localStorage.setItem("coursepilot.sidebar", current ? "expanded" : "collapsed");
      return !current;
    });
  }

  const sidebar = (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="sidebar-top">
        <Logo compact={collapsed} />
        <button className="btn btn-sm btn-square btn-ghost icon-button sidebar-close-mobile" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      </div>

      <nav className="primary-nav" aria-label="Main navigation">
        {mainLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}>
            <span className="nav-link-main"><Icon size={17} strokeWidth={1.8} /><span className="nav-label">{label}</span></span>
          </NavLink>
        ))}
      </nav>

      <div className="course-nav-wrap">
        <p className="sidebar-heading">My courses</p>
        <nav className="course-nav" aria-label="My courses">
          {courses.slice(0, 8).map((course) => {
            return (
              <div className={`course-nav-item ${course.setupStatus !== "ready" ? "unfinished" : ""}`} key={course.id}>
                <NavLink to={course.setupStatus === "ready" ? `/app/courses/${course.id}` : `/app/courses/new?course=${course.id}`} title={collapsed ? course.code : undefined} onClick={() => { setOpenCourseMenuId(null); setMobileOpen(false); }}>
                  <span className="course-dot" style={{ backgroundColor: course.accent }} aria-hidden="true" />
                  <span className="nav-label">{course.code} {course.shortName}</span>
                  {course.setupStatus !== "ready" && <span className="course-nav-state">{course.setupStep}/5</span>}
                </NavLink>
                <div className={`course-nav-menu ${openCourseMenuId === course.id ? "open" : ""}`}>
                  <button className="course-nav-menu-trigger" type="button" aria-label={`Manage ${course.code}`} title={`Manage ${course.code}`} aria-haspopup="menu" aria-expanded={openCourseMenuId === course.id} onClick={() => setOpenCourseMenuId((current) => current === course.id ? null : course.id)}><MoreHorizontal size={15} /></button>
                  {openCourseMenuId === course.id && <ul className="menu course-nav-dropdown" role="menu">
                    {course.setupStatus === "ready" ? <li><button type="button" role="menuitem" onClick={() => { setOpenCourseMenuId(null); setEditTarget(course); setMobileOpen(false); }}><Pencil size={14} /> Edit course</button></li> : <li><button type="button" role="menuitem" onClick={() => { setOpenCourseMenuId(null); setMobileOpen(false); navigate(`/app/courses/new?course=${course.id}`); }}>Continue setup</button></li>}
                    <li><button className="danger-menu-item" type="button" role="menuitem" onClick={() => { setOpenCourseMenuId(null); setRemoveTarget(course); setMobileOpen(false); }}><Trash2 size={14} /> Delete course</button></li>
                  </ul>}
                </div>
              </div>
            );})}
          <NavLink className="course-add" to="/app/courses/new" title={collapsed ? "Add course" : undefined} onClick={() => setMobileOpen(false)}>
            <Plus size={15} /><span className="nav-label">Add course</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-profile">
        <span className="avatar">{profile.avatarUrl ? <img className="avatar-image" src={profile.avatarUrl} alt="" /> : initials(profile.preferredName)}</span>
        <span className="profile-copy nav-label"><strong>{profile.preferredName}</strong><small>{profile.email}</small></span>
        <button className="text-link nav-label" type="button" onClick={() => void signOut().then(() => navigate("/login"))}>Sign out</button>
      </div>

      <button className="sidebar-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
      </button>
    </aside>
  );

  return (
    <>
    <div className={`app-frame ${collapsed ? "sidebar-is-collapsed" : ""}`}>
      <header className="mobile-header"><Logo /><button className="btn btn-sm btn-square btn-ghost icon-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button></header>
      {mobileOpen && <button className="sidebar-overlay" type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      {sidebar}
      <main className="page-shell"><Outlet /></main>
    </div>
    {editTarget && <CourseEditorModal course={editTarget} onClose={() => setEditTarget(null)} />}
    <Modal open={Boolean(removeTarget)} title="Delete course?" description={removeTarget?.setupStatus === "ready" ? "This permanently removes the course and all of its saved information." : "This removes the saved setup and any files already added."} size="small" onClose={() => setRemoveTarget(null)}>
      <div className="modal-body"><p>Delete <strong>{removeTarget?.code}: {removeTarget?.title}</strong>? You cannot undo this action.</p></div>
      <footer className="modal-actions"><button className="button" type="button" onClick={() => setRemoveTarget(null)}>Cancel</button><button className="button danger" type="button" onClick={() => { if (removeTarget) removeCourse(removeTarget.id); setRemoveTarget(null); navigate("/app"); }}><Trash2 size={15} /> Delete course</button></footer>
    </Modal>
    </>
  );
}
