import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return <main className="not-found"><span className="brand-mark">CP</span><p className="eyebrow">Page not found</p><h1>This page is not in your course plan.</h1><p>Return to the dashboard and continue from there.</p><Link className="button primary" to="/app"><ArrowLeft size={15} /> Go to dashboard</Link></main>;
}
