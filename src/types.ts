export type AssignmentStatus = "Not started" | "In progress" | "Completed" | "Submitted" | "Needs review";
export type Confidence = "High" | "Medium" | "Low";
export type ReviewStatus = "Needs review" | "Accepted" | "Edited" | "Rejected" | "Deferred";
export type SetupStatus = "draft" | "processing" | "review" | "ready";
export type DocumentType = "unclassified" | "syllabus" | "course_schedule" | "assignment_brief" | "rubric" | "lecture_notes" | "slides" | "reading" | "reference" | "other";
export type AuthorityLevel = "authoritative" | "supporting" | "search_only";

export interface UserProfile {
  id: string;
  email: string;
  preferredName: string;
  university: string;
  program: string;
  graduationMonth: string;
  graduationYear: string;
  currentTerm: string;
  timezone: string;
  onboardingStep: number;
  onboardingCompleted: boolean;
  avatarUrl?: string;
}

export interface Preferences {
  emailNotifications: boolean;
  browserNotifications: boolean;
  dailyDigest: boolean;
  reminderTwoDays: string;
  reminderOneDay: string;
  reminderDueDate: string;
  weekStartsOn: "Monday" | "Sunday";
  calendarView: "Week" | "List";
}

export interface Course {
  id: string;
  code: string;
  shortName: string;
  title: string;
  instructor: string;
  term: string;
  meetingTime: string;
  room: string;
  accent: string;
  progress: number;
  setupStep: number;
  setupStatus: SetupStatus;
}

export interface CourseFile {
  id: string;
  courseId: string;
  filename: string;
  fileType: string;
  size: string;
  uploadedAt: string;
  status: "Queued" | "Processing" | "Accepted" | "Needs review" | "Failed";
  pageCount?: number;
  documentType: DocumentType;
  classificationConfidence?: "high" | "medium" | "low";
  authorityLevel: AuthorityLevel;
  processingOrder: number;
}

export interface CourseMeeting {
  id: string;
  courseId: string;
  title: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  location?: string;
  sourceFileId?: string;
}

export interface CoursePolicy {
  id: string;
  courseId: string;
  category: string;
  title: string;
  policyText: string;
  sourceFileId?: string;
  sourceLocation?: string;
}

export interface Reminder {
  id: string;
  assignmentId: string;
  remindAt: string;
  channel: "email" | "browser" | "in_app";
  status: "scheduled" | "sent" | "cancelled" | "failed";
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  dueAt: string;
  points: number;
  status: AssignmentStatus;
  confidence: Confidence;
  sourceFileId?: string;
  description: string;
  sourceLocation?: string;
  createdBy: "extracted" | "student";
}

export interface ReviewItem {
  id: string;
  courseId: string;
  fileId?: string;
  assignmentId?: string;
  fieldName: string;
  question: string;
  extractedValue: string;
  confidence: Confidence;
  sourceReference: string;
  status: ReviewStatus;
  requiredForSetup: boolean;
}

export interface ProcessingStage {
  id: string;
  label: string;
  detail: string;
  status: "waiting" | "active" | "complete" | "failed";
}

export type ProcessingJobStage =
  | "queued"
  | "validating"
  | "extracting_text"
  | "chunking"
  | "embedding"
  | "extracting_facts"
  | "creating_reviews"
  | "completed"
  | "needs_review"
  | "failed";

export interface ProcessingJobState {
  fileId: string;
  stage: ProcessingJobStage;
  progress: number;
  processingOrder?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ label: string; fileId: string }>;
}

export interface AppState {
  profile: UserProfile;
  preferences: Preferences;
  courses: Course[];
  files: CourseFile[];
  assignments: Assignment[];
  reviews: ReviewItem[];
  meetings: CourseMeeting[];
  policies: CoursePolicy[];
  reminders: Reminder[];
}
