/**
 * FrancoTrades - emissor de e-mails pelo Gmail
 *
 * Configuração necessária no Google Apps Script:
 * 1. Em Project Settings > Script Properties, crie:
 *    MAIL_SECRET = uma senha aleatória longa.
 * 2. Faça Deploy > New deployment > Web app.
 * 3. Execute as: Me.
 * 4. Who has access: Anyone.
 * 5. Copie a URL /exec e salve no Supabase como GOOGLE_MAIL_WEBHOOK_URL.
 * 6. Salve o mesmo MAIL_SECRET no Supabase como GOOGLE_MAIL_SECRET.
 *
 * Nenhum segredo deve ser colocado neste arquivo ou no GitHub.
 */

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expectedSecret =
      PropertiesService.getScriptProperties().getProperty("MAIL_SECRET");

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse_({
        ok: false,
        error: "Unauthorized"
      });
    }

    const to = String(payload.to || "").trim();
    const subject = String(payload.subject || "").trim();
    const html = String(payload.html || "");

    if (!to || !subject || !html) {
      return jsonResponse_({
        ok: false,
        error: "Missing to, subject or html"
      });
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      htmlBody: html,
      name: "Franco Trades"
    });

    return jsonResponse_({
      ok: true,
      provider: "gmail-apps-script",
      sentAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: err && err.message ? err.message : String(err)
    });
  }
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "FrancoTrades Gmail Mailer"
  });
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
