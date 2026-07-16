import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { FullPageLoading } from "./ui";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}

export function AppRoute() {
  const { profile, loading } = useAppData();
  if (loading) return <FullPageLoading label="Loading your courses" />;
  if (!profile.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
