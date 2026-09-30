import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PASSWORD_URL =
  "https://francotrades.github.io/mentoria-individual/definir-senha/";

function jsonResponse(
  body: unknown,
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

function escapeHtml(
  value: unknown,
) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
) {
  const webhookUrl =
    Deno.env.get("GOOGLE_MAIL_WEBHOOK_URL");

  const secret =
    Deno.env.get("GOOGLE_MAIL_SECRET");

  if (!webhookUrl || !secret) {
    throw new Error(
      "Configuração de e-mail ausente.",
    );
  }

  const response =
    await fetch(
      webhookUrl,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          secret,
          to,
          subject,
          html,
        }),
      },
    );

  const raw =
    await response.text();

  let parsed: Record<string, unknown> = {};

  try {
    parsed =
      raw
        ? JSON.parse(raw)
        : {};
  }
  catch {
    parsed = {
      raw,
    };
  }

  if (
    !response.ok ||
    parsed?.ok !== true
  ) {
    throw new Error(
      "Falha no envio do e-mail.",
    );
  }

  return parsed;
}

Deno.serve(
  async req => {

    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          status: 200,
          headers:
            corsHeaders,
        },
      );
    }

    if (
      req.method !== "POST"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Método não permitido.",
        },
        405,
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      );

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      );

    if (
      !supabaseUrl ||
      !serviceRoleKey
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Configuração do Supabase ausente.",
        },
        500,
      );
    }

    const token =
      req.headers
        .get(
          "Authorization",
        )
        ?.replace(
          /^Bearer\s+/i,
          "",
        )
        .trim();

    if (!token) {
      return jsonResponse(
        {
          success: false,
          error:
            "Não autorizado.",
        },
        401,
      );
    }

    const supabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
            detectSessionInUrl:
              false,
          },
        },
      );

    const {
      data: authData,
      error: authError,
    } =
      await supabase.auth
        .getUser(
          token,
        );

    if (
      authError ||
      !authData.user
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Sessão administrativa inválida.",
        },
        401,
      );
    }

    const {
      data: adminProfile,
      error: adminError,
    } =
      await supabase
        .from(
          "profiles",
        )
        .select(
          "role",
        )
        .eq(
          "id",
          authData.user.id,
        )
        .maybeSingle();

    if (
      adminError ||
      adminProfile?.role !==
        "admin"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Apenas administradores podem reenviar acessos.",
        },
        403,
      );
    }

    let body:
      | {
          student_id?: string;
        }
      | null =
        null;

    try {
      body =
        await req.json();
    }
    catch {
      return jsonResponse(
        {
          success: false,
          error:
            "Corpo da requisição inválido.",
        },
        400,
      );
    }

    const studentId =
      String(
        body?.student_id ||
        "",
      ).trim();

    if (!studentId) {
      return jsonResponse(
        {
          success: false,
          error:
            "Mentorado não informado.",
        },
        400,
      );
    }

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from(
          "profiles",
        )
        .select(
          "id, nome, email, role, status, data_expiracao",
        )
        .eq(
          "id",
          studentId,
        )
        .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.role !==
        "aluno"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Mentorado não encontrado.",
        },
        404,
      );
    }

    const email =
      String(
        profile.email ||
        "",
      )
        .trim()
        .toLowerCase();

    const nome =
      String(
        profile.nome ||
        "Mentorado",
      )
        .trim();

    if (
      !email ||
      !email.includes("@")
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "O mentorado não possui um e-mail válido.",
        },
        400,
      );
    }

    const {
      data: linkData,
      error: linkError,
    } =
      await supabase.auth
        .admin
        .generateLink({
          type:
            "recovery",
          email,
          options: {
            redirectTo:
              PASSWORD_URL,
          },
        });

    if (
      linkError ||
      !linkData?.user
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            linkError?.message ||
            "Não foi possível gerar um novo link de acesso.",
        },
        400,
      );
    }

    const properties:
      any =
        linkData.properties ||
        {};

    const hashedToken =
      properties.hashed_token ||
      properties.hashedToken ||
      (linkData as any)
        .hashed_token ||
      (linkData as any)
        .hashedToken ||
      "";

    const passwordLink =
      hashedToken
        ?
        `${PASSWORD_URL}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`
        :
        "";

    if (!passwordLink) {
      return jsonResponse(
        {
          success: false,
          error:
            "O novo token foi gerado, mas não pôde ser recuperado.",
        },
        500,
      );
    }

    const firstName =
      nome
        .split(
          /\s+/,
        )[0] ||
      "Mentorado";

    const html = `
<!doctype html>
<html>
  <body style="margin:0;background:#050706;color:#f5f7f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:1px;margin-bottom:28px;">
        FRANCO<span style="color:#43e290;">TRADES</span>
      </div>

      <div style="background:#0c110e;border:1px solid rgba(255,255,255,.09);border-radius:16px;padding:28px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#43e290;margin-bottom:9px;">
          Mentoria Individual
        </div>

        <h1 style="font-size:25px;line-height:1.2;margin:0 0 14px;">
          Novo link de acesso, ${escapeHtml(firstName)}.
        </h1>

        <p style="color:#b2bbb6;font-size:15px;line-height:1.7;margin:0 0 22px;">
          Um novo link foi gerado para você definir ou redefinir sua senha da Área do Aluno Franco Trades.
        </p>

        <a
          href="${escapeHtml(passwordLink)}"
          style="display:inline-block;background:#43e290;color:#04130c;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:10px;margin-bottom:22px;"
        >
          Definir nova senha
        </a>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">
            Seu e-mail de acesso
          </div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Sua conta utiliza o e-mail <strong style="color:#fff;">${escapeHtml(email)}</strong>.
          </div>
        </div>

        <p style="color:#b2bbb6;font-size:13px;line-height:1.65;margin:0;">
          Por segurança, utilize o link assim que possível. Se ele já tiver sido usado ou estiver expirado, solicite um novo acesso à Franco Trades.
        </p>

        <p style="color:#7f8a84;font-size:12px;line-height:1.6;margin:22px 0 0;">
          Se o botão não abrir, copie e cole este link no navegador:<br>
          <span style="word-break:break-all;color:#aeb8b2;">${escapeHtml(passwordLink)}</span>
        </p>
      </div>
    </div>
  </body>
</html>
    `;

    try {
      const provider =
        await sendEmail(
          email,
          "Novo link de acesso — Franco Trades",
          html,
        );

      return jsonResponse({
        success:
          true,
        email_sent:
          true,
        student: {
          id:
            studentId,
          email,
          nome,
        },
        provider,
      });
    }
    catch (emailError) {
      console.error(
        "Falha ao reenviar acesso:",
        emailError,
      );

      return jsonResponse(
        {
          success: false,
          email_sent:
            false,
          error:
            emailError instanceof
                Error
              ?
              emailError.message
              :
              String(
                emailError,
              ),
        },
        502,
      );
    }
  },
);
