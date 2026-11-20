const escape = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
export function scheduleEmail(item) {
  const to=String(item.recipient_email||'').trim(),start=new Date(item.scheduled_at);
  if(!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)||!Number.isFinite(start.getTime())||!['confirmation','reminder'].includes(item.kind))throw Error('Invalid appointment');
  const date=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(start);
  const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(start);
  const heading=item.kind==='reminder'?'Sua mentoria é amanhã':'Sua mentoria está agendada';
  const title=String(item.session_title||'Sessão '+item.session_number);
  return {to,subject:heading+' — '+date+' às '+time+' | Franco Trades',
    html:'<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f4f8f5;color:#142019"><div style="max-width:620px;margin:auto;padding:28px"><h2>FRANCO <span style="color:#16844d">TRADES</span></h2><div style="background:white;padding:25px;border-radius:14px"><h1>'+heading+'</h1><p>Olá, '+escape(item.recipient_name||'mentorado')+'.</p><p>Sessão '+escape(item.session_number)+' · '+escape(title)+'</p><p><strong>'+date+' às '+time+' — horário de Brasília</strong></p><p>Confira sua próxima mentoria na Área do Aluno. O botão para entrar ao vivo aparece quando o link é cadastrado e fica liberado próximo do horário da sessão.</p><a href="https://francotrades.github.io/mentoria-individual/aluno/#studyHome" style="display:inline-block;padding:14px 20px;background:#43e290;color:#04130c;border-radius:8px;text-decoration:none">Ver minha próxima mentoria</a><p>Se a sessão tiver sido remarcada, consulte a data atualizada no portal.</p></div></div></body></html>'};
}
