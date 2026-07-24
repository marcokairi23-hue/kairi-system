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
      return json({ error: "רק אדמין יכול ליצור משתמשים" }, 403);
    }

    const { email, password, full_name, phone, role } = await req.json();

    if (!email || !password || !full_name || !role) {
      return json({ error: "חסרים שדות חובה" }, 400);
    }
    if (String(password).length < 6) {
      return json({ error: "סיסמה חייבת להכיל לפחות 6 תווים" }, 400);
    }

    // לקוח מנהל — service_role, זמין אוטומטית לפונקציה
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "יצירת המשתמש נכשלה" }, 400);
    }

    // הטריגר on_auth_user_created כבר יצר שורת profiles (full_name, role ברירת מחדל 'viewer')
    // כאן משלימים phone + התפקיד שנבחר בטופס
    const { error: updateErr } = await adminClient
      .from("profiles")
      .update({ phone: phone || null, role })
      .eq("id", created.user.id);

    if (updateErr) {
      return json({ error: "המשתמש נוצר אך עדכון הפרופיל נכשל: " + updateErr.message }, 500);
    }

    return json({ id: created.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "שגיאה לא צפויה" }, 500);
  }
});
