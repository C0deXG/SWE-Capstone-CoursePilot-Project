import type { ChatMessage } from "../types";
import { supabase } from "./supabase";

export interface AssistantConversation {
  id: string;
  title: string;
  courseId?: string;
  scope: "course" | "all_courses";
  createdAt: string;
  updatedAt: string;
}

export interface AssistantAnswer {
  conversationId: string;
  messageId: string;
  answer: string;
  citations: Array<{ chunkId: string; fileId: string; label: string }>;
}

interface ConversationRow {
  id: string;
  title: string;
  course_id: string | null;
  scope: "course" | "all_courses";
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface CitationRow {
  message_id: string;
  citation_order: number;
  document_chunks:
    | {
        file_id: string;
        page_number: number | null;
        course_files: { filename: string } | Array<{ filename: string }> | null;
      }
    | Array<{
        file_id: string;
        page_number: number | null;
        course_files: { filename: string } | Array<{ filename: string }> | null;
      }>
    | null;
}

function client() {
  if (!supabase) throw new Error("CoursePilot is not connected to Supabase.");
  return supabase;
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export async function listAssistantConversations(): Promise<AssistantConversation[]> {
  const { data, error } = await client()
    .from("assistant_conversations")
    .select("id,title,course_id,scope,created_at,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as ConversationRow[]).map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    courseId: conversation.course_id ?? undefined,
    scope: conversation.scope,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  }));
}

export async function loadAssistantMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data: messageData, error: messageError } = await client()
    .from("assistant_messages")
    .select("id,role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (messageError) throw messageError;

  const rows = (messageData ?? []) as MessageRow[];
  const assistantMessageIds = rows.filter((message) => message.role === "assistant").map((message) => message.id);
  const citationsByMessage = new Map<string, ChatMessage["citations"]>();

  if (assistantMessageIds.length) {
    const { data: citationData, error: citationError } = await client()
      .from("message_citations")
      .select("message_id,citation_order,document_chunks!inner(file_id,page_number,course_files!inner(filename))")
      .in("message_id", assistantMessageIds)
      .order("citation_order", { ascending: true });
    if (citationError) throw citationError;

    for (const citation of (citationData ?? []) as unknown as CitationRow[]) {
      const chunk = firstRelation(citation.document_chunks);
      const file = firstRelation(chunk?.course_files);
      if (!chunk || !file) continue;
      const current = citationsByMessage.get(citation.message_id) ?? [];
      current.push({
        fileId: chunk.file_id,
        label: `${file.filename}${chunk.page_number ? `, page ${chunk.page_number}` : ""}`,
      });
      citationsByMessage.set(citation.message_id, current);
    }
  }

  return rows.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    citations: citationsByMessage.get(message.id),
  }));
}

export async function askAssistant(question: string, courseId?: string, conversationId?: string, assignmentId?: string): Promise<AssistantAnswer> {
  const { data, error } = await client().functions.invoke("ask-course", {
    body: { question, courseId: courseId ?? null, conversationId: conversationId ?? null, assignmentId: assignmentId ?? null },
  });
  if (error) throw error;

  const answer = data as Partial<AssistantAnswer> | null;
  if (!answer || typeof answer.conversationId !== "string" || typeof answer.messageId !== "string" || typeof answer.answer !== "string") {
    throw new Error("The course assistant returned an invalid response.");
  }

  const citations = Array.isArray(answer.citations)
    ? answer.citations.filter((citation) => citation && typeof citation.fileId === "string" && typeof citation.label === "string")
    : [];

  // Message creation happens in the Edge Function. Touching the parent keeps history ordered by recent activity.
  await client()
    .from("assistant_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", answer.conversationId);

  return { conversationId: answer.conversationId, messageId: answer.messageId, answer: answer.answer, citations };
}

export async function renameAssistantConversation(conversationId: string, title: string) {
  const nextTitle = title.trim();
  if (!nextTitle) throw new Error("Enter a conversation name.");
  const { error } = await client()
    .from("assistant_conversations")
    .update({ title: nextTitle.slice(0, 100) })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function deleteAssistantConversation(conversationId: string) {
  const { error } = await client().from("assistant_conversations").delete().eq("id", conversationId);
  if (error) throw error;
}
