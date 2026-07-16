import { jsonrepair } from "npm:jsonrepair@3.13.1";

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

interface ClaudeContentBlock {
  type: "text";
  text: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
}

const retryableStatuses = new Set([408, 409, 429, 500, 502, 503, 504]);

export class ProviderRequestError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

export async function providerRequest(url: string, init: RequestInit, label: string, timeoutMs = 45000, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok) return response;
      await response.body?.cancel();
      if (!retryableStatuses.has(response.status) || attempt === attempts - 1) {
        throw new ProviderRequestError(`${label}_http_${response.status}`, `${label} request failed with status ${response.status}`);
      }
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error;
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      if (attempt === attempts - 1) {
        throw new ProviderRequestError(timedOut ? `${label}_timeout` : `${label}_network`, timedOut ? `${label} request timed out` : `${label} request could not reach the provider`);
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
  }
  throw new ProviderRequestError(`${label}_unavailable`, `${label} provider is unavailable`);
}

export async function createEmbeddings(inputs: string[]) {
  if (!inputs.length) return [];
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Embedding provider is not configured");
  const model = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-large";
  const dimensions = Number(Deno.env.get("OPENAI_EMBEDDING_DIMENSIONS") || "1536");
  if (dimensions !== 1536) throw new Error("Embedding dimensions must match the 1536-dimension database column");
  const response = await providerRequest("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, dimensions, input: inputs, encoding_format: "float" }),
  }, "embedding", 30000);
  const body = await response.json() as EmbeddingResponse;
  const embeddings = body.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  if (embeddings.length !== inputs.length || embeddings.some((embedding) => embedding.length !== dimensions)) {
    throw new ProviderRequestError("embedding_invalid_response", "Embedding provider returned an unexpected vector shape");
  }
  return embeddings;
}

export async function askClaude(system: string, userContent: string, maxTokens = 4096) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Reasoning provider is not configured");
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5";
  const response = await providerRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: "user", content: userContent }] }),
  }, "reasoning", 70000, 2);
  const body = await response.json() as ClaudeResponse;
  const text = body.content?.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  if (!text) throw new ProviderRequestError("reasoning_empty_response", "Reasoning provider returned no text");
  return text;
}

export function parseJsonObject<T>(value: string): T {
  const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  const candidate = objectStart >= 0 ? cleaned.slice(objectStart, objectEnd > objectStart ? objectEnd + 1 : undefined) : cleaned;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return JSON.parse(jsonrepair(candidate)) as T;
  }
}
