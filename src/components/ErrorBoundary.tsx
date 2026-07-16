import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CoursePilot interface error", { name: error.name, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-error">
        <section className="card panel">
          <AlertTriangle size={24} />
          <h1>CoursePilot needs to reload</h1>
          <p>Your saved account and course data are not affected.</p>
          <button className="btn btn-neutral" type="button" onClick={() => window.location.reload()}><RotateCcw size={16} /> Reload application</button>
        </section>
      </main>
    );
  }
}
