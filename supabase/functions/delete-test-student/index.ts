import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};

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
        ok: false,
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
          "Apenas administradores podem excluir mentorados.",
      },
      403,
    );
  }

  let body:
    | {
        student_id?: string;
        confirm_email?: string;
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
    String(
      body?.student_id ||
      "",
    )
      .trim();

  const confirmEmail =
    String(
      body?.confirm_email ||
      "",
    )
      .trim()
      .toLowerCase();

  if (
    !studentId ||
    !confirmEmail
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Confirmação incompleta.",
      },
      400,
    );
  }

  if (
    studentId ===
    authData.user.id
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Você não pode excluir sua própria conta administrativa.",
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
        "id, nome, email, role",
      )
      .eq(
        "id",
        studentId,
      )
      .single();

  if (
    studentError ||
    !student
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

  if (
    student.role !==
    "aluno"
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Somente contas de mentorados podem ser excluídas por este recurso.",
      },
      400,
    );
  }

  const studentEmail =
    String(
      student.email ||
      "",
    )
      .trim()
      .toLowerCase();

  if (
    !studentEmail ||
    studentEmail !==
    confirmEmail
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "O e-mail de confirmação não corresponde ao mentorado selecionado.",
      },
      400,
    );
  }

  const {
    data: financialRows,
    error: financialLookupError,
  } =
    await supabase
      .from(
        "mentorship_financials",
      )
      .select(
        "id, origem, email",
      )
      .or(
        `profile_id.eq.${studentId},email.ilike.${studentEmail}`,
      );

  if (
    financialLookupError
  ) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Não foi possível verificar o histórico financeiro do mentorado.",
      },
      500,
    );
  }

  const financials =
    financialRows ||
    [];

  const protectedFinancial =
    financials.find(
      (item) =>
        item.origem &&
        item.origem !==
          "painel-admin",
    );

  if (
    protectedFinancial
  ) {
    return jsonResponse(
      {
        ok: false,
        protected: true,
        error:
          "Este mentorado possui histórico financeiro importado. A exclusão de teste foi bloqueada para proteger os dados antigos.",
      },
      409,
    );
  }

  try {
    for (
      const financial of
      financials
    ) {
      const {
        error: reminderError,
      } =
        await supabase
          .from(
            "payment_reminder_log",
          )
          .delete()
          .eq(
            "mentorship_id",
            financial.id,
          );

      if (reminderError) {
        throw reminderError;
      }

      const {
        error: paymentsError,
      } =
        await supabase
          .from(
            "mentorship_payments",
          )
          .delete()
          .eq(
            "mentorship_id",
            financial.id,
          );

      if (paymentsError) {
        throw paymentsError;
      }

      const {
        error: financialError,
      } =
        await supabase
          .from(
            "mentorship_financials",
          )
          .delete()
          .eq(
            "id",
            financial.id,
          );

      if (financialError) {
        throw financialError;
      }
    }

    const {
      error: progressError,
    } =
      await supabase
        .from(
          "student_progress",
        )
        .delete()
        .eq(
          "student_id",
          studentId,
        );

    if (progressError) {
      throw progressError;
    }

    const {
      error: sessionsError,
    } =
      await supabase
        .from(
          "student_sessions",
        )
        .delete()
        .eq(
          "student_id",
          studentId,
        );

    if (sessionsError) {
      throw sessionsError;
    }

    const {
      error: profileDeleteError,
    } =
      await supabase
        .from(
          "profiles",
        )
        .delete()
        .eq(
          "id",
          studentId,
        );

    if (profileDeleteError) {
      throw profileDeleteError;
    }

    const {
      error: authDeleteError,
    } =
      await supabase.auth
        .admin
        .deleteUser(
          studentId,
        );

    if (authDeleteError) {
      throw authDeleteError;
    }

    return jsonResponse({
      ok: true,
      deleted: true,
      student_id:
        studentId,
      email:
        studentEmail,
      financial_records_deleted:
        financials.length,
    });

  } catch (error) {
    console.error(
      "Erro ao excluir mentorado de teste:",
      error,
    );

    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
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
