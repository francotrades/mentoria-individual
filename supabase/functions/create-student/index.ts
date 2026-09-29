import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
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
        "Content-Type":
          "application/json",
      },
    },
  );
}

function escapeHtml(
  value: unknown,
) {
  return String(
    value ??
    "",
  )
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&#039;",
    );
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
) {
  const webhookUrl =
    Deno.env.get(
      "GOOGLE_MAIL_WEBHOOK_URL",
    );

  const secret =
    Deno.env.get(
      "GOOGLE_MAIL_SECRET",
    );

  if (
    !webhookUrl ||
    !secret
  ) {
    throw new Error(
      "Configuração de e-mail ausente.",
    );
  }

  const response =
    await fetch(
      webhookUrl,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            secret,
            to,
            subject,
            html,
          }),
      },
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Falha no envio do e-mail: ${text}`,
    );
  }

  return text;
}

Deno.serve(
  async (
    req,
  ) => {

    if (
      req.method ===
      "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers:
            corsHeaders,
        },
      );
    }

    if (
      req.method !==
      "POST"
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
      data:
        authData,
      error:
        authError,
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
      data:
        adminProfile,
      error:
        adminError,
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
        .single();

    if (
      adminError ||
      adminProfile?.role !==
        "admin"
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Apenas administradores podem criar mentorados.",
        },
        403,
      );
    }

    let body:
      | {
          nome?: string;
          email?: string;
          data_inicio?: string;
          data_expiracao?: string;
          numero_sessoes?: number;
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

    const nome =
      String(
        body?.nome ||
        "",
      ).trim();

    const email =
      String(
        body?.email ||
        "",
      )
        .trim()
        .toLowerCase();

    const dataInicio =
      String(
        body?.data_inicio ||
        "",
      );

    const dataExpiracao =
      String(
        body?.data_expiracao ||
        "",
      );

    const numeroSessoes =
      Math.max(
        1,
        Number(
          body?.numero_sessoes ||
          12,
        ),
      );

    if (
      !nome ||
      !email ||
      !email.includes(
        "@",
      ) ||
      !dataInicio ||
      !dataExpiracao
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Dados do mentorado incompletos.",
        },
        400,
      );
    }

    const {
      data:
        linkData,
      error:
        linkError,
    } =
      await supabase.auth
        .admin
        .generateLink({
          type:
            "invite",
          email,
          options: {
            data: {
              nome,
            },
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
            "Não foi possível gerar o convite seguro.",
        },
        400,
      );
    }

    const studentId =
      linkData.user.id;

    const properties:
      any =
        linkData.properties ||
        {};

    const hashedToken =
      properties.hashed_token ||
      properties.hashedToken ||
      (
        linkData as any
      ).hashed_token ||
      (
        linkData as any
      ).hashedToken ||
      "";

    const passwordLink =
      hashedToken
        ?
        `${PASSWORD_URL}?token_hash=${encodeURIComponent(hashedToken)}&type=invite`
        :
        "";

    if (!passwordLink) {
      await supabase.auth
        .admin
        .deleteUser(
          studentId,
        );

      return jsonResponse(
        {
          success: false,
          error:
            "O token seguro foi criado, mas não pôde ser recuperado.",
        },
        500,
      );
    }

    const {
      error:
        profileError,
    } =
      await supabase
        .from(
          "profiles",
        )
        .upsert(
          {
            id:
              studentId,
            nome,
            email,
            data_inicio:
              dataInicio,
            data_expiracao:
              dataExpiracao,
            status:
              "ativo",
            role:
              "aluno",
          },
          {
            onConflict:
              "id",
          },
        );

    if (profileError) {
      await supabase.auth
        .admin
        .deleteUser(
          studentId,
        );

      return jsonResponse(
        {
          success: false,
          error:
            "Não foi possível criar o perfil do mentorado.",
        },
        500,
      );
    }

    const {
      data:
        sessions,
      error:
        sessionsError,
    } =
      await supabase
        .from(
          "sessions",
        )
        .select(
          "id, numero",
        )
        .order(
          "numero",
          {
            ascending:
              true,
          },
        )
        .limit(
          numeroSessoes,
        );

    if (sessionsError) {
      return jsonResponse(
        {
          success: false,
          error:
            "O usuário foi criado, mas não foi possível carregar as sessões.",
        },
        500,
      );
    }

    if (
      sessions &&
      sessions.length >
        0
    ) {
      const rows =
        sessions.map(
          (
            session,
          ) => ({
            student_id:
              studentId,
            session_id:
              session.id,
            liberada:
              true,
          }),
        );

      const {
        error:
          studentSessionsError,
      } =
        await supabase
          .from(
            "student_sessions",
          )
          .insert(
            rows,
          );

      if (
        studentSessionsError
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "O usuário foi criado, mas houve erro ao liberar as sessões.",
          },
          500,
        );
      }
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
          Bem-vindo à sua mentoria, ${escapeHtml(firstName)}.
        </h1>

        <p style="color:#b2bbb6;font-size:15px;line-height:1.7;margin:0 0 22px;">
          Seu acesso à plataforma Franco Trades já foi criado. Para começar, clique no botão abaixo e defina sua senha pessoal.
        </p>

        <a
          href="${escapeHtml(passwordLink)}"
          style="display:inline-block;background:#43e290;color:#04130c;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:10px;margin-bottom:22px;"
        >
          Criar minha senha
        </a>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">
            Seu e-mail de acesso
          </div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Sua conta foi criada com <strong style="color:#fff;">${escapeHtml(email)}</strong>. Use esse mesmo endereço sempre que entrar na Área do Aluno.
          </div>
        </div>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">
            Gravações no YouTube
          </div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Sempre que possível, use este mesmo e-mail <strong style="color:#fff;">${escapeHtml(email)}</strong> na sua conta Google/YouTube. As gravações privadas podem ser liberadas especificamente para esse endereço.
          </div>
        </div>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">
            Como funcionará daqui para frente
          </div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.7;">
            A Área do Aluno será o seu ponto central para acompanhar sessões, aulas ao vivo, gravações, progresso e pagamentos. Quando um link do Microsoft Teams estiver disponível, você também receberá um aviso por e-mail com acesso direto à aula.
          </div>
        </div>

        <p style="color:#7f8a84;font-size:12px;line-height:1.6;margin:22px 0 0;">
          Se o botão “Criar minha senha” não abrir, copie e cole este link no navegador:<br>
          <span style="word-break:break-all;color:#aeb8b2;">${escapeHtml(passwordLink)}</span>
        </p>
      </div>
    </div>
  </body>
</html>
    `;

    let provider:
      unknown =
        null;

    try {
      provider =
        await sendEmail(
          email,
          "Bem-vindo à Mentoria Individual — Franco Trades",
          html,
        );
    }
    catch (
      emailError
    ) {
      console.error(
        "Falha ao enviar convite personalizado:",
        emailError,
      );

      return jsonResponse(
        {
          success: true,
          student: {
            id:
              studentId,
            email,
            nome,
          },
          email_sent:
            false,
          warning:
            emailError instanceof
                Error
              ?
              emailError.message
              :
              String(
                emailError,
              ),
        },
      );
    }

    return jsonResponse({
      success:
        true,
      student: {
        id:
          studentId,
        email,
        nome,
      },
      email_sent:
        true,
      provider,
    });
  },
);
