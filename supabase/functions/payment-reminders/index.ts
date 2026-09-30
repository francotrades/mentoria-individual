import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_MAIL_WEBHOOK_URL = Deno.env.get("GOOGLE_MAIL_WEBHOOK_URL") ?? "";
const GOOGLE_MAIL_SECRET = Deno.env.get("GOOGLE_MAIL_SECRET") ?? "";
const REMINDER_CRON_SECRET = Deno.env.get("REMINDER_CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STUDENT_AREA_URL =
  "https://francotrades.github.io/mentoria-individual/aluno/";

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

type ReminderType =
  | "3_days_before"
  | "due_today"
  | "3_days_overdue"
  | "manual";

function saoPauloDateISO() {
  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateDiffDays(dueDate: string, todayISO: string) {
  const due = new Date(`${dueDate}T12:00:00Z`);
  const today = new Date(`${todayISO}T12:00:00Z`);

  return Math.round(
    (due.getTime() - today.getTime()) / 86_400_000,
  );
}

function reminderTypeForDiff(diff: number): ReminderType | null {
  if (diff === 3) return "3_days_before";
  if (diff === 0) return "due_today";
  if (diff === -3) return "3_days_overdue";
  return null;
}

function formatMoney(
  value: number,
  currency: string,
) {
  return new Intl.NumberFormat(
    currency === "USD" ? "en-US" : "pt-BR",
    {
      style: "currency",
      currency,
    },
  ).format(value);
}

function formatDateBR(value: string) {
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

function reminderCopy(
  type: ReminderType,
  firstName: string,
  installment: number,
  amount: string,
  dueDate: string,
) {
  const safeName = firstName || "Olá";

  if (type === "manual") {
    return {
      subject: `Lembrete sobre sua parcela ${installment} — Franco Trades`,
      headline: "Lembrete da sua mentoria",
      intro:
        `${safeName}, passando apenas para lembrar da parcela ${installment} da sua mentoria${dueDate ? `, com vencimento em ${dueDate}` : ""}.`,
      detail:
        `Valor da parcela: ${amount}. Se o pagamento já tiver sido realizado, pode desconsiderar esta mensagem.`,
    };
  }

  if (type === "3_days_before") {
    return {
      subject: `Lembrete da sua mentoria — parcela ${installment}`,
      headline: "Lembrete da sua próxima parcela",
      intro:
        `${safeName}, passando para lembrar que a parcela ${installment} da sua mentoria vence em 3 dias, em ${dueDate}.`,
      detail:
        `Valor da parcela: ${amount}.`,
    };
  }

  if (type === "due_today") {
    return {
      subject: `Lembrete da sua mentoria — parcela ${installment}`,
      headline: "Lembrete de vencimento",
      intro:
        `${safeName}, passando para lembrar que a parcela ${installment} da sua mentoria vence hoje.`,
      detail:
        `Valor da parcela: ${amount}.`,
    };
  }

  return {
    subject: `Lembrete sobre sua parcela ${installment} — Franco Trades`,
    headline: "Lembrete de pagamento",
    intro:
      `${safeName}, passando apenas para lembrar que a parcela ${installment} da sua mentoria tinha vencimento em ${dueDate}.`,
    detail:
      `Valor da parcela: ${amount}. Se o pagamento já tiver sido realizado, pode desconsiderar esta mensagem.`,
  };
}

function emailHtml(
  headline: string,
  intro: string,
  detail: string,
) {
  return `
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
          ${headline}
        </h1>

        <p style="color:#b2bbb6;font-size:15px;line-height:1.65;margin:0 0 10px;">
          ${intro}
        </p>

        <p style="color:#ffffff;font-size:15px;font-weight:700;line-height:1.65;margin:0 0 22px;">
          ${detail}
        </p>

        <a
          href="${STUDENT_AREA_URL}"
          style="display:inline-block;background:#43e290;color:#04130c;text-decoration:none;font-weight:900;font-size:13px;padding:13px 18px;border-radius:9px;"
        >
          Abrir Área do Aluno
        </a>

        <p style="color:#7f8a84;font-size:12px;line-height:1.6;margin:22px 0 0;">
          A chave PIX, o QR Code e o PIX Copia e Cola estão disponíveis na sua Área do Aluno.
          Esta mensagem é apenas um lembrete automático. Caso o pagamento já tenha sido realizado, pode desconsiderá-la.
        </p>
      </div>

      <p style="color:#626d67;font-size:11px;line-height:1.5;margin-top:18px;">
        Franco Trades · Mentoria Individual
      </p>
    </div>
  </body>
</html>
  `;
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
        ...corsHeaders,
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

  const raw = await response.text();
  let body: Record<string, unknown> = {};

  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }

  if (!response.ok || body?.ok !== true) {
    throw new Error(
      `Gmail webhook error ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  let requestBody: Record<string, unknown> = {};
  try {
    requestBody = await request.json();
  } catch {
    requestBody = {};
  }

  const cronAuthorized =
    Boolean(REMINDER_CRON_SECRET) &&
    request.headers.get("x-cron-secret") ===
      REMINDER_CRON_SECRET;

  let adminAuthorized = false;

  const authHeader =
    request.headers.get("authorization") ?? "";

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();

    const { data: authData } =
      await supabase.auth.getUser(token);

    if (authData?.user?.id) {
      const { data: adminProfile } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();

      adminAuthorized =
        adminProfile?.role === "admin";
    }
  }

  if (!cronAuthorized && !adminAuthorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  const previewMode =
    requestBody.preview === true;

  const previewEmail =
    typeof requestBody.preview_email === "string"
      ? requestBody.preview_email.trim()
      : "";

  const manualMode =
    requestBody.manual === true;

  const manualPaymentId =
    Number(requestBody.payment_id ?? 0);

  if (previewMode && !previewEmail) {
    return new Response(
      JSON.stringify({
        error: "preview_email is required when preview=true",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if ((previewMode || manualMode) && !adminAuthorized && !cronAuthorized) {
    return new Response(
      JSON.stringify({ error: "Admin authorization required" }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (manualMode && (!adminAuthorized || !Number.isFinite(manualPaymentId) || manualPaymentId <= 0)) {
    return new Response(
      JSON.stringify({
        error: "A valid payment_id and admin session are required for manual reminders",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (
    !SUPABASE_URL ||
    !SERVICE_ROLE_KEY ||
    !GOOGLE_MAIL_WEBHOOK_URL ||
    !GOOGLE_MAIL_SECRET
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAIL_WEBHOOK_URL or GOOGLE_MAIL_SECRET",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  const todayISO = saoPauloDateISO();

  let paymentsQuery =
    supabase
      .from("mentorship_payments")
      .select(`
        id,
        mentorship_id,
        numero_parcela,
        valor,
        vencimento,
        paga,
        mentorship_financials!inner (
          id,
          nome,
          email,
          moeda
        )
      `)
      .eq("paga", false);

  if (manualMode) {
    paymentsQuery =
      paymentsQuery.eq("id", manualPaymentId);
  } else {
    paymentsQuery =
      paymentsQuery.not("vencimento", "is", null);
  }

  const { data: payments, error: paymentsError } =
    await paymentsQuery;

  if (paymentsError) {
    console.error(paymentsError);

    return new Response(
      JSON.stringify({
        error: "Failed to load payments",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  if (manualMode && (!payments || payments.length === 0)) {
    return new Response(
      JSON.stringify({
        error: "Pending payment not found",
      }),
      {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  let sent = 0;
  let skipped = 0;
  const errors: Array<Record<string, unknown>> = [];
  const warnings: Array<Record<string, unknown>> = [];

  for (const payment of payments ?? []) {
    const financial =
      Array.isArray(payment.mentorship_financials)
        ? payment.mentorship_financials[0]
        : payment.mentorship_financials;

    if (!financial?.email) {
      skipped++;
      continue;
    }

    let type: ReminderType | null =
      manualMode
        ? "manual"
        : reminderTypeForDiff(
            dateDiffDays(
              String(payment.vencimento),
              todayISO,
            ),
          );

    if (!type) {
      skipped++;
      continue;
    }

    if (!previewMode && !manualMode) {
      const { data: existingLog } =
        await supabase
          .from("payment_reminder_log")
          .select("id")
          .eq("payment_id", payment.id)
          .eq("reminder_type", type)
          .maybeSingle();

      if (existingLog) {
        skipped++;
        continue;
      }
    }

    const firstName =
      String(financial.nome ?? "")
        .trim()
        .split(/\s+/)[0];

    const copy = reminderCopy(
      type,
      firstName,
      payment.numero_parcela,
      formatMoney(
        Number(payment.valor ?? 0),
        financial.moeda ?? "BRL",
      ),
      payment.vencimento
        ? formatDateBR(payment.vencimento)
        : "",
    );

    try {
      const recipient = previewMode
        ? previewEmail
        : financial.email;

      const provider = await sendEmail(
        recipient,
        copy.subject,
        emailHtml(
          copy.headline,
          copy.intro,
          copy.detail,
        ),
      );

      if (!previewMode) {
        const { error: logError } =
          await supabase
            .from("payment_reminder_log")
            .insert({
              payment_id: payment.id,
              mentorship_id: payment.mentorship_id,
              reminder_type: type,
              recipient_email: financial.email,
              provider_message_id:
                provider?.sentAt ?? null,
              provider_response:
                provider ?? null,
            });

        if (logError) {
          console.error(
            "Email sent but log failed",
            logError,
          );

          warnings.push({
            payment_id: payment.id,
            email: financial.email,
            warning:
              `Email sent, but log failed: ${logError.message}`,
          });
        }
      }

      sent++;
    } catch (error) {
      console.error(error);

      errors.push({
        payment_id: payment.id,
        email: financial.email,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      date: todayISO,
      sent,
      skipped,
      preview: previewMode,
      manual: manualMode,
      warnings,
      errors,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
});
