import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STUDENT_AREA_URL =
  "https://francotrades.github.io/mentoria-individual/login/";

function jsonResponse(body: unknown, status = 200) {
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

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Falha no envio do e-mail: ${text}`,
    );
  }

  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers:
          corsHeaders,
      },
    );
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error:
          "Método não permitido.",
      },
      405,
    );
  }

  const supabaseUrl =
    Deno.env.get("SUPABASE_URL");

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
        ok: false,
        error:
          "Configuração do Supabase ausente.",
      },
      500,
    );
  }

  const token =
    req.headers
      .get("Authorization")
      ?.replace(
        /^Bearer\s+/i,
        "",
      )
      .trim();

  if (!token) {
    return jsonResponse(
      {
        ok: false,
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
        ok: false,
        error:
          "Sessão inválida.",
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
      .single();

  if (
    adminError ||
    adminProfile?.role !==
      "admin"
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Apenas administradores podem enviar boas-vindas.",
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
  } catch {
    return jsonResponse(
      {
        ok: false,
        error:
          "Corpo da requisição inválido.",
      },
      400,
    );
  }

  const studentId =
    body?.student_id;

  if (!studentId) {
    return jsonResponse(
      {
        ok: false,
        error:
          "student_id é obrigatório.",
      },
      400,
    );
  }

  const {
    data: student,
    error: studentError,
  } =
    await supabase
      .from(
        "profiles",
      )
      .select(
        "id, nome, email, data_inicio, data_expiracao, status, role",
      )
      .eq(
        "id",
        studentId,
      )
      .single();

  if (
    studentError ||
    !student ||
    student.role !==
      "aluno" ||
    !student.email
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Mentorado não encontrado.",
      },
      404,
    );
  }

  const firstName =
    String(
      student.nome ||
      "",
    )
      .trim()
      .split(
        /\s+/,
      )[0] ||
    "Mentorado";

  const email =
    String(
      student.email,
    )
      .trim()
      .toLowerCase();

  const subject =
    "Bem-vindo à Mentoria Individual — Franco Trades";

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
          Seu acesso à plataforma Franco Trades foi criado. A partir de agora, a Área do Aluno será o seu ponto central para acompanhar sessões, aulas ao vivo, gravações, progresso e pagamentos.
        </p>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">1. Procure primeiro o e-mail de convite da Supabase</div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Além deste e-mail de boas-vindas, você receberá um outro e-mail automático enviado pela <strong style="color:#fff;">Supabase</strong>, que é o serviço usado para criar seu acesso com segurança. Esse é o e-mail que contém o link para definir sua senha pela primeira vez.
            <br><br>
            Procure na sua caixa de entrada por um e-mail da Supabase. Se não encontrar, verifique também <strong style="color:#fff;">Spam, Lixo Eletrônico ou Promoções</strong>. Abra esse e-mail e clique no link de convite para criar sua senha.
          </div>
        </div>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">2. Use o e-mail cadastrado</div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Seu acesso foi criado com o e-mail <strong style="color:#fff;">${escapeHtml(email)}</strong>. Use esse endereço para entrar na plataforma e, sempre que possível, mantenha esse mesmo e-mail na sua conta Google/YouTube para facilitar o acesso às gravações privadas.
          </div>
        </div>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">3. Acesse sempre pela Área do Aluno</div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Depois de criar sua senha, você poderá entrar sempre pelo botão <strong style="color:#fff;">Área do Aluno</strong> no site da mentoria ou pelo botão abaixo.
          </div>
        </div>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:20px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">4. Importante sobre as gravações no YouTube</div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.65;">
            Use este mesmo e-mail cadastrado na mentoria — <strong style="color:#fff;">${escapeHtml(email)}</strong> — na sua conta do YouTube/Google. As gravações privadas podem ser liberadas especificamente para esse endereço, então usar a mesma conta evita problemas de acesso.
          </div>
        </div>

        <div style="background:#09100c;border:1px solid rgba(67,226,144,.16);border-radius:12px;padding:18px;margin-bottom:24px;">
          <div style="color:#43e290;font-size:13px;font-weight:900;margin-bottom:10px;">5. Como funcionará daqui para frente</div>
          <div style="color:#b2bbb6;font-size:14px;line-height:1.7;">
            Quando o link de uma aula ao vivo estiver disponível, você receberá um aviso por e-mail com acesso direto ao Microsoft Teams. Após a sessão, a gravação será disponibilizada na plataforma quando estiver pronta. Na Área do Aluno você também poderá acompanhar seu progresso e as informações financeiras da mentoria.
          </div>
        </div>

        <a
          href="${STUDENT_AREA_URL}"
          style="display:inline-block;background:#43e290;color:#04130c;text-decoration:none;font-weight:900;padding:13px 18px;border-radius:10px;"
        >
          Acessar Área do Aluno
        </a>

        <p style="color:#7f8a84;font-size:12px;line-height:1.6;margin:22px 0 0;">
          Sugestão: salve a Área do Aluno nos favoritos do navegador para facilitar seus próximos acessos.
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
        subject,
        html,
      );

    return jsonResponse({
      ok: true,
      sent: true,
      recipient:
        email,
      provider,
    });
  } catch (error) {
    console.error(
      error,
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof
              Error
            ?
            error.message
            :
            String(
              error,
            ),
      },
      500,
    );
  }
});
