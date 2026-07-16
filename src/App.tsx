import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AppRoute, ProtectedRoute } from "./components/RouteGuards";
import { AssignmentPage } from "./pages/AssignmentPage";
import { AssistantPage } from "./pages/AssistantPage";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from "./pages/AuthPages";
import { CalendarPage } from "./pages/CalendarPage";
import { CoursePage } from "./pages/CoursePage";
import { DashboardPage } from "./pages/DashboardPage";
import { NewCoursePage } from "./pages/NewCoursePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return <Routes><Route path="/" element={<Navigate to="/app" replace />} /><Route path="/login" element={<LoginPage />} /><Route path="/signup" element={<SignupPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route element={<ProtectedRoute />}><Route path="/onboarding" element={<OnboardingPage />} /><Route element={<AppRoute />}><Route path="/app" element={<AppShell />}><Route index element={<DashboardPage />} /><Route path="courses" element={<Navigate to="/app" replace />} /><Route path="courses/new" element={<NewCoursePage />} /><Route path="courses/:courseId" element={<CoursePage />} /><Route path="assignments/:assignmentId" element={<AssignmentPage />} /><Route path="calendar" element={<CalendarPage />} /><Route path="review" element={<Navigate to="/app" replace />} /><Route path="assistant" element={<AssistantPage />} /><Route path="settings" element={<SettingsPage />} /></Route></Route></Route><Route path="*" element={<NotFoundPage />} /></Routes>;
}
