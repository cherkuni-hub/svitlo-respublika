// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;

const fm = FileManager.local();
const path = fm.joinPath(
  fm.documentsDirectory(),
  "light-home.json"
);

let s = {status:"unknown", since:null};

if (fm.fileExists(path)) {
  try {
    s = {...s, ...JSON.parse(fm.readString(path))};
  } catch(e) {}
}

const w = new ListWidget();
w.backgroundColor = new Color("#000000");
w.setPadding(2, 2, 2, 2);

const on = s.status === "on";
const off = s.status === "off";

const color = new Color(
  on ? "#22C55E" : off ? "#EF4444" : "#AAAAAA"
);

const header = w.addText("⚡ Світло вдома");
header.font = Font.boldSystemFont(11);
header.textColor = Color.white();
header.lineLimit = 1;
header.minimumScaleFactor = 0.7;

w.addSpacer(3);

const title = w.addText(
  on ? "Є світло" :
  off ? "Немає світла" : "Немає даних"
);
title.font = Font.boldSystemFont(14);
title.textColor = color;
title.lineLimit = 1;

if (off && s.since) {
  w.addSpacer(3);
  const minutes = Math.max(0,
    Math.floor((Date.now() - s.since) / 60000)
  );
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  const duration = w.addText(
    "Вже " + (h ? h + " год " : "") + m + " хв"
  );
  duration.font = Font.systemFont(10);
  duration.textColor = Color.white();
}

w.refreshAfterDate = new Date(Date.now()+60000);
Script.setWidget(w);
Script.complete();
