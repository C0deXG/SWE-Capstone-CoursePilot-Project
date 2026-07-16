import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse, safeErrorResponse } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const { user, adminClient } = await requireUser(request);
    const { error } = await adminClient.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return jsonResponse({ deleted: true });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
