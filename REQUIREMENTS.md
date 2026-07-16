# CoursePilot Product Requirements and Delivery Plan

Version: 1.1
Status: Active implementation document
Last updated: July 16, 2026
Owners: CoursePilot team

This document is the source of truth for CoursePilot. It explains the intended experience, the behavior of every major feature, the required data and service architecture, the definition of done for each workflow, and the steps required to launch the application. Implementation checkboxes are updated only after the related behavior is built and verified.

## 1. Product Summary

CoursePilot is a private academic workspace that helps university students organize multiple courses from the documents they already receive. A student can create course workspaces, upload syllabi and assignment materials, review uncertain extracted details, see assignments across courses, and ask questions that are answered from their accepted course sources.

The product must reduce manual organization while keeping the student in control. Model-generated information is never treated as confirmed course truth until it has sufficient confidence or the student approves it.

## 2. Product Goals

- Give a student one useful dashboard for all active courses.
- Make first-time setup guided, clear, resumable, and quick.
- Turn course documents into structured assignments, meetings, policies, and reminders.
- Show real processing status instead of a fake loading indicator.
- Ask focused clarification questions when a document is ambiguous.
- Let students verify or edit extracted information before it affects their plan.
- Answer course questions from the student's own accepted source material.
- Cite the supporting file, page, and section for assistant answers.
- Keep one student's identity, courses, documents, and answers private from every other user.
- Work well on laptop, tablet, and mobile layouts.

## 3. Non-Goals for the Initial Release

- Course registration or payment.
- Direct access to university passwords.
- Automatic submission of assignments.
- Automatic email sending to instructors.
- Replacing the university learning management system.
- Grading a student's work as if the result came from an instructor.
- Creating unsupported facts when the course materials do not contain an answer.
- A public social network or shared student marketplace.

## 4. Product Principles

### 4.1 Calm and focused

The interface uses the approved minimal CoursePilot style: white and soft gray surfaces, black text, thin borders, small course accents, limited decoration, and clear spacing. Cards use small radii. Gradients, oversized marketing sections, excessive color, and ornamental effects are excluded.

### 4.2 Useful first

The first application screen is the student's course dashboard. A course screen must answer: what is next, what is unfinished, which files support it, and what requires attention.

### 4.3 Confirm before trusting

The application distinguishes uploaded source material, extracted candidate information, student-confirmed information, and assistant responses. Uncertain information is visibly routed to review.

### 4.4 Explain current state

Every long-running operation has named stages, timestamps, progress, failure states, and a retry path. The interface must not claim processing is complete before the backend job is complete.

### 4.5 Continue without losing work

Onboarding, course setup, file processing, and review progress persist to the student's account. Closing the page or signing out must not erase completed steps.

## 5. Users and Core Scenarios

### Primary user

A university student taking approximately four courses who receives course information across PDF, DOCX, PPTX, TXT, and image files.

### Core scenarios

1. A new student creates an account and completes onboarding.
2. The student creates a course through a guided setup flow.
3. The student uploads a syllabus and watches its real processing stages.
4. CoursePilot extracts assignments and asks the student about uncertain details.
5. The student confirms the details and opens a useful course command center.
6. The student manages deadlines across all courses from one dashboard and calendar.
7. The student asks a question and receives an answer with course source citations.
8. The student edits profile, reminder, privacy, and course settings.

## 6. Approved Technology Decisions

- Frontend: Vite, React, TypeScript.
- Component system: Tailwind CSS and daisyUI 5 with CoursePilot-specific visual tokens.
- Routing: React Router.
- Icons: Lucide React.
- Authentication: Supabase Auth.
- Relational database: Supabase Postgres.
- File storage: private Supabase Storage bucket.
- Vector search: Supabase Postgres with pgvector.
- Real-time processing updates: Supabase Realtime on processing job records.
- Reasoning and structured extraction: Claude Sonnet through the Python worker and course-answer Edge Function.
- Embeddings: OpenAI `text-embedding-3-large` with 1536 dimensions.
- Server-side model calls: Python ingestion worker for documents and Supabase Edge Functions for interactive answers.
- Document parsing: open-source Docling in a separate Python worker.
- Ingestion orchestration: Supabase processing job records with worker claiming, heartbeat, retry, and Realtime progress.
- Hosting target: Vercel for the Vite frontend, Supabase for data and interactive functions, and a persistent Python worker service selected before production.
- Source control: GitHub.

No provider secret may be exposed through a `VITE_` environment variable, frontend bundle, browser request, committed file, log message, or error response.

## 7. Information Architecture

### Public routes

- `/login`: existing-user sign in.
- `/signup`: account creation.
- `/forgot-password`: password reset request.
- `/reset-password`: choose a new password after recovery.

### Protected routes

- `/onboarding`: first-time student onboarding.
- `/app`: all-courses dashboard.
- `/app/courses/new`: guided course setup.
- `/app/courses/:courseId`: course overview.
- `/app/courses/:courseId/assignments`: course assignments.
- `/app/courses/:courseId/files`: course source files.
- `/app/courses/:courseId/details`: class information and policies.
- `/app/assignments/:assignmentId`: assignment detail.
- `/app/calendar`: all-courses calendar.
- `/app/assistant`: assistant across accepted course sources.
- `/app/settings`: profile, notifications, reminders, privacy, and account controls.

## 8. Authentication and Account Lifecycle

### 8.1 Sign up

The student enters a name, university email, and password, then accepts the terms shown by the application. Supabase creates the authentication identity and a matching profile record.

Completion criteria:

- Email format and password requirements are validated.
- Duplicate account errors are explained without exposing account internals.
- The interface shows whether email confirmation is required.
- Successful sign up routes the student to onboarding after an authenticated session exists.
- Refreshing the page preserves the authenticated session.

### 8.2 Sign in

The student signs in with email and password. The protected app shell becomes available only after the session is verified.

Completion criteria:

- Valid credentials open the correct next route.
- Incomplete onboarding routes to `/onboarding`.
- Completed onboarding routes to `/app`.
- Invalid credentials show a clear inline error.
- Loading state prevents duplicate submissions.

### 8.3 Password recovery

Completion criteria:

- The reset request does not reveal whether an email address exists.
- A valid recovery link opens the reset-password screen.
- A new password can be saved and used for sign in.

### 8.4 Sign out and account deletion

Completion criteria:

- Sign out clears the local session and returns to login.
- Account deletion requires explicit confirmation.
- Deletion removes or schedules removal of profile data, course records, private files, chunks, and embeddings.

## 9. Student Onboarding

The first-time experience is a focused, full-page step flow with a numbered progress rail. Completed steps display checkmarks. Answers save after every step and the user can go backward without losing data.

### Step 1: Welcome and identity

Collect:

- Preferred name.
- Optional profile image.
- Time zone, defaulted from the browser and editable.

Done when the preferred name and valid time zone are saved.

### Step 2: Academic plan

Collect:

- University or college name.
- Program or major.
- Expected graduation month and year.
- Current term name, such as Summer 2026.

Do not collect a student ID, school password, home address, financial data, or other information that the product does not need.

Done when the required academic fields are saved or an explicitly optional field is skipped.

### Step 3: Planning preferences

Collect:

- Default reminder times.
- Email and browser notification preferences.
- Week start preference.
- Default calendar view.

Done when preferences are validated and saved.

### Step 4: Ready

Show a concise summary and the primary action `Add your first course`.

Done when `onboarding_completed_at` is written. The user can edit every field later in Settings.

### Onboarding behavior requirements

- Current step is stored in the profile.
- Route guards return incomplete users to the correct step.
- Browser back and explicit Back both preserve saved data.
- The flow is keyboard accessible and mobile safe.
- A failure to save blocks moving forward and explains what to retry.

## 10. Application Shell and Navigation

The protected application uses a left sidebar on desktop, a collapsible icon rail, and a drawer on mobile.

Required navigation:

- Home.
- Calendar.
- Assistant.
- Settings.
- My Courses with course accent dots, setup progress, and course-specific attention counts.
- Add course action.
- Profile summary and sign out.

Completion criteria:

- Hamburger control collapses and expands the desktop sidebar.
- Mobile drawer traps focus while open and closes with Escape or overlay click.
- Active route is visible.
- Course links remain scannable when four or more courses exist.
- Long names truncate without overlapping controls.
- Navigation state does not shift the main content unexpectedly.

## 11. All-Courses Dashboard

The dashboard gives a useful summary across every active course.

Required content:

- Current date and term.
- Active course count.
- Upcoming assignment count.
- Number of courses needing attention.
- Unread assistant or system notification count when implemented.
- One card per active course with next deadline and course progress.
- Upcoming assignments table with course, due date, points, status, and confidence.
- Filters for all, this week, and needs review.
- Empty state that starts the add-course flow.

Completion criteria:

- Counts are derived from current database records.
- Course cards open the correct course.
- Upcoming work is sorted by due date.
- Date and time display in the profile time zone.
- Filters work without losing route state.
- Loading, empty, and query-error states are present.

## 12. My Courses Navigation

My Courses in the application sidebar is the single course navigation and management surface. A separate Courses tab or page is intentionally omitted because students normally manage approximately four courses at a time.

Each course entry shows:

- Course accent dot.
- Course code and short name.
- Saved setup step when incomplete.
- Ellipsis menu on every course.

Completion criteria:

- Add course opens the guided flow directly.
- Step 1 creates the draft course and immediately adds it to My Courses.
- Clicking an unfinished course opens its exact saved setup step directly, with no intermediate screen.
- Unfinished-course menus provide Continue setup and Delete course actions.
- Clicking a ready course opens its course workspace.
- Ready-course menus provide Edit course and Delete course actions. The same management actions remain available in the course header and Details section.
- Deletion cascades only within the signed-in student's records.
- A failed deletion leaves the course visible and reports the error.

## 13. Guided New-Course Setup

Course setup is a focused five-step flow. It may be presented as a large modal on desktop and a full-screen flow on mobile. Progress is saved after each step.

### Step 1: Course details

Collect:

- Course code.
- Course title.
- Short display name.
- Instructor.
- Term.
- Meeting pattern and time.
- Room or online location.
- Course accent from distinct presets or a custom color picker.

Done when course code, title, term, accent, and ownership record are saved. The selected accent updates the course dot during setup and remains consistent in navigation, dashboard, calendar, and course pages.

### Step 2: Add materials

Accept PDF, DOCX, PPTX, TXT, and supported image files. Show file size and type before upload. Multiple files may be uploaded.

Done when at least one valid file is stored, or the student explicitly chooses `Set up without files`.

### Step 3: Organize files

Show actual processing stages for every file:

1. Upload received.
2. File validated.
3. Text extracted.
4. Content divided into source chunks.
5. Embeddings created.
6. Course information detected.
7. Candidate assignments, meetings, and policies saved.
8. Review questions prepared.

Each completed stage changes to a checkmark. The current stage shows active progress. Failed stages show a reason and Retry action.

Done when all current files reach `processed`, `needs_review`, or an acknowledged failure state. A UI timer alone never marks this step complete.

### Step 4: Review details

Show uncertain or conflicting extracted values as one focused question at a time. The student can accept, edit, reject, or return to the source.

Done when every required review item for setup is resolved. Optional unresolved items may be deferred and remain visible in the global review queue.

### Step 5: Course ready

Show:

- Files processed.
- Assignments found.
- Next deadline.
- Meetings found.
- Remaining review items.
- Open course button.

Done when `setup_completed_at` is saved. The course becomes fully active on the dashboard.

### Continuation and cancellation behavior

- Closing the flow keeps the draft course.
- My Courses displays the saved setup step.
- Clicking the unfinished course opens the first incomplete step directly.
- Cancel setup requires confirmation and can delete the draft course and its files.

## 14. Course Command Center

Opening a course must show information specific to that class rather than a generic dashboard.

### Course header

- Course code and full title.
- Instructor, meeting time, and location.
- Course-specific Calendar and Upload files actions.
- Tabs for Overview, Assignments, Files, Course details, and Ask CoursePilot.

### Overview

- Next deadline.
- Open assignment count.
- Review count.
- Course progress.
- Assignments to work on.
- Do next panel with due date, points, status, and open action.
- Recent source files.
- Class information and extracted policies.

Completion criteria:

- Every value belongs to the selected course.
- Empty course sections provide a relevant next action.
- Assignment status changes update course progress and dashboard counts.
- Course review count links to filtered review items.

## 15. Files and Upload Processing

### Upload behavior

- Drag and drop and file picker are supported.
- Allowed types and maximum size are displayed before upload.
- Upload progress is shown per file.
- Files are stored in a private user/course path.
- Duplicate file handling is explicit: replace, keep both, or cancel.

### Processing job states

- `queued`
- `validating`
- `extracting_text`
- `chunking`
- `embedding`
- `extracting_facts`
- `creating_reviews`
- `completed`
- `needs_review`
- `failed`

### File status behavior

- Status updates arrive through Supabase Realtime.
- Refreshing the page restores the latest server state.
- Failed processing can be retried without uploading again when the stored file is valid.
- Replacing a file versions or removes stale chunks and embeddings.
- Deleting a file removes its bytes, chunks, embeddings, and unconfirmed extracted candidates.

Completion criteria:

- A processed file has text chunks with page or section metadata.
- Every chunk belongs to the correct user, course, and file.
- The UI never displays provider keys or raw provider errors.

## 16. Extraction and Review

Claude Sonnet receives only the material required for the current processing job. It returns validated structured data, not free-form text that is directly inserted into core tables.

Candidate entity types:

- Assignment.
- Exam or quiz.
- Meeting or class session.
- Course policy.
- Required material.
- Instructor contact information.
- Office hour.
- Course milestone.

Each candidate includes:

- Proposed structured value.
- Confidence level.
- Supporting file and location.
- Source excerpt reference.
- Extraction timestamp and model identifier.

### Review actions

- Accept: candidate becomes confirmed data.
- Edit: student value becomes confirmed data while preserving the original candidate for audit.
- Reject: candidate is excluded.
- Defer: item remains in the queue and does not become confirmed data.
- View source: opens the supporting file location when available.

Completion criteria:

- Review counts update in real time.
- Resolved items leave the open queue and can be viewed in history.
- Only accepted or edited information drives confirmed calendar records.
- Conflicting due dates always require review.

## 17. Assignments

An assignment stores title, course, description, due time, points, status, confidence, source, and optional reminders.

Supported statuses:

- Not started.
- In progress.
- Completed.
- Submitted.
- Needs review.

Completion criteria:

- Assignment details show the source and confirmation state.
- Status can be changed from the detail screen.
- Completing an assignment updates progress calculations.
- Due dates use the student's time zone.
- Manual assignments are marked as student-created.

## 18. Calendar

The calendar combines confirmed assignments and course meetings across all active courses.

Required behavior:

- Week and list views.
- Today action.
- Previous and next period controls.
- Current-day highlight.
- Course color key.
- Upcoming agenda panel.
- Course filter.
- Assignment links.
- Responsive horizontal calendar scrolling without page clipping.

Completion criteria:

- Calendar dates are generated from records, not fixed mock positions.
- Unconfirmed review candidates do not appear as confirmed events.
- Same-time events remain readable.
- Keyboard navigation and accessible event labels are provided.

## 19. Course Assistant and RAG

The assistant answers questions using accepted course files. Claude Sonnet produces the response. OpenAI embeddings retrieve relevant chunks from Supabase pgvector.

### Indexing pipeline

1. Extract text while preserving page numbers, slide numbers, and headings when possible.
2. Divide text into meaningful chunks, normally 500 to 800 tokens with 80 to 120 tokens of overlap.
3. Store user, course, file, page, heading, content, checksum, and upload version with each chunk.
4. Create a 1536-dimension embedding using `text-embedding-3-large`.
5. Store the vector and searchable metadata in `document_chunks`.

### Question pipeline

1. Authenticate the caller.
2. Normalize the question and selected scope.
3. Embed the question with the same model and dimensions.
4. Search only chunks owned by that user.
5. Filter to the selected course unless the student explicitly chooses all courses.
6. Retrieve approximately six to eight top chunks using vector similarity plus metadata filters.
7. Send the question and retrieved evidence to Claude Sonnet.
8. Require an answer grounded only in supplied evidence.
9. Return answer text, citations, and source identifiers.
10. Store conversation history without storing provider secrets.

### Assistant behavior

- Scope selector supports one course or all courses.
- Each factual answer links to at least one supporting source when evidence exists.
- The assistant says it cannot find the answer when evidence is insufficient.
- It does not invent a deadline, point value, policy, or instructor statement.
- It may explain and summarize accepted course material.
- Conversation history can be renamed and deleted.
- Streaming response states are visible.
- Provider errors are translated into safe retry messages.

Completion criteria:

- Cross-user retrieval is prevented by database authorization and server-side filtering.
- Citations map to real stored chunks and files.
- Deleting or replacing a file makes stale chunks unavailable.
- An evaluation set verifies common due-date, points, policy, and source questions.

## 20. Course Setup Review

Review is a required data-confirmation step inside course onboarding, not a global navigation destination or a finished-course overview panel. Setup questions appear in Step 4 of the relevant course flow. A later upload keeps its own processing and source-detail status in the Files tab without recreating course onboarding on the overview.

Required behavior:

- Show only questions belonging to the current course.
- Display confidence and source location.
- Accept, edit, reject, defer, and view source.
- Present one focused question at a time.
- Show the remaining setup question count only inside Step 4.
- Support setup-required and optional questions before course completion.

Completion criteria:

- Required setup questions are resolved in Step 4 before the course can become ready.
- A ready course never displays setup questions or setup-question counts.
- Actions persist after refresh.
- Review actions update related course and assignment records transactionally.

## 21. Settings and Profile

Sections:

- Profile: name, photo, university, program, graduation date, term, and time zone.
- Notifications: email, browser, daily digest.
- Reminders: default reminder schedule.
- Calendar: week start and default view.
- Privacy: export data and delete account.
- Account: email, password reset, sign out.

Completion criteria:

- Saved settings appear after refresh and on another signed-in device.
- Profile changes update the sidebar without a full reload.
- Notification permission failures are explained.
- Export includes structured user data and source-file inventory.

## 22. Data Model

### Core tables

- `profiles`: auth user linkage, onboarding state, academic profile, time zone.
- `user_preferences`: notifications, reminders, calendar preferences.
- `courses`: owner, course details, setup state, accent, archived state.
- `enrollments`: user/course relationship and role for future team support.
- `course_files`: storage path, file metadata, version, status, checksum.
- `processing_jobs`: file job stage, progress, error code, timestamps, retry count.
- `document_chunks`: source text, metadata, 1536-dimension vector.
- `extraction_runs`: provider/model metadata, status, and processing summary.
- `candidate_items`: proposed structured information and confidence.
- `review_items`: question, source, state, and resolution.
- `assignments`: confirmed or student-created assignments.
- `course_meetings`: confirmed meeting schedule.
- `course_policies`: confirmed policy records.
- `reminders`: assignment and personal reminder schedule.
- `assistant_conversations`: user-owned conversation metadata.
- `assistant_messages`: messages, status, and timestamps.
- `message_citations`: message-to-chunk evidence links.
- `audit_events`: security-relevant user actions without secret content.

### Required database protections

- UUID primary keys.
- Foreign keys and appropriate cascade behavior.
- Created and updated timestamps.
- Row Level Security enabled for every user-owned table.
- Policies based on authenticated user ownership and enrollment.
- Search function verifies ownership within SQL, not only in client code.
- Private storage policies use authenticated user/course paths.

## 23. Server Functions

### `process-course-file`

Validates ownership, creates or returns the active processing job, and responds immediately. The Python worker claims the queued job and performs parsing, extraction, embedding, and database updates outside the browser request.

### Python ingestion worker

Claims queued jobs atomically, downloads private files, parses them with Docling, preserves tables and source anchors, extracts deterministic schedule rows, sends bounded sections to Claude, creates embeddings, stores facts and review items, updates heartbeats, and requeues stale work.

### `ask-course`

Validates ownership and scope, embeds the question, retrieves authorized chunks, calls Claude Sonnet, validates citations, stores the conversation result, and streams or returns the response.

### `delete-account`

Confirms the authenticated request and coordinates deletion of owned files and database records.

### Function completion criteria

- Provider API keys are server-side Edge Function or worker secrets only.
- Functions reject unauthenticated requests.
- Inputs are schema validated.
- Timeouts, provider errors, and rate limits have safe user-facing states.
- Logs use identifiers and stage names without raw document text or secrets.

## 24. Security and Privacy

- Never expose provider API keys to Vite.
- Never trust a browser-provided user id without checking the authenticated session.
- Enable RLS before storing production user data.
- Use private storage and signed access where necessary.
- Validate file type, size, and extension.
- Sanitize extracted and displayed content.
- Rate limit file processing and assistant requests per user.
- Prevent one user's embeddings from being returned to another user.
- Do not use uploaded school material to train CoursePilot-specific models.
- Provide deletion and export behavior.
- Rotate any credential that has been shared outside the secret store.

## 25. Accessibility and Responsive Quality

- Full keyboard access for navigation, dialogs, steppers, review actions, and file upload.
- Visible focus states.
- Semantic headings and landmarks.
- Labels for every input and icon-only control.
- Sufficient contrast for text, borders, and course accents.
- Reduced-motion support.
- Dialog focus trap and focus restoration.
- Mobile layouts at 360px width without overlap or horizontal page scrolling.
- Desktop layout verified at 1440px width.
- Data tables use responsive overflow or compact list alternatives.

## 26. Reliability and Observability

- Error boundaries protect the application shell.
- Query and mutation errors show recovery actions.
- Processing jobs are idempotent where possible.
- Retry does not duplicate confirmed assignments or chunks.
- File checksums support duplicate and version detection.
- Structured logs include request id, user id, course id, job id, stage, duration, and outcome.
- Production error monitoring is configured before launch.
- Health checks cover frontend availability and backend function readiness.

## 27. Testing Requirements

### Unit tests

- Date and time-zone formatting.
- Course progress calculations.
- Setup-step completion logic.
- File validation.
- Review state transitions.
- Citation mapping.

### Integration tests

- Sign up through onboarding.
- Create a course and continue setup from My Courses.
- Upload through processing completion.
- Review candidate to confirmed assignment.
- RAG retrieval scoped to user and course.
- File replacement removes stale chunks.
- Course and account deletion behavior.

### Browser tests

- Authentication screens.
- Desktop and mobile navigation.
- Onboarding stepper.
- Course setup stepper.
- Dashboard and course command center.
- Upload progress and failures.
- Review actions.
- Calendar controls.
- Assistant question and citations.
- Settings persistence.

### Model evaluations

- Correct due date retrieval.
- Correct point value retrieval.
- Conflicting source detection.
- No-answer behavior.
- Course-scope isolation.
- Citation validity.

## 28. Environments and Deployment

### Local development

- Vite frontend runs locally.
- Supabase project environment values are provided locally.
- Provider secrets are used only by the local worker or deployed server components.
- Local development uses real Supabase accounts and explicit empty states. Preview fixtures are not included in the integrated build.

### Preview

- Every pull request receives a Vercel preview.
- Preview uses a non-production Supabase branch or project when available.
- Database migrations run in a controlled preview environment.

### Production

- Production Supabase project has RLS, private storage, migrations, functions, secrets, backups, and allowed URLs configured.
- Vercel has only public Supabase frontend values.
- Supabase Auth redirect URLs include production and approved previews.
- Custom domain, monitoring, analytics, and incident contacts are configured.

### Launch completion criteria

- All critical and high-priority requirements are complete.
- Production build succeeds.
- Database migrations are applied and recorded.
- RLS isolation tests pass with two distinct users.
- Upload and processing work with real supported files.
- Assistant answers the evaluation set with valid citations.
- Mobile and desktop browser checks pass.
- Provider keys are rotated and stored only as production secrets.
- A rollback plan is documented.

## 29. Implementation Checklist

### Phase 0: Specification and safety

- [x] Record approved product goals and visual direction.
- [x] Record onboarding and guided course setup requirements.
- [x] Record Claude Sonnet and OpenAI embedding architecture.
- [x] Protect local environment files from Git.
- [ ] Rotate the provider credentials that were shared in chat.

### Phase 1: Frontend foundation

- [x] Scaffold Vite, React, and TypeScript.
- [x] Add routing, icons, date utilities, daisyUI, and Supabase client dependencies.
- [x] Build the design tokens and responsive application shell.
- [x] Build reusable buttons, fields, dialogs, steppers, statuses, empty states, and error states.
- [x] Build typed application models and remove preview fixtures before backend integration.

### Phase 2: Account experience

- [x] Build login.
- [x] Build sign up.
- [x] Build password recovery and reset screens.
- [x] Build protected-route and session behavior.
- [x] Build first-time onboarding with persisted step progress.

### Phase 3: Course organization

- [x] Build all-courses dashboard.
- [x] Build My Courses navigation and management.
- [x] Build guided new-course setup.
- [x] Build saved setup behavior that opens the exact incomplete step directly.
- [x] Build course command center and tabs.
- [x] Build course deletion confirmation.

### Phase 4: Academic workflows

- [x] Build assignments list and detail.
- [x] Build file upload and status interface.
- [x] Build processing-stage component with server stage mapping.
- [x] Build course-specific review sessions and resolution interactions.
- [x] Build week and list calendar views.
- [x] Build settings and profile screens.

### Phase 5: Supabase backend

- [x] Create versioned database migration.
- [x] Enable pgvector and define vector search function.
- [x] Create RLS policies for every user-owned table.
- [x] Create private course-files storage bucket and policies.
- [x] Connect Supabase Auth to profile creation.
- [x] Connect frontend repositories to Supabase queries and mutations.
- [x] Add Realtime processing job subscriptions.
- [x] Add asynchronous job enqueue, claim, heartbeat, and stale-job recovery.

### Phase 6: Model and RAG services

- [x] Replace synchronous file processing with the Docling Python worker.
- [x] Implement Docling parsing for PDF, DOCX, PPTX, images, and text sources.
- [x] Preserve heading, table, block, page/slide, and source-anchor metadata where the file format provides it.
- [x] Add deterministic schedule-table extraction for dates, due times, titles, and points.
- [x] Implement chunking with source metadata.
- [x] Implement `text-embedding-3-large` at 1536 dimensions.
- [x] Implement Claude Sonnet structured extraction.
- [x] Implement candidate and review creation.
- [x] Implement secure course-scoped vector retrieval.
- [x] Implement Claude Sonnet assistant response with citations.
- [x] Implement safe retries, timeouts, and provider error handling.

### Phase 7: Verification

- [x] Replace the setup review placeholder with processing-created review records.
- [x] Complete manual assignment creation, editing, and stored reminder schedule controls.
- [x] Complete file details and source viewing.
- [ ] Add direct citation-to-source navigation from assistant answers.
- [x] Complete profile photo upload, data export, and account deletion.
- [x] Persist, load, rename, and delete assistant conversations.
- [ ] Implement actual email, browser, and daily-digest notification delivery.
- [x] Add unit tests for core calculations and state logic.
- [x] Complete a hosted end-to-end acceptance test for account, onboarding, course creation, document processing, extraction, and RAG.
- [ ] Add an automated integration suite for account, course, processing, review, and RAG flows.
- [x] Verify desktop visual layout.
- [x] Verify mobile visual layout.
- [x] Verify keyboard and dialog behavior.
- [x] Verify production build.
- [x] Verify no secrets appear in Git or frontend output.

### Phase 8: Go live

- [x] Configure the hosted Supabase development environment.
- [x] Configure and run the Docling worker locally against hosted Supabase.
- [ ] Configure a separate production Supabase environment.
- [ ] Deploy the persistent Python worker and configure worker health monitoring.
- [x] Apply and verify migrations in the hosted development project.
- [x] Deploy Edge Functions and hosted development secrets.
- [ ] Configure Vercel environment and Auth redirect URLs.
- [ ] Deploy preview and complete acceptance testing.
- [ ] Rotate all exposed development keys before production.
- [ ] Deploy production.
- [ ] Complete post-launch smoke test and rollback check.

## 30. Current Delivery Boundary

Sprint 2 establishes CoursePilot's architectural baseline rather than the entire production product. The verified walking skeleton is:

1. A student authenticates and completes persisted onboarding.
2. The student creates a course and uploads a private course document.
3. The processing function classifies the document, extracts structured course facts, stores uncertain facts for review, chunks the accepted text, and creates vector embeddings.
4. The dashboard, course details, assignments, calendar, and stored reminder schedules use the persisted results.
5. The course assistant retrieves authorized chunks and returns a Claude answer with source citations.

Sprint 3/MVP includes production Vercel deployment, persistent worker hosting, separate production infrastructure, automatic notification delivery, direct citation navigation, more complete document conflict/version workflows, and a broader automated integration suite. These items remain unchecked until implemented and verified.
