import { supabase } from "./supabase";
import type { AppState, Assignment, AssignmentStatus, Course, CourseFile, Preferences, ProcessingJobState, ReviewStatus, UserProfile } from "../types";

function client() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function mapFileStatus(value: string): CourseFile["status"] {
  return ({ queued: "Queued", processing: "Processing", accepted: "Accepted", needs_review: "Needs review", failed: "Failed" } as Record<string, CourseFile["status"]>)[value] || "Queued";
}

export async function loadWorkspace(userId: string): Promise<AppState> {
  const db = client();
  const [profileResult, preferencesResult, coursesResult, filesResult, assignmentsResult, reviewsResult, meetingsResult, policiesResult, remindersResult] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).single(),
    db.from("user_preferences").select("*").eq("user_id", userId).single(),
    db.from("courses").select("*").is("archived_at", null).order("created_at"),
    db.from("course_files").select("*").order("created_at", { ascending: false }),
    db.from("assignments").select("*").order("due_at"),
    db.from("review_items").select("*").order("created_at", { ascending: false }),
    db.from("course_meetings").select("*").order("created_at"),
    db.from("course_policies").select("*").order("created_at"),
    db.from("reminders").select("*").order("remind_at"),
  ]);
  const firstError = [profileResult, preferencesResult, coursesResult, filesResult, assignmentsResult, reviewsResult, meetingsResult, policiesResult, remindersResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const row = profileResult.data;
  const preferenceRow = preferencesResult.data;
  let avatarUrl: string | undefined;
  if (row.avatar_path) {
    const { data } = await db.storage.from("course-files").createSignedUrl(row.avatar_path, 3600);
    avatarUrl = data?.signedUrl;
  }

  const profile: UserProfile = {
    id: row.id, email: row.email, preferredName: row.preferred_name, university: row.university,
    program: row.program, graduationMonth: row.graduation_month || "May", graduationYear: row.graduation_year?.toString() || "",
    currentTerm: row.current_term, timezone: row.timezone, onboardingStep: row.onboarding_step,
    onboardingCompleted: Boolean(row.onboarding_completed_at), avatarUrl,
  };
  const preferences: Preferences = {
    emailNotifications: preferenceRow.email_notifications, browserNotifications: preferenceRow.browser_notifications,
    dailyDigest: preferenceRow.daily_digest, reminderTwoDays: preferenceRow.reminder_two_days.slice(0, 5),
    reminderOneDay: preferenceRow.reminder_one_day.slice(0, 5), reminderDueDate: preferenceRow.reminder_due_date.slice(0, 5),
    weekStartsOn: preferenceRow.week_starts_on, calendarView: preferenceRow.calendar_view,
  };
  return {
    profile, preferences,
    courses: (coursesResult.data || []).map((course) => ({ id: course.id, code: course.code, shortName: course.short_name, title: course.title, instructor: course.instructor, term: course.term, meetingTime: course.meeting_time, room: course.room, accent: course.accent, progress: course.progress, setupStep: course.setup_step, setupStatus: course.setup_status })),
    files: (filesResult.data || []).map((file) => ({ id: file.id, courseId: file.course_id, filename: file.filename, fileType: file.filename.split(".").pop()?.toUpperCase() || "FILE", size: file.size_bytes < 1024 * 1024 ? `${Math.max(1, Math.round(file.size_bytes / 1024))} KB` : `${(file.size_bytes / (1024 * 1024)).toFixed(1)} MB`, uploadedAt: new Date(file.created_at).toLocaleString(), status: mapFileStatus(file.status), pageCount: file.page_count || undefined, documentType: file.document_type || "unclassified", classificationConfidence: file.classification_confidence || undefined, authorityLevel: file.authority_level || "search_only", processingOrder: file.processing_order ?? 1000 })),
    assignments: (assignmentsResult.data || []).map((assignment) => ({ id: assignment.id, courseId: assignment.course_id, title: assignment.title, dueAt: assignment.due_at || assignment.created_at, points: Number(assignment.points || 0), status: assignment.status, confidence: assignment.confidence, sourceFileId: assignment.source_file_id || undefined, description: assignment.description, sourceLocation: assignment.source_location || undefined, createdBy: assignment.created_by })),
    reviews: (reviewsResult.data || []).map((review) => ({ id: review.id, courseId: review.course_id, fileId: review.file_id || undefined, assignmentId: review.assignment_id || undefined, fieldName: review.field_name, question: review.question, extractedValue: review.edited_value || review.extracted_value, confidence: review.confidence, sourceReference: review.source_reference, status: review.status, requiredForSetup: review.required_for_setup })),
    meetings: (meetingsResult.data || []).map((meeting) => ({ id: meeting.id, courseId: meeting.course_id, title: meeting.title, dayOfWeek: meeting.day_of_week ?? undefined, startTime: meeting.start_time?.slice(0, 5) || undefined, endTime: meeting.end_time?.slice(0, 5) || undefined, location: meeting.location || undefined, sourceFileId: meeting.source_file_id || undefined })),
    policies: (policiesResult.data || []).map((policy) => ({ id: policy.id, courseId: policy.course_id, category: policy.category, title: policy.title, policyText: policy.policy_text, sourceFileId: policy.source_file_id || undefined, sourceLocation: policy.source_location || undefined })),
    reminders: (remindersResult.data || []).map((reminder) => ({ id: reminder.id, assignmentId: reminder.assignment_id, remindAt: reminder.remind_at, channel: reminder.channel, status: reminder.status })),
  };
}

export async function loadProcessingJobs(userId: string): Promise<Record<string, ProcessingJobState>> {
  const { data, error } = await client()
    .from("processing_jobs")
    .select("file_id, stage, progress, processing_order, error_code, error_message, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const jobs: Record<string, ProcessingJobState> = {};
  for (const job of data || []) {
    if (jobs[job.file_id]) continue;
    jobs[job.file_id] = {
      fileId: job.file_id,
      stage: job.stage,
      progress: job.progress,
      processingOrder: job.processing_order,
      errorCode: job.error_code || undefined,
      errorMessage: job.error_message || undefined,
    };
  }
  return jobs;
}

export async function createCourseRecord(userId: string, course: Course) {
  const db = client();
  const { error } = await db.from("courses").insert({ id: course.id, owner_id: userId, code: course.code, short_name: course.shortName, title: course.title, instructor: course.instructor, term: course.term, meeting_time: course.meetingTime, room: course.room, accent: course.accent, progress: course.progress, setup_step: course.setupStep, setup_status: course.setupStatus });
  if (error) throw error;
  await db.from("enrollments").insert({ user_id: userId, course_id: course.id, role: "owner" });
}

export async function updateCourseRecord(courseId: string, updates: Partial<Course>) {
  const payload: Record<string, unknown> = {};
  const mapping: Record<keyof Course, string> = { id: "id", code: "code", shortName: "short_name", title: "title", instructor: "instructor", term: "term", meetingTime: "meeting_time", room: "room", accent: "accent", progress: "progress", setupStep: "setup_step", setupStatus: "setup_status" };
  for (const [key, value] of Object.entries(updates)) payload[mapping[key as keyof Course]] = value;
  const { error } = await client().from("courses").update(payload).eq("id", courseId);
  if (error) throw error;
}

export async function deleteCourseRecord(courseId: string) {
  const { error } = await client().from("courses").delete().eq("id", courseId);
  if (error) throw error;
}

export async function uploadCourseFile(userId: string, courseId: string, record: CourseFile, file: File) {
  const db = client();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${courseId}/${record.id}-${safeName}`;
  const { error: uploadError } = await db.storage.from("course-files").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw uploadError;
  const { error: fileError } = await db.from("course_files").insert({ id: record.id, user_id: userId, course_id: courseId, storage_path: path, filename: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size, status: "queued", processing_order: record.processingOrder });
  if (fileError) { await db.storage.from("course-files").remove([path]); throw fileError; }
  const { error: enqueueError } = await db.rpc("enqueue_course_file", { p_file_id: record.id });
  if (enqueueError) throw enqueueError;
}

export async function retryCourseFileProcessing(fileId: string) {
  const { error } = await client().rpc("enqueue_course_file", { p_file_id: fileId });
  if (error) throw error;
}

export async function updateCourseFileRecord(fileId: string, updates: Partial<CourseFile>) {
  const payload: Record<string, unknown> = {};
  if (updates.status) payload.status = updates.status.toLowerCase().replace(" ", "_");
  if (updates.pageCount !== undefined) payload.page_count = updates.pageCount;
  if (!Object.keys(payload).length) return;
  const { error } = await client().from("course_files").update(payload).eq("id", fileId);
  if (error) throw error;
}

export async function getCourseFileUrl(fileId: string) {
  const db = client();
  const { data: file, error: fileError } = await db.from("course_files").select("storage_bucket, storage_path").eq("id", fileId).single();
  if (fileError || !file) throw fileError || new Error("Course file was not found.");
  const { data, error } = await db.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 120);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteCourseFileRecord(fileId: string) {
  const db = client();
  const { data: file, error: fileError } = await db.from("course_files").select("storage_bucket, storage_path").eq("id", fileId).single();
  if (fileError || !file) throw fileError || new Error("Course file was not found.");
  const { error: storageError } = await db.storage.from(file.storage_bucket).remove([file.storage_path]);
  if (storageError) throw storageError;
  const { error } = await db.from("course_files").delete().eq("id", fileId);
  if (error) throw error;
}

export async function updateAssignmentRecord(id: string, status: AssignmentStatus) {
  const { error } = await client().from("assignments").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function createAssignmentRecord(userId: string, assignment: Assignment) {
  const { error } = await client().from("assignments").insert({ id: assignment.id, user_id: userId, course_id: assignment.courseId, title: assignment.title, description: assignment.description, due_at: assignment.dueAt, points: assignment.points, status: assignment.status, confidence: assignment.confidence, created_by: assignment.createdBy, confirmed_at: new Date().toISOString() });
  if (error) throw error;
}

export async function updateAssignmentFieldsRecord(id: string, updates: Partial<Assignment>) {
  const payload: Record<string, unknown> = {};
  const mapping: Partial<Record<keyof Assignment, string>> = { title: "title", description: "description", dueAt: "due_at", points: "points", status: "status" };
  for (const [key, value] of Object.entries(updates)) {
    const column = mapping[key as keyof Assignment];
    if (column) payload[column] = value;
  }
  if (!Object.keys(payload).length) return;
  const { error } = await client().from("assignments").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteAssignmentRecord(id: string) {
  const { error } = await client().from("assignments").delete().eq("id", id);
  if (error) throw error;
}

export async function resolveReviewRecord(id: string, status: ReviewStatus, editedValue?: string) {
  const { error } = await client().rpc("resolve_review_item", {
    requested_review_id: id,
    requested_status: status,
    requested_value: editedValue || null,
  });
  if (error) throw error;
}

export async function updateProfileRecord(userId: string, updates: Partial<UserProfile>) {
  const payload: Record<string, unknown> = {};
  const mapping: Partial<Record<keyof UserProfile, string>> = {
    preferredName: "preferred_name",
    university: "university",
    program: "program",
    graduationMonth: "graduation_month",
    currentTerm: "current_term",
    timezone: "timezone",
    onboardingStep: "onboarding_step",
  };
  for (const [key, value] of Object.entries(updates)) {
    if (key === "graduationYear") payload.graduation_year = Number(value) || null;
    else if (key === "onboardingCompleted") payload.onboarding_completed_at = value ? new Date().toISOString() : null;
    else if (mapping[key as keyof UserProfile]) payload[mapping[key as keyof UserProfile]!] = value;
  }
  const { error } = await client().from("profiles").update(payload).eq("id", userId);
  if (error) throw error;
}

export async function uploadProfilePhotoRecord(userId: string, file: File) {
  const db = client();
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/profile/avatar-${Date.now()}.${extension}`;
  const { data: currentProfile } = await db.from("profiles").select("avatar_path").eq("id", userId).single();
  const { error: uploadError } = await db.storage.from("course-files").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { error: profileError } = await db.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (profileError) {
    await db.storage.from("course-files").remove([path]);
    throw profileError;
  }
  if (currentProfile?.avatar_path) await db.storage.from("course-files").remove([currentProfile.avatar_path]);
  const { data, error } = await db.storage.from("course-files").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function updatePreferencesRecord(userId: string, updates: Partial<Preferences>) {
  const payload: Record<string, unknown> = {};
  const mapping: Record<keyof Preferences, string> = {
    emailNotifications: "email_notifications",
    browserNotifications: "browser_notifications",
    dailyDigest: "daily_digest",
    reminderTwoDays: "reminder_two_days",
    reminderOneDay: "reminder_one_day",
    reminderDueDate: "reminder_due_date",
    weekStartsOn: "week_starts_on",
    calendarView: "calendar_view",
  };
  for (const [key, value] of Object.entries(updates)) payload[mapping[key as keyof Preferences]] = value;
  const { error } = await client().from("user_preferences").update(payload).eq("user_id", userId);
  if (error) throw error;
}

export async function replaceAssignmentRemindersRecord(userId: string, assignmentId: string, remindAtValues: string[], preferences: Preferences) {
  const db = client();
  const { error: deleteError } = await db.from("reminders").delete().eq("assignment_id", assignmentId).eq("status", "scheduled");
  if (deleteError) throw deleteError;

  const channels: Array<"in_app" | "email" | "browser"> = ["in_app"];
  if (preferences.emailNotifications) channels.push("email");
  if (preferences.browserNotifications) channels.push("browser");
  const times = [...new Set(remindAtValues.map((value) => new Date(value).toISOString()))].filter((value) => new Date(value).getTime() > Date.now());
  if (!times.length) return;
  const { error } = await db.from("reminders").insert(times.flatMap((remindAt) => channels.map((channel) => ({ user_id: userId, assignment_id: assignmentId, remind_at: remindAt, channel }))));
  if (error) throw error;
}

export function subscribeToProcessingJobs(userId: string, onChange: (job: ProcessingJobState) => void) {
  const db = client();
  const channel = db.channel(`processing-jobs:${userId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "processing_jobs", filter: `user_id=eq.${userId}` }, (payload) => onChange({
    fileId: payload.new.file_id as string,
    stage: payload.new.stage as ProcessingJobState["stage"],
    progress: payload.new.progress as number,
    processingOrder: payload.new.processing_order as number | undefined,
    errorCode: payload.new.error_code as string | undefined,
    errorMessage: payload.new.error_message as string | undefined,
  })).subscribe();
  return () => { void db.removeChannel(channel); };
}

export async function askCourse(question: string, courseId?: string, conversationId?: string) {
  const { data, error } = await client().functions.invoke("ask-course", { body: { question, courseId: courseId || null, conversationId: conversationId || null } });
  if (error) throw error;
  return data as { conversationId: string; answer: string; citations: Array<{ chunkId: string; fileId: string; label: string }> };
}

export function emptyWorkspaceForUser(id: string, email: string): AppState {
  return {
    profile: { id, email, preferredName: "", university: "", program: "", graduationMonth: "May", graduationYear: "", currentTerm: "", timezone: "America/Chicago", onboardingStep: 1, onboardingCompleted: false },
    preferences: { emailNotifications: true, browserNotifications: true, dailyDigest: true, reminderTwoDays: "09:00", reminderOneDay: "09:00", reminderDueDate: "09:00", weekStartsOn: "Monday", calendarView: "Week" },
    courses: [], files: [], assignments: [], reviews: [], meetings: [], policies: [], reminders: [],
  };
}
