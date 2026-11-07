import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const HOME = "https://alsancak-pilates-studio.vercel.app/#odeme";

type StoredPayment = {
  payment_id: string;
  member_id: string;
  member_package_id: string;
  conversation_id: string;
  iyzico_token: string;
  status: string;
  amount: string;
  currency: string;
  iyzico_payment_id: string | null;
};

function readSecrets(): { apiKey: string; secretKey: string; baseUrl: string } | null {
  const apiKey = Deno.env.get("IYZICO_API_KEY")?.trim() ?? "";
  const secretKey = Deno.env.get("IYZICO_SECRET_KEY")?.trim() ?? "";
  if (!apiKey || !secretKey) return null;

  const raw = Deno.env.get("IYZICO_BASE_URL")?.trim() || "https://sandbox-api.iyzipay.com";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "sandbox-api.iyzipay.com" && url.hostname !== "api.iyzipay.com") return null;
    return { apiKey, secretKey, baseUrl: url.origin };
  } catch {
    return null;
  }
}

async function iyzicoAuthorization(apiKey: string, secretKey: string, uriPath: string, body: string) {
  const randomKey = `${Date.now()}${crypto.randomUUID().replaceAll("-", "")}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(randomKey + uriPath + body)),
  );
  const signature = Array.from(signatureBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const authorization = btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`);
  return {
    Authorization: `IYZWSv2 ${authorization}`,
    "x-iyzi-rnd": randomKey,
  };
}

function page(title: string, message: string, status = 200): Response {
  const safeTitle = title.replace(/[<>&]/g, "");
  const safeMessage = message.replace(/[<>&]/g, "");
  const html = `<!doctype html>
<meta charset="utf-8">
<title>${safeTitle}</title>
<main style="font-family:sans-serif;max-width:36rem;margin:3rem auto;line-height:1.5">
  <h1>${safeTitle}</h1>
  <p>${safeMessage}</p>
  <p><a href="${HOME}">Stüdyoya dön</a></p>
</main>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function sameMoney(left: unknown, right: unknown): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.001;
}

async function readToken(req: Request): Promise<string> {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token") ?? "";
  if (req.method === "GET") return fromQuery.trim();

  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return String(body?.token ?? fromQuery).trim();
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  return (params.get("token") || fromQuery).trim();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return page("Ödeme", "Ödeme tamamlanmadı.", 405);
  }

  const secrets = readSecrets();
  if (!secrets) {
    return page("Ödeme", "Ödeme bağlantısı henüz açık değil.");
  }

  const token = await readToken(req);
  if (!/^[0-9a-fA-F-]{16,80}$/.test(token)) {
    return page("Ödeme", "Ödeme tamamlanmadı.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return page("Ödeme", "Ödeme tamamlanmadı.", 500);
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: storedData, error: storedError } = await serviceClient.rpc("iyzico_payment_for_token", {
    p_token: token,
  });
  if (storedError || !storedData) {
    return page("Ödeme", "Ödeme tamamlanmadı.");
  }

  const stored = storedData as StoredPayment;
  if (stored.status === "paid") {
    return page("Ödeme alındı", "Ödeme alındı. Paket 30 gün için açıldı.");
  }
  if (stored.status !== "pending" || stored.currency !== "TRY") {
    return page("Ödeme", "Ödeme tamamlanmadı.");
  }

  const requestBody = JSON.stringify({
    locale: "tr",
    conversationId: stored.conversation_id,
    token,
  });

  let result: Record<string, unknown>;
  try {
    const headers = await iyzicoAuthorization(secrets.apiKey, secrets.secretKey, RETRIEVE_PATH, requestBody);
    const response = await fetch(`${secrets.baseUrl}${RETRIEVE_PATH}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: requestBody,
    });
    result = await response.json();
  } catch {
    return page("Ödeme", "Ödeme sonucu alınamadı. Tahsilat onaylanmadı.", 502);
  }

  const fraud = Number(result.fraudStatus);
  const matches = result.status === "success"
    && result.paymentStatus === "SUCCESS"
    && result.currency === "TRY"
    && result.conversationId === stored.conversation_id
    && result.token === token
    && result.basketId === stored.member_package_id
    && sameMoney(result.paidPrice, stored.amount)
    && sameMoney(result.price, stored.amount)
    && fraud === 1
    && typeof result.paymentId === "string"
    && result.paymentId.length > 0
    && result.paymentId.length <= 64;

  if (!matches) {
    const pendingReview = result.status === "success" && result.paymentStatus === "SUCCESS" && fraud === 0;
    if (!pendingReview) {
      await serviceClient.rpc("mark_iyzico_payment_failed", {
        p_payment_id: stored.payment_id,
        p_member_id: stored.member_id,
        p_member_package_id: stored.member_package_id,
        p_error: "Ödeme sonucu eşleşmedi",
      });
    }
    return page("Ödeme", "Ödeme tamamlanmadı.");
  }

  const { data: marked, error: markError } = await serviceClient.rpc("mark_iyzico_payment_paid", {
    p_payment_id: stored.payment_id,
    p_member_id: stored.member_id,
    p_member_package_id: stored.member_package_id,
    p_conversation_id: stored.conversation_id,
    p_token: token,
    p_iyzico_payment_id: result.paymentId,
    p_amount: Number(stored.amount),
    p_paid_at: new Date().toISOString(),
  });

  if (markError || marked?.status !== "paid") {
    return page("Ödeme", "Ödeme tamamlanmadı.");
  }

  return page("Ödeme alındı", "Ödeme alındı. Paket 30 gün için açıldı.");
});
