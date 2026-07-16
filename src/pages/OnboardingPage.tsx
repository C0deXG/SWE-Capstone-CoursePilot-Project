import { ArrowLeft, ArrowRight, Check, GraduationCap } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { FormError, FullPageLoading, Stepper } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import type { Preferences, UserProfile } from "../types";

const steps = ["About you", "Academic plan", "Preferences", "Ready"];

export function OnboardingPage() {
  const { user } = useAuth();
  const { loading } = useAppData();
  if (!user) return <Navigate to="/login" replace />;
  if (loading) return <FullPageLoading label="Loading your profile" />;
  return <OnboardingForm key={user.id} />;
}

function OnboardingForm() {
  const { user } = useAuth();
  const { profile, preferences, updateProfile, updatePreferences } = useAppData();
  const [step, setStep] = useState(profile.onboardingCompleted ? 4 : Math.min(profile.onboardingStep || 1, 4));
  const [formProfile, setFormProfile] = useState<UserProfile>({ ...profile, email: user?.email || profile.email, onboardingCompleted: false });
  const [formPreferences, setFormPreferences] = useState<Preferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const navigate = useNavigate();

  async function next(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setSaveError("");
    try {
      await Promise.all([
        updateProfile({ ...formProfile, onboardingStep: Math.min(step + 1, 4), onboardingCompleted: false }),
        updatePreferences(formPreferences),
      ]);
      setStep((current) => Math.min(4, current + 1));
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Your onboarding progress could not be saved.");
    } finally { setSaving(false); }
  }

  async function complete() {
    setSaving(true); setSaveError("");
    try {
      await Promise.all([
        updateProfile({ ...formProfile, onboardingStep: 4, onboardingCompleted: true }),
        updatePreferences(formPreferences),
      ]);
      navigate("/app/courses/new", { replace: true });
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Your onboarding could not be completed.");
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header"><Logo /><span>Set up your workspace</span></header>
      <div className="onboarding-wrap">
        <Stepper steps={steps} current={step} />
        <section className="onboarding-card">
          <FormError message={saveError} />
          {step === 1 && (
            <form onSubmit={next}>
              <p className="eyebrow">Step 1 of 4</p><h1>Let us get to know you</h1><p className="page-description">This helps CoursePilot use the right name, dates, and times throughout your workspace.</p>
              <div className="form-grid">
                <label className="wide-field">Preferred name<input value={formProfile.preferredName} onChange={(event) => setFormProfile({ ...formProfile, preferredName: event.target.value })} autoFocus required /></label>
                <label className="wide-field">Time zone<select value={formProfile.timezone} onChange={(event) => setFormProfile({ ...formProfile, timezone: event.target.value })}><option value="America/Chicago">Central time</option><option value="America/New_York">Eastern time</option><option value="America/Denver">Mountain time</option><option value="America/Los_Angeles">Pacific time</option></select></label>
              </div>
              <div className="flow-actions"><span /><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Continue"} <ArrowRight size={16} /></button></div>
            </form>
          )}
          {step === 2 && (
            <form onSubmit={next}>
              <p className="eyebrow">Step 2 of 4</p><h1>Your academic plan</h1><p className="page-description">Add the basics that help organize terms and course timelines.</p>
              <div className="form-grid">
                <label className="wide-field">University or college<input value={formProfile.university} onChange={(event) => setFormProfile({ ...formProfile, university: event.target.value })} required /></label>
                <label className="wide-field">Program or major<input value={formProfile.program} onChange={(event) => setFormProfile({ ...formProfile, program: event.target.value })} required /></label>
                <label>Graduation month<select value={formProfile.graduationMonth} onChange={(event) => setFormProfile({ ...formProfile, graduationMonth: event.target.value })}>{["May", "August", "December"].map((month) => <option key={month}>{month}</option>)}</select></label>
                <label>Graduation year<input type="number" min="2026" max="2040" value={formProfile.graduationYear} onChange={(event) => setFormProfile({ ...formProfile, graduationYear: event.target.value })} required /></label>
                <label className="wide-field">Current term<input value={formProfile.currentTerm} onChange={(event) => setFormProfile({ ...formProfile, currentTerm: event.target.value })} required /></label>
              </div>
              <div className="flow-actions"><button className="button" type="button" onClick={() => setStep(1)} disabled={saving}><ArrowLeft size={16} /> Back</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Continue"} <ArrowRight size={16} /></button></div>
            </form>
          )}
          {step === 3 && (
            <form onSubmit={next}>
              <p className="eyebrow">Step 3 of 4</p><h1>Plan your reminders</h1><p className="page-description">Choose useful defaults. Every setting can be changed later.</p>
              <div className="preference-list">
                <label className="toggle-row"><span><strong>Email reminders</strong><small>Due dates and important review questions</small></span><input className="preference-checkbox" type="checkbox" checked={formPreferences.emailNotifications} onChange={(event) => setFormPreferences({ ...formPreferences, emailNotifications: event.target.checked })} /></label>
                <label className="toggle-row"><span><strong>Daily digest</strong><small>A short morning summary of upcoming work</small></span><input className="preference-checkbox" type="checkbox" checked={formPreferences.dailyDigest} onChange={(event) => setFormPreferences({ ...formPreferences, dailyDigest: event.target.checked })} /></label>
                <label className="setting-row"><span><strong>Week starts on</strong><small>Used by your course calendar</small></span><select value={formPreferences.weekStartsOn} onChange={(event) => setFormPreferences({ ...formPreferences, weekStartsOn: event.target.value as Preferences["weekStartsOn"] })}><option>Monday</option><option>Sunday</option></select></label>
              </div>
              <div className="flow-actions"><button className="button" type="button" onClick={() => setStep(2)} disabled={saving}><ArrowLeft size={16} /> Back</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving..." : "Continue"} <ArrowRight size={16} /></button></div>
            </form>
          )}
          {step === 4 && (
            <div className="ready-step">
              <span className="ready-icon"><GraduationCap size={25} /></span>
              <p className="eyebrow">Your workspace is ready</p><h1>Welcome, {formProfile.preferredName.split(" ")[0]}</h1>
              <p className="page-description">Your profile and planning preferences are set. Add your first course to begin organizing your materials.</p>
              <dl className="ready-summary"><div><dt>School</dt><dd>{formProfile.university}</dd></div><div><dt>Program</dt><dd>{formProfile.program}</dd></div><div><dt>Graduation</dt><dd>{formProfile.graduationMonth} {formProfile.graduationYear}</dd></div><div><dt>Time zone</dt><dd>{formProfile.timezone.replace("America/", "").replace("_", " ")}</dd></div></dl>
              <div className="flow-actions"><button className="button" type="button" onClick={() => setStep(3)} disabled={saving}><ArrowLeft size={16} /> Back</button><button className="button primary" type="button" onClick={() => void complete()} disabled={saving}><Check size={16} /> {saving ? "Saving..." : "Add your first course"}</button></div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
