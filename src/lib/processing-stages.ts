import type { ProcessingStage } from "../types";

export const defaultProcessingStages: ProcessingStage[] = [
  { id: "received", label: "Upload received", detail: "The file is stored in your private course folder.", status: "waiting" },
  { id: "validated", label: "File validated", detail: "Type, size, and file integrity are checked.", status: "waiting" },
  { id: "text", label: "Text extracted", detail: "Pages, headings, and readable content are prepared.", status: "waiting" },
  { id: "chunks", label: "Sources organized", detail: "Content is divided into searchable source sections.", status: "waiting" },
  { id: "embeddings", label: "Course sources indexed", detail: "Source sections are embedded for course questions.", status: "waiting" },
  { id: "facts", label: "Document classified", detail: "The file purpose, authority, dates, meetings, and policies are identified.", status: "waiting" },
  { id: "reviews", label: "Course features updated", detail: "Reliable facts are organized and uncertain details are held for confirmation.", status: "waiting" },
];
