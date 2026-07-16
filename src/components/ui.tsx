import { Check, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const daisyTone = { neutral: "badge-neutral", success: "badge-success", warning: "badge-warning", danger: "badge-error", info: "badge-info" }[tone];
  return <span className={`badge badge-soft badge-sm status-pill status-${tone} ${daisyTone}`}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card empty-state">
      <div className="empty-symbol" aria-hidden="true">+</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label={`Step ${current} of ${steps.length}`}>
      {steps.map((label, index) => {
        const number = index + 1;
        const complete = number < current;
        const active = number === current;
        return (
          <li key={label} className={`${complete ? "complete" : ""} ${active ? "active" : ""}`} aria-current={active ? "step" : undefined}>
            <span className="step-number">{complete ? <Check size={14} strokeWidth={2.5} /> : number}</span>
            <span className="step-label">{label}</span>
            {index < steps.length - 1 && <ChevronRight className="step-chevron" size={15} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function Modal({ open, title, description, children, onClose, size = "medium" }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void; size?: "small" | "medium" | "large" }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hidden);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal modal-open custom-modal" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section ref={panelRef} className={`modal-box modal-panel modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button ref={closeRef} className="btn btn-sm btn-square btn-ghost icon-button" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function FullPageLoading({ label = "Loading CoursePilot" }: { label?: string }) {
  return <div className="full-loading"><span className="loading loading-spinner loading-sm" /><span>{label}</span></div>;
}

export function FormError({ message }: { message?: string }) {
  return message ? <p className="alert alert-error form-error" role="alert">{message}</p> : null;
}
