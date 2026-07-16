import { ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { FormError } from "../components/ui";
import { useAuth } from "../context/AuthContext";

function AuthLayout({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Logo to="/login" />
        <div>
          <p className="eyebrow">Your academic workspace</p>
          <h1>Courses, files, and deadlines in one clear place.</h1>
          <p>Organize every class, confirm important details, and ask questions using your accepted course sources.</p>
        </div>
        <ul className="auth-benefits">
          <li><CheckCircle2 size={17} /> One dashboard for all courses</li>
          <li><CheckCircle2 size={17} /> Source-backed course answers</li>
          <li><CheckCircle2 size={17} /> You confirm uncertain details</li>
        </ul>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}

function PasswordField({ value, onChange, autoComplete = "current-password" }: { value: string; onChange: (value: string) => void; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input className="input input-bordered" id="password" type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required />
      <button className="btn btn-sm btn-square btn-ghost icon-button" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </div>
  );
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  if (user) return <Navigate to="/app" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true); setError("");
    try {
      await signIn(email, password);
      const destination = (location.state as { from?: string } | null)?.from || "/app";
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in could not be completed.");
    } finally { setSubmitting(false); }
  }

  return (
    <AuthLayout eyebrow="Welcome back" title="Sign in" description="Continue to your CoursePilot workspace.">
      <form className="stack-form" onSubmit={submit}>
        <label htmlFor="email">Email address</label>
        <input className="input input-bordered" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        <div className="label-row"><label htmlFor="password">Password</label><Link to="/forgot-password">Forgot password?</Link></div>
        <PasswordField value={password} onChange={setPassword} />
        <FormError message={error} />
        <button className="btn btn-sm btn-neutral button primary full" type="submit" disabled={submitting}>{submitting ? <span className="loading loading-spinner loading-xs" /> : null}{submitting ? "Signing in..." : "Sign in"}</button>
      </form>
      <p className="auth-switch">New to CoursePilot? <Link to="/signup">Create an account</Link></p>
    </AuthLayout>
  );
}

export function SignupPage() {
  const { user, signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const navigate = useNavigate();
  if (user && !confirmationSent) return <Navigate to="/onboarding" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      const result = await signUp(name, email, password);
      if (result.confirmationRequired) setConfirmationSent(true);
      else navigate("/onboarding", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your account could not be created.");
    } finally { setSubmitting(false); }
  }

  if (confirmationSent) return (
    <AuthLayout eyebrow="One more step" title="Check your email" description="Use the confirmation link we sent to finish creating your account.">
      <div className="confirmation-panel"><CheckCircle2 size={28} /><p>Confirmation sent to <strong>{email}</strong>.</p></div>
      <Link className="button full" to="/login">Return to sign in</Link>
    </AuthLayout>
  );

  return (
    <AuthLayout eyebrow="Create your workspace" title="Create an account" description="Start with your profile, then add your first course.">
      <form className="stack-form" onSubmit={submit}>
        <label htmlFor="name">Preferred name</label><input className="input input-bordered" id="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
        <label htmlFor="email">Gmail address</label><input className="input input-bordered" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@gmail.com" required />
        <small className="field-help">Use Gmail for Sprint 2 testing. Email confirmation is required.</small>
        <label htmlFor="password">Password</label><PasswordField value={password} onChange={setPassword} autoComplete="new-password" />
        <small className="field-help">Use at least 8 characters.</small>
        <FormError message={error} />
        <button className="btn btn-sm btn-neutral button primary full" type="submit" disabled={submitting}>{submitting ? <span className="loading loading-spinner loading-xs" /> : null}{submitting ? "Creating account..." : "Create account"}</button>
      </form>
      <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    try { await requestPasswordReset(email); setSent(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The reset request could not be sent."); }
  }

  return (
    <AuthLayout eyebrow="Account recovery" title="Reset your password" description="Enter your email and we will send recovery instructions.">
      {sent ? <div className="confirmation-panel"><CheckCircle2 size={28} /><p>If an account exists for <strong>{email}</strong>, recovery instructions are on the way.</p></div> : (
        <form className="stack-form" onSubmit={submit}>
          <label htmlFor="email">Email address</label><input className="input input-bordered" id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <FormError message={error} /><button className="btn btn-sm btn-neutral button primary full" type="submit">Send recovery link</button>
        </form>
      )}
      <Link className="back-link" to="/login"><ArrowLeft size={15} /> Back to sign in</Link>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  return (
    <AuthLayout eyebrow="Choose a new password" title="Update password" description="Your new password must be at least 8 characters.">
      {saved ? <><div className="confirmation-panel"><CheckCircle2 size={28} /><p>Your password has been updated.</p></div><Link className="button primary full" to="/login">Continue to sign in</Link></> : (
        <form className="stack-form" onSubmit={(event) => { event.preventDefault(); setError(""); void updatePassword(password).then(() => setSaved(true)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The password could not be updated.")); }}>
          <label htmlFor="password">New password</label><PasswordField value={password} onChange={setPassword} autoComplete="new-password" />
          <FormError message={error} />
          <button className="button primary full" type="submit" disabled={password.length < 8}>Save new password</button>
        </form>
      )}
    </AuthLayout>
  );
}
