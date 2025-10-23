// post-week.js
// Ve ČTVRTEK v 18:40 (Europe/Prague) pošle do Discordu dny a datumy pro NÁSLEDUJÍCÍ týden (Po–Ne).

const WEBHOOK_URL = process.env.WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error("Chybí proměnná prostředí WEBHOOK_URL (GitHub Secret).");
  process.exit(1);
}

// "Půlnoc v Praze" jako UTC Date – usnadní počítání dnů
function pragueMidnightUTC(base = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(base);
  const y = +parts.find(p => p.type === 'year').value;
  const m = +parts.find(p => p.type === 'month').value;
  const d = +parts.find(p => p.type === 'day').value;
  return new Date(Date.UTC(y, m - 1, d));
}

// Den v týdnu v Praze (Po=1 … Ne=7)
function pragueWeekday1to7(date = new Date()) {
  const prg = pragueMidnightUTC(date);
  const jsDay = prg.getUTCDay(); // 0=Ne..6=So
  return jsDay === 0 ? 7 : jsDay; // Po=1..Ne=7
}

// Aktuální hodina/minuta v Praze
function pragueHourMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const hh = +parts.find(p => p.type === 'hour').value;
  const mm = +parts.find(p => p.type === 'minute').value;
  return [hh, mm];
}

// Podmínka: Čtvrtek 18:40 v Praze
const weekday = pragueWeekday1to7(new Date()); // Po=1..Ne=7
const [hh, mm] = pragueHourMinute(new Date());
const isThursday = (weekday === 4);
const isExactTime = (hh === 18 && mm === 40);

if (!isThursday || !isExactTime) {
  console.log("Není čtvrtek 18:40 v Europe/Prague – nic se neposílá.");
  process.exit(0);
}

// Najdi pondělí NÁSLEDUJÍCÍHO týdne
const todayPrg = pragueMidnightUTC(new Date());
// pondělí aktuálního týdne
const deltaToMonThis = (pragueWeekday1to7(todayPrg) - 1);
const monThisWeek = new Date(todayPrg);
monThisWeek.setUTCDate(monThisWeek.getUTCDate() - deltaToMonThis);
// pondělí dalšího týdne
const monNextWeek = new Date(monThisWeek);
monNextWeek.setUTCDate(monNextWeek.getUTCDate() + 7);

// Formattery (CZ, Praha)
const fmtDayName = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long' });
const fmtDayNum  = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric' });
const fmtMonth   = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', month: 'numeric' });

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const lines = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(monNextWeek);
  d.setUTCDate(d.getUTCDate() + i);
  const name = cap(fmtDayName.format(d));   // „Pondělí“
  const day = fmtDayNum.format(d);          // „10“
  const month = fmtMonth.format(d);         // „8“
  lines.push(`${name} ${day}.${month}.`);   // „Pondělí 10.8.“
}

const payload = { content: lines.join('\n') };

// Odeslání na Discord webhook (Node 20 má fetch globálně)
fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
.then(async (r) => {
  if (!r.ok) {
    console.error("Chyba při odesílání na Discord:", r.status, await r.text());
    process.exit(1);
  }
  console.log("Hotovo – zpráva odeslána.");
})
.catch((e) => {
  console.error("Fetch chyba:", e);
  process.exit(1);
});
