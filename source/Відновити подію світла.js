// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// Scriptable — резервне внесення пропущених подій світла для РК10.
// Не змінює планові графіки; використовує існуючі файли Світло вдома.
const fm = FileManager.local();
const dir = fm.documentsDirectory();
const historyPath = fm.joinPath(dir, 'light-history.json');
const statePath = fm.joinPath(dir, 'light-home.json');
const pad = n => String(n).padStart(2, '0');
const now = new Date();
const defaultDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

async function notice(title, msg) {
  const a = new Alert(); a.title = title; a.message = msg; a.addAction('OK'); await a.presentAlert();
}
async function prompt() {
  const a = new Alert();
  a.title = 'Відновити подію РК10';
  a.message = 'Вкажи точний час із Telegram. Це змінить історію фактичного світла.';
  a.addTextField('Дата (РРРР-ММ-ДД)', defaultDate);
  a.addTextField('Час (ГГ:ХХ)', defaultTime);
  a.addAction('🟢 Світло з’явилося');
  a.addAction('🔴 Світло зникло');
  a.addCancelAction('Скасувати');
  const choice = await a.presentAlert();
  if (choice < 0 || choice > 1) return null;
  return {status:choice===0?'on':'off', date:a.textFieldValue(0).trim(), time:a.textFieldValue(1).trim()};
}
function parseLocal(date,time) {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t=/^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  const [Y,M,D,h,min]=[+m[1],+m[2],+m[3],+t[1],+t[2]];
  if (Y<2020 || M<1 || M>12 || D<1 || D>31 || h>23 || min>59) return null;
  const d=new Date(Y,M-1,D,h,min,0,0);
  if (d.getFullYear()!==Y||d.getMonth()!==M-1||d.getDate()!==D||d.getHours()!==h||d.getMinutes()!==min)return null;
  return d.getTime();
}
function readJSON(path,fallback) {
  if (!fm.fileExists(path)) return fallback;
  return JSON.parse(fm.readString(path));
}
const req = await prompt();
if (!req) { Script.complete(); }
else {
  const at=parseLocal(req.date,req.time);
  if (at===null || at>Date.now()+60000 || at<Date.now()-90*86400000) {
    await notice('Час не прийнято','Введи коректну локальну дату й час не в майбутньому та не старші за 90 днів.');
  } else {
    try {
      const original = readJSON(historyPath, []);
      if(!Array.isArray(original))throw new Error('Історія має неправильний формат');
      const hist=original.filter(x=>x && (x.status==='on'||x.status==='off') && Number.isFinite(x.at))
                         .map(x=>({status:x.status,at:x.at})).sort((a,b)=>a.at-b.at);
      if(hist.some(x=>Math.abs(x.at-at)<60000 && x.status!==req.status)) {
        await notice('Конфлікт', 'На цю хвилину вже записаний протилежний стан. Історію не змінено.');
      } else {
        const candidate=hist.concat([{status:req.status,at}]).sort((a,b)=>a.at-b.at);
        // Залишаємо першу з послідовних однакових подій, не вигадуючи перемикань.
        const normalized=[];
        for(const x of candidate) {
          if(!normalized.length || normalized[normalized.length-1].status!==x.status)normalized.push(x);
        }
        const modified=JSON.stringify(normalized)!==JSON.stringify(hist);
        if(!modified) {
          await notice('Подія вже врахована', 'У цьому інтервалі стан уже такий самий. Додаткову подію не створено.');
        } else {
          const confirm = new Alert();
          confirm.title='Підтвердити відновлення';
          confirm.message=`${req.status==='on'?'Світло з’явилося':'Світло зникло'}: ${req.date} ${req.time}\n\nБуде оновлено історію та поточний стан із її останньої події. Перед змінами створиться резервна копія.`;
          confirm.addAction('Зберегти'); confirm.addCancelAction('Скасувати');
          if(await confirm.presentAlert()===0) {
            const state=readJSON(statePath,{status:'unknown',since:null,lastOutage:null,lastSeen:null});
            const stamp=Date.now();
            if(fm.fileExists(historyPath))fm.copy(historyPath,fm.joinPath(dir,`light-history.backup-${stamp}.json`));
            if(fm.fileExists(statePath))fm.copy(statePath,fm.joinPath(dir,`light-home.backup-${stamp}.json`));
            const last=normalized[normalized.length-1];
            const prev=normalized.length>1?normalized[normalized.length-2]:null;
            const newState={...state,status:last.status,since:last.at};
            if(last.status==='on' && prev && prev.status==='off')newState.lastOutage=Math.max(0,last.at-prev.at);
            // lastSeen — час отримання реального сповіщення; не видаємо ручну правку за нове сповіщення.
            fm.writeString(historyPath,JSON.stringify(normalized));
            fm.writeString(statePath,JSON.stringify(newState));
            await notice('Історію відновлено',`${req.status==='on'?'🟢 Світло з’явилося':'🔴 Світло зникло'} — ${req.date} ${req.time}.\n\nЗаписів в історії: ${normalized.length}. Резервні копії створено.`);
          }
        }
      }
    } catch(err) { await notice('Не вдалося зберегти',String(err)); }
  }
  Script.complete();
}
