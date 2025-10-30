// Pošle datumy ve čtvrtek kolem 18:40 (Europe/Prague) s tolerancí ±20 min.
// Odesílá NÁSLEDUJÍCÍ týden (Po–Ne) – každá věta jako samostatná zpráva (pro reakce).

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

const dayLines = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(monNextWeek);
  d.setUTCDate(d.getUTCDate() + i);
  dayLines.push(`${cap(fmtDayName.format(d))} ${fmtDayNum.format(d)}.${fmtMonth.format(d)}.`);
}

const isSlackWebhook = WEBHOOK_URL.includes('/slack');

// ---------- odesílání – každá položka zvlášť ----------
async function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

async function sendOne(line){
  const payload = isSlackWebhook ? { text: line } : { content: line };

  while (true) {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const bodyText = await r.text().catch(()=> '');
    log('Discord response:', r.status, bodyText || '(no body)');

    if (r.status === 429) {
      // Discord vrací retry_after (ms). Když není, počkáme 1000 ms.
      let retryMs = 1000;
      try {
        const obj = JSON.parse(bodyText || '{}');
        if (obj && typeof obj.retry_after !== 'undefined') {
          retryMs = Math.max(500, Math.ceil(Number(obj.retry_after)));
          // pokud je v sekundách, změňte zde na *1000 – některé instance vrací ms, jiné s:
          if (retryMs < 50) retryMs = retryMs * 1000;
        }
      } catch (_) {}
      log(`Rate limited. Waiting ${retryMs} ms…`);
      await sleep(retryMs);
      continue; // zkusi znovu
    }

    if (!r.ok) {
      console.error('Chyba při odesílání na Discord:', bodyText || r.status);
      process.exit(1);
    }
    break;
  }
}

async function main(){
  console.log('Preview (jednotlivé zprávy):\n' + dayLines.join('\n'));
  for (const line of dayLines) {
    await sendOne(line);
    await sleep(800); // malé zpoždění mezi zprávami
  }
  console.log('Hotovo – všechny dny odeslány jako samostatné zprávy.');
}

main().catch(e => {
  console.error('Nečekaná chyba:', e);
  process.exit(1);
});
