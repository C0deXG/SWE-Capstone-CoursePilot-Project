import { Link } from "react-router-dom";
import coursePilotLogo from "../assets/coursepilot-logo.png";

export function Logo({ to = "/app", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand-compact" : ""}`} to={to} aria-label="CoursePilot home">
      <span className="brand-mark" aria-hidden="true"><img src={coursePilotLogo} alt="" /></span>
      {!compact && <strong>CoursePilot</strong>}
    </Link>
  );
}
