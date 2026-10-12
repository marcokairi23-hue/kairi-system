import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.45.4";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
// Invalid business events are a terminal outcome, not a transient outage.
// Returning an explicit rejection prevents Make from stopping on bad callbacks.
const reject = (error: string) => json({ status: "rejected", payment_recorded: false, error });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
const phone = (v: unknown) => text(v).replace(/[ ()-]/g, "").replace(/^(\+972|00972|972)/, "0");

async function providerCall(base: string, operation: string, body: unknown) {
  const response = await fetch(`${base}/${operation}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12000), redirect: "error",
  });
  if (!response.ok) throw new Error("Provider unavailable");
  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: setting, error: configError } = await db.from("settings")
      .select("value").eq("key", "icredit_automation").maybeSingle();
    if (configError) throw configError;
    const cfg = setting?.value;
    if (!cfg || cfg.mode === "off") return json({ status: "disabled", payment_recorded: false });
    if (!uuid.test(text(cfg.group_id)) || !["test", "production"].includes(cfg.environment))
      return json({ error: "Integration configuration incomplete" }, 503);
    // Never log/persist the raw IPN: it can contain merchant and card tokens.
    const raw = await req.text();
    if (raw.length > 8192) return reject("Payload too large");
    let input;
    try {
      input = req.headers.get("Content-Type")?.includes("application/json")
        ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    } catch { return reject("Invalid payload"); }
    const saleId = text(input?.SaleId), groupToken = text(input?.GroupPrivateToken);
    const amountString = text(input?.TransactionAmount);
    if (!uuid.test(saleId) || !uuid.test(groupToken) || !/^\d{1,9}(\.\d{1,2})?$/.test(amountString)
      || Number(amountString) <= 0) return reject("Invalid payment identity or amount");
    if (text(input.TransactionCurrency) !== "1") return reject("Only ILS supported");
    const base = cfg.environment === "test"
      ? "https://testicredit.rivhit.co.il/API/PaymentPageRequest.svc"
      : "https://icredit.rivhit.co.il/API/PaymentPageRequest.svc";
    const verification = await providerCall(base, "Verify", {
      GroupPrivateToken: groupToken, SaleId: saleId, TotalAmount: Number(amountString),
    });
    if (text(verification.Status).toUpperCase() !== "VERIFIED")
      return reject("Payment verification failed");
    const sale = await providerCall(base, "SaleDetails", { SaleId: saleId });
    // Merchant ownership is pinned independently of the incoming token.
    // Order, phone, amount and transaction state come from iCredit, never the caller.
    if (text(sale.GroupId).toLowerCase() !== text(cfg.group_id).toLowerCase()
      || text(sale.SaleId).toLowerCase() !== saleId.toLowerCase())
      return reject("Merchant or sale mismatch");
    if (text(sale.Status) !== "0" || text(sale.TransactionStatus) !== "0"
      || text(sale.TransactionType) !== "1" || text(sale.TransactionParamJ) !== "0"
      // SaleDetails.Amount is in ILS; its TransactionAmount is in agorot.
      || Number(sale.Amount) !== Number(amountString))
      return reject("Not a settled immediate charge");
    const { data, error } = await db.rpc("record_icredit_payment", {
      p_sale_id: saleId, p_group_id: sale.GroupId, p_environment: cfg.environment,
      p_order_number: text(sale.Order), p_phone: phone(sale.PhoneNumber),
      p_amount: Number(amountString),
    });
    if (error) throw error;
    return json(data);
  } catch {
    // A non-2xx response keeps transient failures visible/retryable in Make.
    return json({ error: "Payment processing unavailable; retry required" }, 503);
  }
});
