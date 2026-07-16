import { Check, Download, Save, Trash2, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FormError, Modal, PageHeader } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { initials } from "../lib/format";
import type { Preferences, UserProfile } from "../types";

const sections = ["profile", "notifications", "reminders", "calendar", "privacy"] as const;

export function SettingsPage() {
  const data = useAppData();
  const { deleteAccount, signOut } = useAuth();
  const navigate = useNavigate();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<UserProfile>(data.profile);
  const [preferences, setPreferences] = useState<Preferences>(data.preferences);
  const [saved, setSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    await Promise.all([data.updateProfile(profile), data.updatePreferences(preferences)]);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setPhotoError("");
    setUploadingPhoto(true);
    try {
      await data.uploadProfilePhoto(file);
    } catch (reason) {
      setPhotoError(reason instanceof Error ? reason.message : "Profile photo could not be uploaded.");
    } finally {
      setUploadingPhoto(false);
      input.value = "";
    }
  }

  function exportWorkspace() {
    const workspace = {
      exportedAt: new Date().toISOString(),
      profile: data.profile,
      preferences: data.preferences,
      courses: data.courses,
      files: data.files,
      assignments: data.assignments,
      reviews: data.reviews,
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `coursepilot-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  }

  async function confirmDeleteAccount() {
    setDeleteError("");
    setDeletingAccount(true);
    try {
      await deleteAccount();
      navigate("/login", { replace: true });
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Your account could not be deleted.");
      setDeletingAccount(false);
    }
  }

  const avatarUrl = data.profile.avatarUrl;

  return (
    <>
      <PageHeader
        eyebrow="Workspace preferences"
        title="Settings"
        description="Manage your profile, academic plan, reminders, privacy, and account."
        actions={<button className="button primary" type="submit" form="settings-form"><Save size={15} /> Save changes</button>}
      />
      <form id="settings-form" className="settings-layout" onSubmit={save}>
        <nav className="settings-nav panel" aria-label="Settings sections">
          {sections.map((section) => <a key={section} href={`#${section}`}>{section[0].toUpperCase() + section.slice(1)}</a>)}
        </nav>
        <div className="settings-content">
          {saved && <div className="save-confirmation"><Check size={15} /> Changes saved</div>}

          <section className="panel settings-section" id="profile">
            <p className="eyebrow">Profile</p>
            <h2>Student information</h2>
            <div className="profile-photo-row">
              <span className="avatar large-avatar">
                {avatarUrl ? <img className="avatar-image" src={avatarUrl} alt="" /> : initials(profile.preferredName)}
              </span>
              <div><strong>Profile photo</strong><small>JPG or PNG up to 5 MB</small></div>
              <input ref={photoInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => void uploadPhoto(event)} />
              <button className="button" type="button" disabled={uploadingPhoto} onClick={() => photoInputRef.current?.click()}>
                <Upload size={14} /> {uploadingPhoto ? "Uploading..." : "Upload photo"}
              </button>
            </div>
            <FormError message={photoError} />
            <div className="form-grid">
              <label>Preferred name<input value={profile.preferredName} onChange={(event) => setProfile({ ...profile, preferredName: event.target.value })} /></label>
              <label>Email<input value={profile.email} disabled /></label>
              <label className="wide-field">University or college<input value={profile.university} onChange={(event) => setProfile({ ...profile, university: event.target.value })} /></label>
              <label className="wide-field">Program or major<input value={profile.program} onChange={(event) => setProfile({ ...profile, program: event.target.value })} /></label>
              <label>Graduation month<select value={profile.graduationMonth} onChange={(event) => setProfile({ ...profile, graduationMonth: event.target.value })}><option>May</option><option>August</option><option>December</option></select></label>
              <label>Graduation year<input type="number" value={profile.graduationYear} onChange={(event) => setProfile({ ...profile, graduationYear: event.target.value })} /></label>
              <label>Current term<input value={profile.currentTerm} onChange={(event) => setProfile({ ...profile, currentTerm: event.target.value })} /></label>
              <label>Time zone<select value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}><option value="America/Chicago">Central time</option><option value="America/New_York">Eastern time</option><option value="America/Denver">Mountain time</option><option value="America/Los_Angeles">Pacific time</option></select></label>
            </div>
          </section>

          <section className="panel settings-section" id="notifications">
            <p className="eyebrow">Notifications</p>
            <h2>How CoursePilot reaches you</h2>
            <label className="toggle-row"><span><strong>Email notifications</strong><small>Due dates and important review questions</small></span><input className="preference-checkbox" type="checkbox" checked={preferences.emailNotifications} onChange={(event) => setPreferences({ ...preferences, emailNotifications: event.target.checked })} /></label>
            <label className="toggle-row"><span><strong>Browser notifications</strong><small>Processing completion and upcoming deadlines</small></span><input className="preference-checkbox" type="checkbox" checked={preferences.browserNotifications} onChange={(event) => setPreferences({ ...preferences, browserNotifications: event.target.checked })} /></label>
            <label className="toggle-row"><span><strong>Daily digest</strong><small>A concise morning summary</small></span><input className="preference-checkbox" type="checkbox" checked={preferences.dailyDigest} onChange={(event) => setPreferences({ ...preferences, dailyDigest: event.target.checked })} /></label>
          </section>

          <section className="panel settings-section" id="reminders">
            <p className="eyebrow">Default reminders</p>
            <h2>Assignment reminder times</h2>
            <label className="setting-row"><span><strong>Two days before</strong><small>First reminder</small></span><input type="time" value={preferences.reminderTwoDays} onChange={(event) => setPreferences({ ...preferences, reminderTwoDays: event.target.value })} /></label>
            <label className="setting-row"><span><strong>One day before</strong><small>Follow-up reminder</small></span><input type="time" value={preferences.reminderOneDay} onChange={(event) => setPreferences({ ...preferences, reminderOneDay: event.target.value })} /></label>
            <label className="setting-row"><span><strong>On the due date</strong><small>Final reminder</small></span><input type="time" value={preferences.reminderDueDate} onChange={(event) => setPreferences({ ...preferences, reminderDueDate: event.target.value })} /></label>
          </section>

          <section className="panel settings-section" id="calendar">
            <p className="eyebrow">Calendar</p>
            <h2>Calendar defaults</h2>
            <label className="setting-row"><span><strong>Week starts on</strong></span><select value={preferences.weekStartsOn} onChange={(event) => setPreferences({ ...preferences, weekStartsOn: event.target.value as Preferences["weekStartsOn"] })}><option>Monday</option><option>Sunday</option></select></label>
            <label className="setting-row"><span><strong>Default view</strong></span><select value={preferences.calendarView} onChange={(event) => setPreferences({ ...preferences, calendarView: event.target.value as Preferences["calendarView"] })}><option>Week</option><option>List</option></select></label>
          </section>

          <section className="panel settings-section" id="privacy">
            <p className="eyebrow">Privacy and account</p>
            <h2>Your CoursePilot data</h2>
            <p>Uploaded files and organized course information remain connected to your account. Export or remove your data at any time.</p>
            <div className="privacy-actions">
              <button className="button" type="button" onClick={exportWorkspace}><Download size={15} /> Export my data</button>
              <button className="button danger-text" type="button" onClick={() => { setDeleteError(""); setDeleteOpen(true); }}><Trash2 size={15} /> Delete account</button>
            </div>
            <button className="text-link signout-settings" type="button" onClick={() => void signOut().then(() => navigate("/login"))}>Sign out of CoursePilot</button>
          </section>
        </div>
      </form>

      <Modal open={deleteOpen} title="Delete your account?" description="This action cannot be undone." size="small" onClose={() => { if (!deletingAccount) setDeleteOpen(false); }}>
        <div className="modal-body">
          <p>Your profile, course workspaces, files, assignments, review history, and assistant conversations will be permanently removed.</p>
          <FormError message={deleteError} />
        </div>
        <footer className="modal-actions">
          <button className="button" type="button" disabled={deletingAccount} onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button className="button danger" type="button" disabled={deletingAccount} onClick={() => void confirmDeleteAccount()}><Trash2 size={15} /> {deletingAccount ? "Deleting..." : "Delete account"}</button>
        </footer>
      </Modal>
    </>
  );
}
