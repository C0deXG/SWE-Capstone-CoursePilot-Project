import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createAssignmentRecord, createCourseRecord, deleteAssignmentRecord, deleteCourseFileRecord, deleteCourseRecord, emptyWorkspaceForUser, getCourseFileUrl, loadProcessingJobs, loadWorkspace, replaceAssignmentRemindersRecord, resolveReviewRecord, retryCourseFileProcessing, subscribeToProcessingJobs, updateAssignmentFieldsRecord, updateAssignmentRecord, updateCourseFileRecord, updateCourseRecord, updatePreferencesRecord, updateProfileRecord, uploadCourseFile, uploadProfilePhotoRecord } from "../lib/workspace-repository";
import type { AppState, Assignment, AssignmentStatus, Course, CourseFile, Preferences, ProcessingJobState, ReviewStatus, UserProfile } from "../types";
import { useAuth } from "./AuthContext";

interface NewCourseInput {
  code: string;
  shortName: string;
  title: string;
  instructor: string;
  term: string;
  meetingTime: string;
  room: string;
  accent: string;
}

interface AppDataValue extends AppState {
  loading: boolean;
  error: string;
  processingJobs: Record<string, ProcessingJobState>;
  addCourse: (input: NewCourseInput) => Course;
  updateCourse: (courseId: string, updates: Partial<Course>) => void;
  removeCourse: (courseId: string) => void;
  addFile: (courseId: string, file: File, processingOrder?: number) => CourseFile;
  addFiles: (courseId: string, files: Array<{ file: File; processingOrder: number }>) => CourseFile[];
  retryFile: (fileId: string) => void;
  updateFile: (fileId: string, updates: Partial<CourseFile>) => void;
  removeFile: (fileId: string) => void;
  getFileUrl: (fileId: string) => Promise<string | null>;
  resolveReview: (reviewId: string, status: ReviewStatus, editedValue?: string) => void;
  addAssignment: (courseId: string, input: Pick<Assignment, "title" | "description" | "dueAt" | "points" | "status">) => Assignment;
  updateAssignment: (assignmentId: string, updates: Partial<Assignment>) => void;
  removeAssignment: (assignmentId: string) => void;
  updateAssignmentStatus: (assignmentId: string, status: AssignmentStatus) => void;
  replaceAssignmentReminders: (assignmentId: string, remindAtValues: string[]) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<void>;
  updatePreferences: (updates: Partial<Preferences>) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<AppState>(() => emptyWorkspaceForUser("", ""));
  const [loadedUserId, setLoadedUserId] = useState("");
  const [error, setError] = useState("");
  const [processingJobs, setProcessingJobs] = useState<Record<string, ProcessingJobState>>({});
  const pendingCourseCreates = useRef<Record<string, Promise<void>>>({});
  const loading = Boolean(user) && loadedUserId !== user?.id;

  useEffect(() => {
    if (!user) return;
    void Promise.all([loadWorkspace(user.id), loadProcessingJobs(user.id)]).then(([workspace, jobs]) => {
      setState(workspace);
      setProcessingJobs(jobs);
      setLoadedUserId(user.id);
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Workspace data could not be loaded.");
      setState(emptyWorkspaceForUser(user.id, user.email));
      setLoadedUserId(user.id);
    });
    return subscribeToProcessingJobs(user.id, (job) => {
      setProcessingJobs((current) => ({ ...current, [job.fileId]: job }));
      const status = job.stage === "completed" ? "Accepted" : job.stage === "needs_review" ? "Needs review" : job.stage === "failed" ? "Failed" : "Processing";
      setState((current) => ({ ...current, files: current.files.map((file) => file.id === job.fileId ? { ...file, status } : file) }));
      if (["completed", "needs_review"].includes(job.stage)) {
        void loadWorkspace(user.id).then(setState).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Processed course data could not be refreshed."));
      }
    });
  }, [user]);

  function commit(updater: (current: AppState) => AppState) {
    setState(updater);
  }

  function queueCourseFiles(courseId: string, uploads: Array<{ file: File; processingOrder: number }>) {
    if (!user) throw new Error("Sign in again before uploading files.");
    const records = uploads.map(({ file, processingOrder }) => ({
      id: crypto.randomUUID(),
      courseId,
      filename: file.name,
      fileType: file.name.split(".").pop()?.toUpperCase() || "FILE",
      size: file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      uploadedAt: "Just now",
      status: "Queued" as const,
      documentType: "unclassified" as const,
      authorityLevel: "search_only" as const,
      processingOrder,
    }));
    commit((current) => ({ ...current, files: [...records, ...current.files] }));
    setProcessingJobs((current) => ({
      ...current,
      ...Object.fromEntries(records.map((record) => [record.id, { fileId: record.id, stage: "queued" as const, progress: 0, processingOrder: record.processingOrder }])),
    }));
    void (pendingCourseCreates.current[courseId] || Promise.resolve()).then(async () => {
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        try {
          await uploadCourseFile(user.id, courseId, record, uploads[index].file);
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "File could not be uploaded.";
          setError(message);
          setProcessingJobs((current) => ({ ...current, [record.id]: { fileId: record.id, stage: "failed", progress: 0, processingOrder: record.processingOrder, errorMessage: message } }));
          commit((current) => ({ ...current, files: current.files.map((item) => item.id === record.id ? { ...item, status: "Failed" } : item) }));
        }
      }
    });
    return records;
  }

  const value: AppDataValue = {
    ...state, loading, error, processingJobs,
    addCourse(input) {
      if (!user) throw new Error("Sign in again before adding a course.");
      const course: Course = { id: crypto.randomUUID(), ...input, progress: 0, setupStep: 1, setupStatus: "draft" };
      commit((current) => ({ ...current, courses: [...current.courses, course] }));
      const createPromise = createCourseRecord(user.id, course).finally(() => { delete pendingCourseCreates.current[course.id]; });
      pendingCourseCreates.current[course.id] = createPromise;
      void createPromise.catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Course could not be saved.");
        commit((current) => ({ ...current, courses: current.courses.filter((item) => item.id !== course.id) }));
      });
      return course;
    },
    updateCourse(courseId, updates) {
      commit((current) => ({ ...current, courses: current.courses.map((course) => course.id === courseId ? { ...course, ...updates } : course) }));
      void (pendingCourseCreates.current[courseId] || Promise.resolve()).then(() => updateCourseRecord(courseId, updates)).catch((reason) => setError(reason instanceof Error ? reason.message : "Course changes could not be saved."));
    },
    removeCourse(courseId) {
      commit((current) => ({
        ...current,
        courses: current.courses.filter((course) => course.id !== courseId),
        files: current.files.filter((file) => file.courseId !== courseId),
        assignments: current.assignments.filter((assignment) => assignment.courseId !== courseId),
        reviews: current.reviews.filter((review) => review.courseId !== courseId),
        meetings: current.meetings.filter((meeting) => meeting.courseId !== courseId),
        policies: current.policies.filter((policy) => policy.courseId !== courseId),
        reminders: current.reminders.filter((reminder) => !current.assignments.some((assignment) => assignment.courseId === courseId && assignment.id === reminder.assignmentId)),
      }));
      void (pendingCourseCreates.current[courseId] || Promise.resolve()).then(() => deleteCourseRecord(courseId)).catch((reason) => setError(reason instanceof Error ? reason.message : "Course could not be removed."));
    },
    addFile(courseId, file, processingOrder = 1000) {
      return queueCourseFiles(courseId, [{ file, processingOrder }])[0];
    },
    addFiles(courseId, files) {
      return queueCourseFiles(courseId, files);
    },
    retryFile(fileId) {
      setProcessingJobs((current) => ({ ...current, [fileId]: { fileId, stage: "queued", progress: 0 } }));
      commit((current) => ({ ...current, files: current.files.map((file) => file.id === fileId ? { ...file, status: "Processing" } : file) }));
      void retryCourseFileProcessing(fileId).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "File processing could not be retried.");
        commit((current) => ({ ...current, files: current.files.map((file) => file.id === fileId ? { ...file, status: "Failed" } : file) }));
      });
    },
    updateFile(fileId, updates) {
      commit((current) => ({ ...current, files: current.files.map((file) => file.id === fileId ? { ...file, ...updates } : file) }));
      void updateCourseFileRecord(fileId, updates).catch((reason) => setError(reason instanceof Error ? reason.message : "File changes could not be saved."));
    },
    removeFile(fileId) {
      commit((current) => ({ ...current, files: current.files.filter((file) => file.id !== fileId), assignments: current.assignments.map((assignment) => assignment.sourceFileId === fileId ? { ...assignment, sourceFileId: undefined, sourceLocation: undefined } : assignment), reviews: current.reviews.filter((review) => review.fileId !== fileId) }));
      void deleteCourseFileRecord(fileId).catch((reason) => setError(reason instanceof Error ? reason.message : "File could not be removed."));
    },
    async getFileUrl(fileId) {
      try {
        return await getCourseFileUrl(fileId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "File could not be opened.");
        return null;
      }
    },
    resolveReview(reviewId, status, editedValue) {
      commit((current) => ({ ...current, reviews: current.reviews.map((review) => review.id === reviewId ? { ...review, status, extractedValue: editedValue || review.extractedValue } : review) }));
      void resolveReviewRecord(reviewId, status, editedValue).then(() => user ? loadWorkspace(user.id).then(setState) : undefined).catch((reason) => setError(reason instanceof Error ? reason.message : "Review could not be saved."));
    },
    addAssignment(courseId, input) {
      const assignment: Assignment = { id: crypto.randomUUID(), courseId, ...input, confidence: "High", description: input.description || "", createdBy: "student" };
      commit((current) => ({ ...current, assignments: [...current.assignments, assignment] }));
      if (user) void createAssignmentRecord(user.id, assignment).then(() => loadWorkspace(user.id)).then(setState).catch((reason) => setError(reason instanceof Error ? reason.message : "Assignment could not be saved."));
      return assignment;
    },
    updateAssignment(assignmentId, updates) {
      commit((current) => ({ ...current, assignments: current.assignments.map((assignment) => assignment.id === assignmentId ? { ...assignment, ...updates } : assignment) }));
      void updateAssignmentFieldsRecord(assignmentId, updates).then(() => user ? loadWorkspace(user.id).then(setState) : undefined).catch((reason) => setError(reason instanceof Error ? reason.message : "Assignment changes could not be saved."));
    },
    removeAssignment(assignmentId) {
      commit((current) => ({ ...current, assignments: current.assignments.filter((assignment) => assignment.id !== assignmentId), reviews: current.reviews.filter((review) => review.assignmentId !== assignmentId), reminders: current.reminders.filter((reminder) => reminder.assignmentId !== assignmentId) }));
      void deleteAssignmentRecord(assignmentId).catch((reason) => setError(reason instanceof Error ? reason.message : "Assignment could not be removed."));
    },
    updateAssignmentStatus(assignmentId, status) {
      commit((current) => ({ ...current, assignments: current.assignments.map((assignment) => assignment.id === assignmentId ? { ...assignment, status } : assignment) }));
      void updateAssignmentRecord(assignmentId, status).catch((reason) => setError(reason instanceof Error ? reason.message : "Assignment status could not be saved."));
    },
    async replaceAssignmentReminders(assignmentId, remindAtValues) {
      if (!user) throw new Error("Sign in again before editing reminders.");
      try {
        await replaceAssignmentRemindersRecord(user.id, assignmentId, remindAtValues, state.preferences);
        setState(await loadWorkspace(user.id));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Reminders could not be saved.");
        throw reason;
      }
    },
    async updateProfile(updates) {
      commit((current) => ({ ...current, profile: { ...current.profile, ...updates } }));
      if (!user) throw new Error("Sign in again before saving your profile.");
      try {
        await updateProfileRecord(user.id, updates);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Profile could not be saved.");
        throw reason;
      }
    },
    async uploadProfilePhoto(file) {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPG or PNG image up to 5 MB.");
      if (!user) throw new Error("Sign in again before uploading a profile photo.");
      const avatarUrl = await uploadProfilePhotoRecord(user.id, file);
      commit((current) => ({ ...current, profile: { ...current.profile, avatarUrl } }));
    },
    async updatePreferences(updates) {
      commit((current) => ({ ...current, preferences: { ...current.preferences, ...updates } }));
      if (!user) throw new Error("Sign in again before saving your preferences.");
      try {
        await updatePreferencesRecord(user.id, updates);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Preferences could not be saved.");
        throw reason;
      }
    },
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
