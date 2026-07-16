import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse, safeErrorResponse } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  try {
    const { userClient } = await requireUser(request);
    const body = await request.json() as { fileId?: string };
    if (!body.fileId) return jsonResponse({ error: "fileId is required" }, 400);

    const { data: jobId, error } = await userClient.rpc("enqueue_course_file", {
      p_file_id: body.fileId,
    });
    if (error) throw error;

    return jsonResponse(
      {
        requestId,
        fileId: body.fileId,
        jobId,
        status: "queued",
      },
      202,
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return safeErrorResponse(error, requestId);
  }
});
