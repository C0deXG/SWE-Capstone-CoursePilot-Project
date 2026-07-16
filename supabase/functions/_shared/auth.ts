import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

interface RequestContext {
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
}

export async function requireUser(request: Request): Promise<RequestContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function environment is incomplete");
  if (!authorization?.startsWith("Bearer ")) throw new Response("Unauthorized", { status: 401 });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  return { user: data.user, userClient, adminClient };
}
