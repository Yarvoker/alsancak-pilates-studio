import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const STUDIO_ADDRESS = "Alsancak Mahallesi, Talatpaşa Bulvarı No:33/1";
const ALLOWED_ORIGINS = new Set([
  "https://alsancak-pilates-studio.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

type Buyer = {
  id?: string;
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  registered_at?: string;
};

type StartedPayment = {
  payment_id: string;
  conversation_id: string;
  amount: string;
  currency: string;
  member_id: string;
  member_package_id: string;
  package_name: string;
  iyzico_token: string | null;
  payment_page_url: string | null;
  buyer: Buyer;
};

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://alsancak-pilates-studio.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function readSecrets(): { apiKey: string; secretKey: string; baseUrl: string } | null {
  const apiKey = Deno.env.get("IYZICO_API_KEY")?.trim() ?? "";
  const secretKey = Deno.env.get("IYZICO_SECRET_KEY")?.trim() ?? "";
  if (!apiKey || !secretKey) return null;

  const raw = Deno.env.get("IYZICO_BASE_URL")?.trim() || "https://sandbox-api.iyzipay.com";
  let origin: string;
  try {
    const url = new URL(raw);
    origin = url.origin;
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "sandbox-api.iyzipay.com" && url.hostname !== "api.iyzipay.com") {
      return null;
    }
  } catch {
    return null;
  }

  return { apiKey, secretKey, baseUrl: origin };
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

function safeError(message: string): string {
  const text = message.replace(/\s+/g, " ").trim().slice(0, 300);
  if (/secret|api[_ ]?key|authorization|iyzwsv2/i.test(text)) return "Ödeme başlatılamadı";
  return text || "Ödeme başlatılamadı";
}

function gsmNumber(phone: string | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("5")) return `+90${digits}`;
  if (digits.length === 11 && digits.startsWith("05")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("90")) return `+${digits}`;
  return null;
}

function iyzicoDate(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  return when.toISOString().slice(0, 19).replace("T", " ");
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (/^[0-9a-fA-F:.]+$/.test(forwarded) && forwarded.length <= 64) return forwarded;
  return "127.0.0.1";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hostedUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "iyzipay.com" && !url.hostname.endsWith(".iyzipay.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { configured: false, error: "Ödeme başlatılamadı" }, 405);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(req, { configured: false, error: "Yetkisiz" }, 401);
  }

  const secrets = readSecrets();
  if (!secrets) {
    return json(req, { configured: false, code: "not_configured" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(req, { configured: true, error: "Ödeme başlatılamadı" }, 500);
  }

  let payload: { mode?: string; memberPackageId?: string } = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const mode = payload.mode === "checkout" ? "checkout" : "status";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json(req, { configured: true, error: "Yetkisiz" }, 401);
  }

  if (mode === "status") {
    return json(req, { configured: true });
  }

  if (!isUuid(payload.memberPackageId)) {
    return json(req, { configured: true, error: "Paket bulunamadı" }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: startedData, error: startError } = await serviceClient.rpc("begin_iyzico_payment", {
    p_user_id: userData.user.id,
    p_member_package_id: payload.memberPackageId,
    p_email: userData.user.email ?? "",
  });
  if (startError || !startedData) {
    const message = safeError(startError?.message || "Ödeme başlatılamadı");
    return json(req, { configured: true, error: message }, 400);
  }

  const started = startedData as StartedPayment;
  const existingUrl = hostedUrl(started.payment_page_url);
  if (started.iyzico_token && existingUrl) {
    return json(req, { configured: true, paymentPageUrl: existingUrl });
  }

  const phone = gsmNumber(started.buyer?.phone);
  const email = String(started.buyer?.email ?? "").trim();
  const name = String(started.buyer?.name ?? "").trim();
  const surname = String(started.buyer?.surname ?? "").trim();
  if (!phone || !email || !name || !surname || !started.payment_id) {
    return json(req, { configured: true, error: "Ödeme için hesap bilgileri eksik" }, 400);
  }

  const callbackUrl = `${supabaseUrl}/functions/v1/iyzico-callback`;
  const registeredAt = iyzicoDate(started.buyer?.registered_at);
  const requestBody = JSON.stringify({
    locale: "tr",
    conversationId: started.conversation_id,
    price: started.amount,
    paidPrice: started.amount,
    currency: "TRY",
    basketId: started.member_package_id,
    paymentGroup: "PRODUCT",
    callbackUrl,
    enabledInstallments: [1],
    buyer: {
      id: started.member_id,
      name,
      surname,
      // Studio profiles do not store a national ID. iyzico's documented sample value fills the required field.
      identityNumber: "11111111111",
      email,
      gsmNumber: phone,
      registrationDate: registeredAt,
      lastLoginDate: iyzicoDate(new Date().toISOString()),
      registrationAddress: STUDIO_ADDRESS,
      city: "İzmir",
      country: "Turkey",
      zipCode: "35220",
      ip: clientIp(req),
    },
    billingAddress: {
      contactName: `${name} ${surname}`,
      city: "İzmir",
      country: "Turkey",
      address: STUDIO_ADDRESS,
      zipCode: "35220",
    },
    basketItems: [
      {
        id: started.member_package_id,
        name: started.package_name,
        category1: "Pilates",
        category2: "Paket",
        itemType: "VIRTUAL",
        price: started.amount,
      },
    ],
  });

  let iyzico: Record<string, unknown>;
  try {
    const headers = await iyzicoAuthorization(secrets.apiKey, secrets.secretKey, INITIALIZE_PATH, requestBody);
    const response = await fetch(`${secrets.baseUrl}${INITIALIZE_PATH}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
    iyzico = await response.json();
  } catch {
    await serviceClient.rpc("mark_iyzico_payment_failed", {
      p_payment_id: started.payment_id,
      p_member_id: started.member_id,
      p_member_package_id: started.member_package_id,
      p_error: "Ödeme başlatılamadı",
    });
    return json(req, { configured: true, error: "Ödeme başlatılamadı" }, 502);
  }

  const paymentPageUrl = hostedUrl(iyzico.paymentPageUrl);
  const token = typeof iyzico.token === "string" ? iyzico.token : "";
  const content = typeof iyzico.checkoutFormContent === "string" ? iyzico.checkoutFormContent : "";
  if (iyzico.status !== "success" || !token || (!paymentPageUrl && !content)) {
    const errorText = safeError(typeof iyzico.errorMessage === "string" ? iyzico.errorMessage : "Ödeme başlatılamadı");
    await serviceClient.rpc("mark_iyzico_payment_failed", {
      p_payment_id: started.payment_id,
      p_member_id: started.member_id,
      p_member_package_id: started.member_package_id,
      p_error: errorText,
    });
    return json(req, { configured: true, error: "Ödeme başlatılamadı" }, 502);
  }

  const { error: attachError } = await serviceClient.rpc("attach_iyzico_checkout", {
    p_user_id: userData.user.id,
    p_payment_id: started.payment_id,
    p_token: token,
    p_payment_page_url: paymentPageUrl,
  });
  if (attachError) {
    await serviceClient.rpc("mark_iyzico_payment_failed", {
      p_payment_id: started.payment_id,
      p_member_id: started.member_id,
      p_member_package_id: started.member_package_id,
      p_error: "Ödeme başlatılamadı",
    });
    return json(req, { configured: true, error: "Ödeme başlatılamadı" }, 502);
  }

  if (paymentPageUrl) {
    return json(req, { configured: true, paymentPageUrl });
  }
  return json(req, { configured: true, checkoutFormContent: content });
});
