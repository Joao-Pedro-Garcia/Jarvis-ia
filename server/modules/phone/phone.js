// CELULAR — o JARVIS mexendo no próprio Android, pelo Termux:
//   • despertador de verdade no relógio do Android (comando `am`, já vem no Termux);
//   • bateria e lanterna (precisam do app gratuito Termux:API + `pkg install termux-api`).
// Sem o recurso (PC, ou Termux:API não instalado) → diz exatamente como instalar; nunca finge.
import { execFile } from 'node:child_process';
import { log } from '../../core/logger.js';
import { bus, EVENTS } from '../../core/events.js';

export const API_HELP = 'Para isso, instale o app gratuito Termux:API pela F-Droid e depois, no Termux, digite: pkg install termux-api';

function run(cmd, args = [], timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, missing: err.code === 'ENOENT', error: String(stderr || err.message).trim().slice(0, 200) });
        resolve({ ok: true, out: String(stdout).trim() });
      });
    } catch (err) { resolve({ ok: false, missing: true, error: err.message }); }
  });
}

/** Bateria: { ok, percent, charging, temperature } ou { ok:false, help }. */
export async function battery() {
  const r = await run('termux-battery-status');
  if (!r.ok) return { ok: false, help: r.missing ? API_HELP : `Não consegui ler a bateria (${r.error || 'sem resposta do Termux:API'}). ${API_HELP}` };
  try {
    const d = JSON.parse(r.out);
    return { ok: true, percent: Math.round(Number(d.percentage)), charging: /^(CHARGING|FULL)$/i.test(String(d.status)) || /^PLUGGED_(AC|USB|WIRELESS)$/i.test(String(d.plugged)), temperature: d.temperature != null ? Math.round(d.temperature) : null };
  } catch { return { ok: false, help: `O Termux:API respondeu num formato inesperado. ${API_HELP}` }; }
}

export async function torch(on) {
  const r = await run('termux-torch', [on ? 'on' : 'off']);
  if (!r.ok) return { ok: false, help: r.missing ? API_HELP : `Não consegui mexer na lanterna (${r.error}).` };
  return { ok: true };
}

/** Despertador no relógio do Android (aparece no app Relógio). Não precisa do Termux:API. */
export async function setAlarm(hour, minute, label = 'JARVIS', days = null) {
  const args = ['start', '-a', 'android.intent.action.SET_ALARM',
    // dias da semana (Android: domingo = 1 … sábado = 7)
    ...(days?.length ? ['--eial', 'android.intent.extra.alarm.DAYS', days.map((d) => d + 1).join(',')] : []),
    '--ei', 'android.intent.extra.alarm.HOUR', String(hour), '--ei', 'android.intent.extra.alarm.MINUTES', String(minute),
    '--es', 'android.intent.extra.alarm.MESSAGE', label.slice(0, 60), '--ez', 'android.intent.extra.alarm.SKIP_UI', 'true'];
  const r = await run('am', args);
  if (!r.ok) return { ok: false, help: r.missing ? 'Despertador de verdade só funciona com o JARVIS rodando no celular (Termux).' : `O Android não aceitou criar o despertador (${r.error}).` };
  if (/Error|Exception/i.test(r.out)) return { ok: false, help: `O Android não aceitou criar o despertador (${r.out.slice(0, 120)}).` };
  log.info('sistema', `Despertador criado para ${hour}:${String(minute).padStart(2, '0')}`);
  return { ok: true };
}

// ---------- Aviso de bateria fraca (a cada 10 min) ----------
let timer = null;
let warnedAt = -1;
export function startBatteryWatch(intervalMs = 10 * 60000) {
  if (timer || process.env.JARVIS_BATTERY_WATCH === '0') return;
  const check = async () => {
    const b = await battery();
    if (!b.ok) { clearInterval(timer); timer = null; return; } // sem Termux:API: não fica tentando
    if (!b.charging && b.percent <= 15 && warnedAt !== b.percent && (warnedAt < 0 || b.percent <= warnedAt - 5)) {
      warnedAt = b.percent;
      bus.emitEvent(EVENTS.BATTERY_LOW, { percent: b.percent });
    }
    if (b.charging) warnedAt = -1;
  };
  timer = setInterval(() => { check().catch(() => {}); }, intervalMs);
  timer.unref();
  setTimeout(() => { check().catch(() => {}); }, 30000).unref();
}
