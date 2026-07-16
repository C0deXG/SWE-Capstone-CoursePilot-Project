import { corsHeaders, jsonResponse, safeErrorResponse } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { askClaude, createEmbeddings, parseJsonObject } from "../_shared/providers.ts";

interface RetrievedChunk {
  id: string;
  course_id: string;
  file_id: string;
  filename: string;
  page_number: number | null;
  section_heading: string | null;
  content: string;
  similarity: number;
}

interface AssignmentRecord {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  points: number | null;
  status: string;
  source_file_id: string | null;
}

interface EvidenceItem {
  text: string;
  chunkId: string | null;
  fileId: string | null;
  label: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const { user, userClient } = await requireUser(request);
    const body = await request.json() as { question?: string; courseId?: string | null; conversationId?: string | null; assignmentId?: string | null };
    const question = body.question?.trim() || "";
    if (question.length < 2 || question.length > 2000) return jsonResponse({ error: "Question must be between 2 and 2000 characters" }, 400);

    if (body.courseId) {
      const { data: course } = await userClient.from("courses").select("id").eq("id", body.courseId).single();
      if (!course) return jsonResponse({ error: "Course not found" }, 404);
    }

    let targetedAssignment: AssignmentRecord | null = null;
    if (body.assignmentId) {
      const { data: assignment } = await userClient
        .from("assignments")
        .select("id,title,description,due_at,points,status,source_file_id,course_id")
        .eq("id", body.assignmentId)
        .single();
      if (!assignment || (body.courseId && assignment.course_id !== body.courseId)) {
        return jsonResponse({ error: "Assignment not found in this course" }, 404);
      }
      targetedAssignment = assignment as AssignmentRecord;
    }

    let conversationId = body.conversationId;
    if (conversationId) {
      const { data: conversation } = await userClient.from("assistant_conversations").select("id").eq("id", conversationId).single();
      if (!conversation) return jsonResponse({ error: "Conversation not found" }, 404);
    } else {
      const { data: conversation, error } = await userClient.from("assistant_conversations").insert({ user_id: user.id, course_id: body.courseId || null, scope: body.courseId ? "course" : "all_courses", title: question.slice(0, 70) }).select("id").single();
      if (error) throw error;
      conversationId = conversation.id;
    }

    const { error: userMessageError } = await userClient.from("assistant_messages").insert({ user_id: user.id, conversation_id: conversationId, role: "user", content: question });
    if (userMessageError) throw userMessageError;

    const { data: profile } = await userClient.from("profiles").select("timezone").eq("id", user.id).single();
    const timezone = profile?.timezone || "America/Chicago";
    const retrievalQuestion = targetedAssignment
      ? `Assignment: ${targetedAssignment.title}\nDescription: ${targetedAssignment.description || "No description"}\nQuestion: ${question}`
      : question;
    const [queryEmbedding] = await createEmbeddings([retrievalQuestion]);
    const { data, error: searchError } = await userClient.rpc("match_course_chunks_hybrid", {
      query_embedding: queryEmbedding,
      query_text: retrievalQuestion,
      requested_course_id: body.courseId || null,
      match_count: 8,
      minimum_similarity: 0.2,
    });
    if (searchError) throw searchError;
    const chunks = (data || []) as RetrievedChunk[];

    let assignmentQuery = userClient
      .from("assignments")
      .select("id,title,description,due_at,points,status,source_file_id")
      .order("due_at", { ascending: true })
      .limit(80);
    if (targetedAssignment) assignmentQuery = assignmentQuery.eq("id", targetedAssignment.id);
    else if (body.courseId) assignmentQuery = assignmentQuery.eq("course_id", body.courseId);
    const { data: assignmentData, error: assignmentError } = await assignmentQuery;
    if (assignmentError) throw assignmentError;
    const assignments = (assignmentData || []) as AssignmentRecord[];

    const sourceFileIds = [...new Set(assignments.map((item) => item.source_file_id).filter((id): id is string => Boolean(id)))];
    const sourceChunks = new Map<string, RetrievedChunk>();
    if (sourceFileIds.length) {
      const { data: sourceData, error: sourceError } = await userClient
        .from("document_chunks")
        .select("id,course_id,file_id,page_number,section_heading,content,course_files!inner(filename)")
        .in("file_id", sourceFileIds)
        .order("chunk_index", { ascending: true });
      if (sourceError) throw sourceError;
      for (const row of sourceData || []) {
        if (sourceChunks.has(row.file_id)) continue;
        const joinedFile = Array.isArray(row.course_files) ? row.course_files[0] : row.course_files;
        sourceChunks.set(row.file_id, {
          id: row.id,
          course_id: row.course_id,
          file_id: row.file_id,
          filename: joinedFile?.filename || "Course source",
          page_number: row.page_number,
          section_heading: row.section_heading,
          content: row.content,
          similarity: 1,
        });
      }
    }

    const evidenceItems: EvidenceItem[] = assignments.map((assignment) => {
      const source = assignment.source_file_id ? sourceChunks.get(assignment.source_file_id) : undefined;
      const localDue = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(assignment.due_at));
      return {
        text: `CONFIRMED ASSIGNMENT RECORD\nTitle: ${assignment.title}\nDue in the student's timezone (${timezone}): ${localDue}\nStored UTC value: ${assignment.due_at}\nPoints: ${assignment.points ?? "not specified"}\nStatus: ${assignment.status}\nDescription: ${assignment.description || "No description"}`,
        chunkId: source?.id || null,
        fileId: assignment.source_file_id,
        label: source?.filename || "Confirmed assignment record",
      };
    });
    evidenceItems.push(...chunks.map((chunk) => ({
      text: `${chunk.filename}${chunk.page_number ? `, page ${chunk.page_number}` : ""}${chunk.section_heading ? `, ${chunk.section_heading}` : ""}\n${chunk.content}`,
      chunkId: chunk.id,
      fileId: chunk.file_id,
      label: `${chunk.filename}${chunk.page_number ? `, page ${chunk.page_number}` : ""}`,
    })));

    let answer = "I could not find enough accepted course material to answer that question.";
    let citedNumbers: number[] = [];
    if (evidenceItems.length) {
      const evidence = evidenceItems.map((item, index) => `[${index + 1}] ${item.text}`).join("\n\n");
      const system = `You are CoursePilot, a private university course assistant. Answer only from the supplied evidence. Confirmed assignment records are authoritative for assignment titles, due dates, points, and statuses. Use document excerpts for requirements and policies. The student's timezone is ${timezone}; always present dates and times in that timezone, not UTC. The current date is ${new Date().toISOString()}. Never invent deadlines, points, policies, or instructor statements. If evidence is insufficient or conflicting, say so. Cite factual claims with evidence numbers. Return valid JSON only with this shape: {"answer":"","citations":[1]}.`;
      const target = targetedAssignment ? `\nTARGET ASSIGNMENT: ${targetedAssignment.title}\n` : "";
      const raw = await askClaude(system, `QUESTION:\n${question}${target}\nEVIDENCE:\n${evidence}`, 1800);
      const parsed = parseJsonObject<{ answer: string; citations: number[] }>(raw);
      answer = parsed.answer?.trim() || answer;
      citedNumbers = [...new Set((parsed.citations || []).filter((number) => Number.isInteger(number) && number >= 1 && number <= evidenceItems.length))].slice(0, 8);
    }

    const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5";
    const { data: assistantMessage, error: messageError } = await userClient.from("assistant_messages").insert({ user_id: user.id, conversation_id: conversationId, role: "assistant", content: answer, status: "completed", provider: "anthropic", model }).select("id").single();
    if (messageError) throw messageError;

    const citedEvidence = citedNumbers.map((number) => evidenceItems[number - 1]).filter((item) => item.chunkId);
    const citations = citedEvidence.map((item, order) => ({ user_id: user.id, message_id: assistantMessage.id, chunk_id: item.chunkId, citation_order: order + 1 }));
    if (citations.length) {
      const { error: citationError } = await userClient.from("message_citations").insert(citations);
      if (citationError) throw citationError;
    }

    console.log(JSON.stringify({ requestId, userId: user.id, courseId: body.courseId || null, assignmentId: targetedAssignment?.id || null, conversationId, retrieved: chunks.length, citations: citations.length, outcome: "completed" }));
    return jsonResponse({ requestId, conversationId, messageId: assistantMessage.id, answer, citations: citedNumbers.map((number) => evidenceItems[number - 1]).filter((item) => item.chunkId).map((item) => ({ chunkId: item.chunkId, fileId: item.fileId, label: item.label })) });
  } catch (error) {
    if (error instanceof Response) return error;
    return safeErrorResponse(error, requestId);
  }
});
