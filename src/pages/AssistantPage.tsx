import { ArrowUp, BookOpen, Check, FileText, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FormError, Modal, PageHeader } from "../components/ui";
import { useAppData } from "../context/AppDataContext";
import {
  askAssistant,
  deleteAssistantConversation,
  listAssistantConversations,
  loadAssistantMessages,
  renameAssistantConversation,
  type AssistantConversation,
} from "../lib/assistant-repository";
import type { ChatMessage } from "../types";

const suggestions = ["What is due this week?", "Which assignments are worth the most points?", "What attendance policies are in my course files?"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "CoursePilot could not complete that request.";
}

export function AssistantPage() {
  const data = useAppData();
  const [params] = useSearchParams();
  const requestedCourseId = params.get("course") || "all";
  const requestedAssignmentId = params.get("assignment");
  const requestedAssignment = data.assignments.find((assignment) => assignment.id === requestedAssignmentId && assignment.courseId === requestedCourseId);
  const assignmentPrompt = requestedAssignment ? `What do I need to complete for "${requestedAssignment.title}"?` : "";
  const [scope, setScope] = useState(requestedCourseId);
  const [question, setQuestion] = useState(assignmentPrompt);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [assignmentContextId, setAssignmentContextId] = useState(requestedAssignment?.id);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string>();
  const [renamingId, setRenamingId] = useState<string>();
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AssistantConversation>();
  const [deleting, setDeleting] = useState(false);
  const loadRequest = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const assignmentContext = data.assignments.find((assignment) => assignment.id === assignmentContextId);

  useEffect(() => {
    let active = true;
    const request = ++loadRequest.current;

    void listAssistantConversations()
      .then(async (items) => {
        if (!active || request !== loadRequest.current) return;
        setConversations(items);
        if (requestedCourseId !== "all" || !items[0]) return;

        const first = items[0];
        setConversationId(first.id);
        setScope(first.courseId ?? "all");
        setLoadingMessages(true);
        const storedMessages = await loadAssistantMessages(first.id);
        if (active && request === loadRequest.current) setMessages(storedMessages);
      })
      .catch((loadError) => {
        if (active && request === loadRequest.current) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active && request === loadRequest.current) {
          setLoadingHistory(false);
          setLoadingMessages(false);
        }
      });

    return () => {
      active = false;
      loadRequest.current += 1;
    };
  }, [requestedCourseId]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [answering, messages]);

  function startNewConversation() {
    loadRequest.current += 1;
    setConversationId(undefined);
    setMessages([]);
    setScope(requestedCourseId);
    setQuestion(assignmentPrompt);
    setAssignmentContextId(requestedAssignment?.id);
    setError(undefined);
    setRenamingId(undefined);
  }

  async function openConversation(conversation: AssistantConversation) {
    const request = ++loadRequest.current;
    setConversationId(conversation.id);
    setScope(conversation.courseId ?? "all");
    setMessages([]);
    setAssignmentContextId(undefined);
    setError(undefined);
    setLoadingMessages(true);
    setRenamingId(undefined);
    try {
      const storedMessages = await loadAssistantMessages(conversation.id);
      if (request === loadRequest.current) setMessages(storedMessages);
    } catch (loadError) {
      if (request === loadRequest.current) setError(errorMessage(loadError));
    } finally {
      if (request === loadRequest.current) setLoadingMessages(false);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (value.length < 2 || answering) return;
    const optimisticMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: value };
    setMessages((current) => [...current, optimisticMessage]);
    setQuestion("");
    setError(undefined);
    setAnswering(true);

    try {
      const result = await askAssistant(value, scope === "all" ? undefined : scope, conversationId, assignmentContext?.id);
      setConversationId(result.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: result.messageId,
          role: "assistant",
          content: result.answer,
          citations: result.citations.map((citation) => ({ label: citation.label, fileId: citation.fileId })),
        },
      ]);
      const nextConversations = await listAssistantConversations();
      setConversations(nextConversations);
    } catch (askError) {
      setError(errorMessage(askError));
      try {
        setConversations(await listAssistantConversations());
      } catch {
        // The original request error is more useful to the user.
      }
    } finally {
      setAnswering(false);
    }
  }

  function beginRename(conversation: AssistantConversation) {
    setRenamingId(conversation.id);
    setRenameTitle(conversation.title);
    setError(undefined);
  }

  async function saveRename(event: FormEvent) {
    event.preventDefault();
    if (!renamingId) return;
    try {
      await renameAssistantConversation(renamingId, renameTitle);
      setConversations((current) => current.map((conversation) => (
        conversation.id === renamingId ? { ...conversation, title: renameTitle.trim().slice(0, 100) } : conversation
      )));
      setRenamingId(undefined);
    } catch (renameError) {
      setError(errorMessage(renameError));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(undefined);
    try {
      await deleteAssistantConversation(deleteTarget.id);
      setConversations((current) => current.filter((conversation) => conversation.id !== deleteTarget.id));
      if (conversationId === deleteTarget.id) startNewConversation();
      setDeleteTarget(undefined);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      setDeleteTarget(undefined);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Accepted course sources" title="Course assistant" description="Ask about due dates, points, requirements, meetings, and policies." />
      <section className="assistant-layout">
        <aside className="assistant-history panel">
          <button className="button full" type="button" onClick={startNewConversation} disabled={answering}>
            <Plus size={15} /> New conversation
          </button>

          <p className="sidebar-heading">Conversations</p>
          {loadingHistory && <span className="loading loading-spinner loading-xs" aria-label="Loading conversations" />}
          {!loadingHistory && conversations.length === 0 && <p className="no-source">No conversations yet.</p>}
          <div className="grid gap-1">
            {conversations.map((conversation) => (
              renamingId === conversation.id ? (
                <form className="join w-full" key={conversation.id} onSubmit={saveRename}>
                  <input className="input input-sm join-item min-w-0 grow" aria-label="Conversation name" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={100} autoFocus />
                  <button className="btn btn-sm btn-square join-item" type="submit" aria-label="Save conversation name" disabled={!renameTitle.trim()}><Check size={13} /></button>
                  <button className="btn btn-sm btn-square join-item" type="button" aria-label="Cancel rename" onClick={() => setRenamingId(undefined)}><X size={13} /></button>
                </form>
              ) : (
                <div className="join w-full" key={conversation.id}>
                  <button
                    className={`btn btn-sm join-item min-w-0 grow justify-start truncate ${conversation.id === conversationId ? "btn-active" : "btn-ghost"}`}
                    type="button"
                    title={conversation.title}
                    aria-current={conversation.id === conversationId ? "true" : undefined}
                    onClick={() => void openConversation(conversation)}
                    disabled={answering}
                  >
                    <span className="truncate">{conversation.title}</span>
                  </button>
                  <button className="btn btn-sm btn-square btn-ghost join-item" type="button" aria-label={`Rename ${conversation.title}`} onClick={() => beginRename(conversation)} disabled={answering}><Pencil size={12} /></button>
                  <button className="btn btn-sm btn-square btn-ghost join-item" type="button" aria-label={`Delete ${conversation.title}`} onClick={() => setDeleteTarget(conversation)} disabled={answering}><Trash2 size={12} /></button>
                </div>
              )
            ))}
          </div>

          <p className="sidebar-heading">Suggested questions</p>
          {suggestions.map((item) => <button className="history-question" type="button" key={item} onClick={() => setQuestion(item)}>{item}</button>)}
        </aside>

        <div className="chat-panel panel">
          <header className="chat-header">
            {assignmentContext && (
              <div className="assistant-assignment-context">
                <span>Assignment</span>
                <strong>{assignmentContext.title}</strong>
              </div>
            )}
            <label>
              <span>Search scope</span>
              <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={Boolean(conversationId) || answering}>
                <option value="all">All accepted courses</option>
                {data.courses.map((course) => <option key={course.id} value={course.id}>{course.code}: {course.shortName}</option>)}
              </select>
            </label>
          </header>

          <div className="chat-log" aria-live="polite">
            {error && <FormError message={error} />}
            {loadingMessages && <span className="loading loading-spinner loading-sm" aria-label="Loading messages" />}
            {!loadingMessages && messages.length === 0 && (
              <div>
                <strong>Start a conversation</strong>
                <p className="no-source">Ask a question and CoursePilot will search your accepted course files.</p>
              </div>
            )}
            {messages.map((message) => (
              <div className={`message ${message.role}`} key={message.id}>
                {message.role === "assistant" && <span className="message-mark"><Sparkles size={15} /></span>}
                <div>
                  <strong>{message.role === "assistant" ? "CoursePilot" : "You"}</strong>
                  <p>{message.content}</p>
                  {message.citations?.length ? (
                    <div className="message-citations" aria-label="Sources">
                      {message.citations.map((citation, index) => (
                        <span className="badge badge-outline badge-sm" key={`${message.id}-${citation.fileId}-${index}`} title={`Source file ${citation.fileId}`}>
                          <FileText size={13} /> {citation.label}
                        </span>
                      ))}
                    </div>
                  ) : message.role === "assistant" ? <span className="no-source">No supporting source found</span> : null}
                </div>
              </div>
            ))}
            {answering && (
              <div className="message assistant">
                <span className="message-mark"><Sparkles size={15} /></span>
                <div><strong>CoursePilot</strong><p className="typing">Searching accepted sources</p></div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>

          <form className="ask-form" onSubmit={ask}>
            <label className="sr-only" htmlFor="question">Ask about your courses</label>
            <input id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your course files" autoComplete="off" maxLength={2000} />
            <button className="icon-button primary" type="submit" aria-label="Send question" disabled={question.trim().length < 2 || answering || loadingMessages}><ArrowUp size={17} /></button>
          </form>
          <p className="assistant-note"><BookOpen size={13} /> Answers use accepted files in the selected scope and show available sources.</p>
        </div>
      </section>

      <Modal open={Boolean(deleteTarget)} title="Delete conversation?" description="This removes its saved messages and citations." size="small" onClose={() => { if (!deleting) setDeleteTarget(undefined); }}>
        <div className="modal-body"><p>{deleteTarget?.title}</p></div>
        <footer className="modal-actions">
          <button className="button" type="button" onClick={() => setDeleteTarget(undefined)} disabled={deleting}>Cancel</button>
          <button className="button danger" type="button" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={15} />} Delete
          </button>
        </footer>
      </Modal>
    </>
  );
}
