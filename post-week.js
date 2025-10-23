// post-week.js
// Pošle do Discordu dny a datumy pro NÁSLEDUJÍCÍ týden (Po-Ne) v cz formátu.
// Spouštěj kdykoliv – skript sám počká na pondělí (jinak skončí bez postu).

const WEBHOOK_URL = process.env.WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error("Chybí proměnná prostředí WEBHOOK_URL.");
  process.exit(1);
}

// vrátí "datum v Praze" na půlnoc jako UTC Date (usnadní počítání dnů)
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

// zjištění dne v týdnu pro Prahu (Po=1, ... Ne=7)
function pragueWeekday1to7(date = new Date()) {
  const prg = pragueMidnightUTC(date);
  const jsDay = prg.getUTCDay(); // 0=Ne ... 6=So
  return jsDay === 0 ? 7 : jsDay; // 1=Po ... 7=Ne
}

// pokud dnes není pondělí (v Praze), nespouštěj post (akce běží denně)
if (pragueWeekday1to7(new Date()) !== 1) {
  console.log("Dnes není pondělí v Europe/Prague – žádná zpráva se neposílá.");
  process.exit(0);
}

// najdi pondělí NÁSLEDUJÍCÍHO týdne (ne aktuální)
const todayPrg = pragueMidnightUTC(new Date());
// pondělí aktuálního týdne
const deltaToMonThis = (pragueWeekday1to7(todayPrg) - 1); // 0..6
const monThisWeek = new Date(todayPrg);
monThisWeek.setUTCDate(monThisWeek.getUTCDate() - deltaToMonThis);
// pondělí dalšího týdne
const monNextWeek = new Date(monThisWeek);
monNextWeek.setUTCDate(monNextWeek.getUTCDate() + 7);

// formattery
const fmtDayName = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long' });
const fmtDayNum  = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric' });
const fmtMonth   = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', month: 'numeric' });

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const lines = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(monNextWeek);
  d.setUTCDate(d.getUTCDate() + i);
  const name = cap(fmtDayName.format(d));
  const day = fmtDayNum.format(d);
  const month = fmtMonth.format(d);
  lines.push(`${name} ${day}.${month}.`);
}

const payload = { content: lines.join('\n') };

// pošli na Discord webhook
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
