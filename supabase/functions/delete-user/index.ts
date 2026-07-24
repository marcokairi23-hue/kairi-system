import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FK_ERROR_HINTS = ["foreign key", "violates", "database error deleting user", "constraint"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "לא מחובר" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // לקוח בהקשר הקורא — לזהות מי הוא ולוודא שהוא admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: "לא מחובר" }, 401);

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return json({ error: "רק אדמין יכול למחוק משתמשים" }, 403);
    }

    const { id } = await req.json();
    if (!id) return json({ error: "חסר מזהה משתמש" }, 400);

    if (id === user.id) {
      return json({ error: "לא ניתן למחוק את המשתמש המחובר כרגע" }, 400);
    }

    // לקוח מנהל — service_role, זמין אוטומטית לפונקציה
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(id);

    if (deleteErr) {
      const msg = (deleteErr.message || "").toLowerCase();
      if (FK_ERROR_HINTS.some(hint => msg.includes(hint))) {
        return json({
          error: "לא ניתן למחוק — למשתמש הזה יש פעילות רשומה במערכת (הזמנות/תשלומים/יומן פעילות). השתמש ב\"לא פעיל\" במקום מחיקה.",
        }, 409);
      }
      return json({ error: deleteErr.message }, 400);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "שגיאה לא צפויה" }, 500);
  }
});
