// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;
// Scriptable — Статистика світла, 7 днів (MEDIUM)
// Чорна тема. Нативний текст, без картинок.
// Читає light-history.json, який веде «Світло вдома».

const fm = FileManager.local();
const file = fm.joinPath(fm.documentsDirectory(), "light-history.json");
const NOW = Date.now();
const C = {
  bg: "#000000", text: "#FFFFFF", muted: "#A3A3A3",
  green: "#4ADE80", red: "#F87171", tile: "#303030",
  line: "#242424"
};

let history = [];
try {
  if (fm.fileExists(file)) {
    const raw = JSON.parse(fm.readString(file));
    if (Array.isArray(raw)) history = raw;
  }
} catch (e) {
  console.log("Помилка читання історії: " + e);
}

const events = history.filter(e =>
  e && (e.status === "on" || e.status === "off") &&
  Number.isFinite(e.at) && e.at <= NOW
).sort((a, b) => a.at - b.at);

const periods = [];
for (let i = 0; i < events.length; i++) {
  const end = i + 1 < events.length ? events[i + 1].at : NOW;
  if (end > events[i].at) {
    periods.push({
      start: events[i].at,
      end,
      status: events[i].status,
      completed: i + 1 < events.length && events[i + 1].status === "on"
    });
  }
}

function overlap(a, b, c, d) {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}
function stats(a, b) {
  let on = 0, off = 0;
  for (const p of periods) {
    const ms = overlap(a, b, p.start, p.end);
    if (p.status === "on") on += ms;
    else off += ms;
  }
  return { on, off, known: on + off };
}
function fmt(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h} год ${m} хв` : `${m} хв`;
}
function write(parent, value, size, color = C.text, bold = false) {
  const t = parent.addText(String(value));
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

const todayStart = new Date(NOW);
todayStart.setHours(0, 0, 0, 0);
const weekStart = new Date(todayStart);
weekStart.setDate(weekStart.getDate() - 6);
const days = [];
for (let i = 0; i < 7; i++) {
  const date = new Date(weekStart);
  date.setDate(weekStart.getDate() + i);
  const next = new Date(date);
  next.setDate(date.getDate() + 1);
  days.push({
    name: ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][date.getDay()],
    ...stats(date.getTime(), Math.min(NOW, next.getTime()))
  });
}
const today = days[6];
const week = stats(weekStart.getTime(), NOW);
const outages = periods.filter(p =>
  p.status === "off" && p.start >= weekStart.getTime() && p.start <= NOW
);
const finished = outages.filter(p => p.completed);
const avg = finished.length
  ? finished.reduce((sum, p) => sum + p.end - p.start, 0) / finished.length
  : null;

const w = new ListWidget();
w.backgroundColor = new Color(C.bg);
w.setPadding(9, 12, 8, 12);

// Заголовок
const head = w.addStack();
head.centerAlignContent();
write(head, "⚡", 15, C.green, true);
head.addSpacer(5);
write(head, "Статистика світла", 16, C.text, true);
head.addSpacer();
write(head, "7 днів", 10, C.muted);
w.addSpacer(7);

// Дві рівні колонки з чотирма показниками
function metric(row, caption, value) {
  const box = row.addStack();
  box.layoutVertically();
  box.size = new Size(145, 31);
  write(box, caption, 9, C.muted);
  box.addSpacer(2);
  write(box, value, 14, C.text, true);
}
let row = w.addStack();
metric(row, "Сьогодні без світла", today.known ? fmt(today.off) : "Немає даних");
row.addSpacer();
metric(row, "За 7 днів", week.known ? fmt(week.off) : "Немає даних");
w.addSpacer(4);

row = w.addStack();
metric(row, "Відключень", events.length ? String(outages.length) : "—");
row.addSpacer();
metric(row, "Середня тривалість", avg === null ? "—" : fmt(avg));
w.addSpacer(5);

// П'ятий показник — компактний окремий рядок
const light = w.addStack();
light.centerAlignContent();
light.backgroundColor = new Color("#171C19");
light.cornerRadius = 5;
light.setPadding(3, 7, 3, 7);
write(light, "Сьогодні зі світлом", 10, C.muted);
light.addSpacer();
write(light, today.known ? fmt(today.on) : "Немає даних", 11, C.green, true);
w.addSpacer(6);

// Сім однакових колонок: назва дня завжди по центру своєї плитки
const chart = w.addStack();
chart.layoutHorizontally();
const barWidth = 33, barHeight = 25;
// Висота плитки = доба: зелений = підтверджене світло,
// червоний = підтверджене відключення, сірий = немає даних.
for (let i = 0; i < 7; i++) {
  if (i > 0) chart.addSpacer();
  const day = days[i];
  const col = chart.addStack();
  col.layoutVertically();
  col.size = new Size(barWidth, 39);

  const track = col.addStack();
  track.layoutVertically();
  track.size = new Size(barWidth, barHeight);
  track.backgroundColor = new Color(C.tile);
  track.cornerRadius = 4;

  if (!day.known) {
    track.addSpacer();
    const missing = track.addStack();
    missing.size = new Size(barWidth, 12);
    missing.addSpacer();
    write(missing, "—", 10, C.muted);
    missing.addSpacer();
    track.addSpacer();
  } else {
    // Час доби йде ЗНИЗУ ВГОРУ: 00:00 унизу, 24:00 угорі.
    // Порядок подій зберігаємо, змінюємо тільки візуальний напрям.
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() + i);
    const next = new Date(start);
    next.setDate(start.getDate() + 1);
    const dayStart = start.getTime();
    const dayEnd = next.getTime();
    const fullDay = dayEnd - dayStart;

    const segments = [];
    let cursor = dayStart;
    for (const p of periods) {
      const a = Math.max(dayStart, p.start);
      const b = Math.min(dayEnd, p.end);
      if (b <= a) continue;
      if (a > cursor) {
        segments.push({ a: cursor, b: a, status: "unknown" });
      }
      segments.push({ a, b, status: p.status });
      cursor = b;
    }
    if (cursor < dayEnd) {
      segments.push({ a: cursor, b: dayEnd, status: "unknown" });
    }

    // Малюємо зверху вниз у зворотному хронологічному порядку.
    // Верх — 24:00 (або майбутній час), низ — 00:00.
    // Висоту рахуємо за межами інтервалів, без накопичення похибки.
    let used = 0;
    for (const seg of segments.reverse()) {
      const toY = Math.round((dayEnd - seg.a) / fullDay * barHeight);
      const height = Math.max(0, toY - used);
      used = toY;
      if (height === 0) continue;
      if (seg.status === "unknown") {
        track.addSpacer(height);
      } else {
        const part = track.addStack();
        part.size = new Size(barWidth, height);
        part.backgroundColor = new Color(
          seg.status === "on" ? C.green : C.red
        );
      }
    }
    if (used < barHeight) track.addSpacer(barHeight - used);
  }

  col.addSpacer(2);
  const dayRow = col.addStack();
  dayRow.size = new Size(barWidth, 12);
  dayRow.addSpacer();
  const dayText = write(dayRow, day.name, 9, C.muted);
  dayText.centerAlignText();
  dayRow.addSpacer();
}

w.refreshAfterDate = new Date(NOW + 60000);
Script.setWidget(w);
if (config.runsInApp) await w.presentMedium();
Script.complete();
