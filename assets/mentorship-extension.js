export const MAX_MENTORSHIP_SESSIONS=200;
export function parseSessionTotal(value,current=0){const count=Number(value);if(!Number.isInteger(count)||count<1||count>MAX_MENTORSHIP_SESSIONS)throw Error('Informe uma quantidade inteira entre 1 e 200 sessões.');if(count<current)throw Error('A quantidade não pode ser menor que as '+current+' sessões atuais.');return count;}
export async function recordingExtensionAccess(supabase){try{const {data,error}=await supabase.rpc('has_recording_extension_access');return !error&&data===true}catch{return false}}
