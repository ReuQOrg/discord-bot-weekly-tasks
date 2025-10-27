// Pošle datumy ve čtvrtek kolem 18:40 (Europe/Prague) s tolerancí ±20 min.
// Odesílá NÁSLEDUJÍCÍ týden (Po–Ne).

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const DEBUG = process.env.DEBUG === '1';
const FORCE = process.env.DEBUG_FORCE_SEND === '1';

if (!WEBHOOK_URL) {
  console.error("Chybí proměnná prostředí WEBHOOK_URL (GitHub Secret).");
  process.exit(1);
}

function log(...a){ if (DEBUG) console.log('[DEBUG]',...a); }

function prgParts(date = new Date(), opts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', ...opts })
    .formatToParts(date)
    .reduce((o,p)=> (o[p.type]=p.value, o), {});
}

function weekdayPrg1to7(d=new Date()){
  const parts = prgParts(d, { year:'numeric', month:'2-digit', day:'2-digit' });
  const dt = new Date(Date.UTC(+parts.year, +parts.month-1, +parts.day));
  const js = dt.getUTCDay(); // 0=Ne..6=So
  return js===0?7:js; // Po=1..Ne=7
}

function minutesFromTargetNow(targetHour, targetMin){
  // rozdíl (aktuální Praha) – (dnešní 18:40 Praha) v minutách
  const now = new Date();
  const pNow = prgParts(now, { hour:'2-digit', minute:'2-digit', hour12:false });
  const hh = +pNow.hour, mm = +pNow.minute;
  return (hh*60+mm) - (targetHour*60+targetMin);
}

// ---------- časová brána ----------
if (!FORCE) {
  const isThu = (weekdayPrg1to7(new Date()) === 4); // Čt=4
  const diff = minutesFromTargetNow(18,40); // minuty od 18:40
  const inWindow = (diff >= -20 && diff <= 20); // toler. 20 min
  log({isThu, diff, inWindow});
  if (!isThu || !inWindow) {
    console.log("Mimo okno čtvrtek ~18:40 Europe/Prague – nic se neposílá.");
    process.exit(0);
  }
}

// ---------- výpočet pondělí příštího týdne ----------
function pragueMidnightUTC(base = new Date()) {
  const p = prgParts(base, { year:'numeric', month:'2-digit', day:'2-digit' });
  return new Date(Date.UTC(+p.year, +p.month-1, +p.day));
}

const todayPrg = pragueMidnightUTC(new Date());
const wdToday = weekdayPrg1to7(todayPrg); // 1..7
const monThisWeek = new Date(todayPrg);
monThisWeek.setUTCDate(monThisWeek.getUTCDate() - (wdToday - 1));
const monNextWeek = new Date(monThisWeek);
monNextWeek.setUTCDate(monNextWeek.getUTCDate() + 7);

// ---------- formátování ----------
const fmtDayName = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long' });
const fmtDayNum  = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric' });
const fmtMonth   = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', month: 'numeric' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const lines = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(monNextWeek);
  d.setUTCDate(d.getUTCDate() + i);
  lines.push(`${cap(fmtDayName.format(d))} ${fmtDayNum.format(d)}.${fmtMonth.format(d)}.`);
}

const message = lines.join('\n');
console.log('Preview:\n' + message);

// ---------- odeslání ----------
const isSlackWebhook = WEBHOOK_URL.includes('/slack');
const payload = isSlackWebhook ? { text: message } : { content: message };

fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(async r => {
  const body = await r.text().catch(()=> '');
  console.log('Discord response:', r.status, body || '(no body)');
  if (!r.ok) {
    console.error('Chyba při odesílání na Discord.');
    process.exit(1);
  }
  console.log('Hotovo – zpráva odeslána.');
})
.catch(e => {
  console.error('Fetch chyba:', e);
  process.exit(1);
});
