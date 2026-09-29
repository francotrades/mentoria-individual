import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_MAIL_WEBHOOK_URL = Deno.env.get("GOOGLE_MAIL_WEBHOOK_URL") ?? "";
const GOOGLE_MAIL_SECRET = Deno.env.get("GOOGLE_MAIL_SECRET") ?? "";

const STUDENT_AREA_URL =
  "https://francotrades.github.io/mentoria-individual/aluno/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateBR(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  ).format(
    new Date(`${value}T12:00:00Z`),
  );
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
) {
  const response = await fetch(
    GOOGLE_MAIL_WEBHOOK_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: GOOGLE_MAIL_SECRET,
        to,
        subject,
        html,
      }),
    },
  );

  const text = await response.text();

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text,
    };
  }

  if (
    !response.ok ||
    data.ok !== true
  ) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Mail webhook failed with status ${response.status}`,
    );
  }

  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  const authHeader =
    request.headers.get("authorization") ?? "";

  if (
    !authHeader
      .toLowerCase()
      .startsWith("bearer ")
  ) {
    return jsonResponse(
      { error: "Unauthorized" },
      401,
    );
  }

  const token =
    authHeader.slice(7).trim();

  const { data: authData } =
    await supabase.auth.getUser(token);

  if (!authData?.user?.id) {
    return jsonResponse(
      { error: "Unauthorized" },
      401,
    );
  }

  const { data: adminProfile } =
    await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

  if (adminProfile?.role !== "admin") {
    return jsonResponse(
      { error: "Forbidden" },
      403,
    );
  }

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY ||
    !GOOGLE_MAIL_WEBHOOK_URL ||
    !GOOGLE_MAIL_SECRET
  ) {
    return jsonResponse(
      { error: "Missing server configuration" },
      500,
    );
  }

  let body: Record<string, unknown> = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const studentSessionId =
    Number(body.student_session_id ?? 0);

  if (
    !Number.isFinite(studentSessionId) ||
    studentSessionId <= 0
  ) {
    return jsonResponse(
      { error: "student_session_id is required" },
      400,
    );
  }

  const {
    data: studentSession,
    error: sessionError,
  } =
    await supabase
      .from("student_sessions")
      .select(`
        id,
        student_id,
        session_id,
        teams_url,
        data_sessao,
        titulo_personalizado
      `)
      .eq("id", studentSessionId)
      .maybeSingle();

  if (
    sessionError ||
    !studentSession
  ) {
    console.error(sessionError);

    return jsonResponse(
      { error: "Student session not found" },
      404,
    );
  }

  if (!studentSession.teams_url) {
    return jsonResponse(
      { error: "Teams link is not available" },
      400,
    );
  }

  const [
    profileResult,
    sessionResult,
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("nome,email")
        .eq("id", studentSession.student_id)
        .maybeSingle(),

      supabase
        .from("sessions")
        .select("numero,titulo")
        .eq("id", studentSession.session_id)
        .maybeSingle(),
    ]);

  if (
    profileResult.error ||
    !profileResult.data
  ) {
    console.error(profileResult.error);

    return jsonResponse(
      { error: "Student profile not found" },
      404,
    );
  }

  const profile =
    profileResult.data;

  const session =
    sessionResult.data ?? null;

  const recipient =
    String(profile.email ?? "").trim();

  if (!recipient) {
    return jsonResponse(
      { error: "Student email not found" },
      400,
    );
  }

  const firstName =
    String(profile?.nome ?? "")
      .trim()
      .split(/\s+/)[0] ||
    "Olá";

  const sessionNumber =
    session?.numero ??
    studentSession.session_id;

  const sessionTitle =
    studentSession.titulo_personalizado ||
    session?.titulo ||
    `Sessão ${sessionNumber}`;

  const dateText =
    studentSession.data_sessao
      ? formatDateBR(studentSession.data_sessao)
      : "";

  const subject =
    `Link da sessão ${sessionNumber} disponível — Franco Trades`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;background:#050706;color:#f5f7f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:1px;margin-bottom:28px;">
        FRANCO<span style="color:#43e290;">TRADES</span>
      </div>

      <div style="background:#0c110e;border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:26px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#43e290;margin-bottom:9px;">
          Mentoria Individual
        </div>

        <h1 style="font-size:24px;line-height:1.2;margin:0 0 14px;">
          Link da aula ao vivo disponível
        </h1>

        <p style="color:#b2bbb6;font-size:15px;line-height:1.65;margin:0 0 10px;">
          ${escapeHtml(firstName)}, o link para a sua próxima sessão ao vivo já está disponível na Área do Aluno.
        </p>

        <p style="color:#ffffff;font-size:15px;font-weight:700;line-height:1.65;margin:0 0 22px;">
          Sessão ${escapeHtml(sessionNumber)} · ${escapeHtml(sessionTitle)}
          ${dateText ? `<br><span style="color:#b2bbb6;font-weight:400;">Data: ${escapeHtml(dateText)}</span>` : ""}
        </p>

        <a
          href="${STUDENT_AREA_URL}"
          style="display:inline-block;background:#43e290;color:#04130c;text-decoration:none;font-weight:900;padding:13px 18px;border-radius:10px;"
        >
          Acessar Área do Aluno
        </a>

        <p style="color:#7f8a84;font-size:12px;line-height:1.55;margin:20px 0 0;">
          Ao entrar na sua sessão, toque em “Entrar na aula ao vivo” para abrir o Microsoft Teams.
        </p>
      </div>
    </div>
  </body>
</html>
  `;

  try {
    const provider = await sendEmail(
      recipient,
      subject,
      html,
    );

    return jsonResponse({
      ok: true,
      sent: true,
      recipient,
      provider,
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});
