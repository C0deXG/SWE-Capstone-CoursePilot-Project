export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function safeErrorResponse(error: unknown, requestId: string) {
  const message = error instanceof Error ? error.message : "Unknown processing error";
  console.error(JSON.stringify({ requestId, outcome: "failed", error: message }));
  return jsonResponse({ error: "CoursePilot could not complete this request. Please try again.", requestId }, 500);
}
