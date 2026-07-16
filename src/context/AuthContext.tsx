import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ confirmationRequired: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function client() {
  if (!supabase) throw new Error("CoursePilot is not connected to Supabase.");
  return supabase;
}

function mapUser(user: User): AuthUser {
  return { id: user.id, email: user.email ?? "" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      void Promise.resolve().then(() => setLoading(false));
      return;
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setUser(null);
      setUser(data.session?.user ? mapUser(data.session.user) : null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? mapUser(session.user) : null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async signIn(email, password) {
      if (!email.trim() || !password.trim()) throw new Error("Enter your email and password.");
      const { data, error } = await client().auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) setUser(mapUser(data.user));
    },
    async signUp(name, email, password) {
      if (!name.trim()) throw new Error("Enter the name you want CoursePilot to use.");
      if (!email.trim().toLowerCase().endsWith("@gmail.com")) throw new Error("Use a Gmail address for Sprint 2 testing.");
      if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
      const { data, error } = await client().auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { preferred_name: name } } });
      if (error) throw error;
      if (data.session?.user) setUser(mapUser(data.session.user));
      return { confirmationRequired: !data.session };
    },
    async signOut() {
      const { error } = await client().auth.signOut();
      if (error) throw error;
      setUser(null);
    },
    async requestPasswordReset(email) {
      if (!email.trim()) throw new Error("Enter your email address.");
      const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
    },
    async updatePassword(password) {
      if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
      const { error } = await client().auth.updateUser({ password });
      if (error) throw error;
    },
    async deleteAccount() {
      const db = client();
      const { error } = await db.functions.invoke("delete-account");
      if (error) throw error;
      await db.auth.signOut();
      setUser(null);
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
