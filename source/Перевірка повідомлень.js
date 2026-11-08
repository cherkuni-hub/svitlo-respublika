// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// Scriptable — RK10 adaptation inbox and safe, confirmed learning.
// Run manually in the Scriptable app. Does not rewrite any existing script.
const fm=FileManager.local(),dir=fm.documentsDirectory();
const pendingPath=fm.joinPath(dir,'rk10-adaptive-pending.json');
const rulesPath=fm.joinPath(dir,'rk10-adaptive-rules.json');
const schedulePath=fm.joinPath(dir,'rk10-schedules-v1.json');
function read(p,fallback){try{return JSON.parse(fm.readString(p));}catch(_){return fallback;}}
function save(p,x){fm.writeString(p,JSON.stringify(x,null,2));}
function backup(p){if(fm.fileExists(p)){const name=p.split('/').pop();fm.writeString(fm.joinPath(dir,'rk10-backup-'+name+'-'+Date.now()+'.bak'),fm.readString(p));}}
function norm(s){return String(s||'').toLowerCase().replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();}
async function choose(title,message,labels){const a=new Alert();a.title=title;a.message=message;labels.forEach(x=>a.addAction(x));a.addCancelAction('Скасувати');return await a.present();}
async function prompt(title,message,placeholder){const a=new Alert();a.title=title;a.message=message;a.addTextField(placeholder||'Введи значення');a.addAction('Підтвердити');a.addCancelAction('Скасувати');const r=await a.present();return r===0?a.textFieldValue(0).trim():null;}
function time(s){let m=String(s).trim().match(/^(\d{1,2})(?::|\.)(\d{2})$/);if(!m)return null;let h=+m[1],mi=+m[2];return h<=24&&mi<60&&(h!==24||mi===0)?60*h+mi:null;}
function manualRanges(s){let entries=s.split(/[\n;,]+/).map(x=>x.trim()).filter(Boolean), out=[];
 for(let item of entries){let m=item.match(/^(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})\s+(on|off|є|немає|так|ні|1|0)$/iu);if(!m)return null;
 let a=time(m[1]),b=time(m[2]);if(a===null||b===null||b<=a)return null;
 out.push({from:a,to:b,on:/^(on|є|так|1)$/iu.test(m[3])});}
 if(!out.length||out[0].from!==0||out[out.length-1].to!==1440)return null;
 for(let i=1;i<out.length;i++)if(out[i].from!==out[i-1].to||out[i].on===out[i-1].on)return null;
 return out;
}
function isEmergencyMessage(s){
 const t=norm(s);
 return /(?:аварій[а-яіїєґ]*\s+відключенн|аварі[яїієґ]|аварійн|планов[а-яіїєґ]*\s+графік[а-яіїєґ]*\s+не\s+діють|⚡\s*аварія\s*дтек)/iu.test(t);
}
function effectiveKind(entry){
 // Repair classification of previously queued messages without touching any data.
 if(entry.kind==='schedule' && isEmergencyMessage(entry.message) &&
    !/(?:графік|розклад)\s+на\s+(?:сьогодні|завтра)/iu.test(entry.message))return 'incident';
 return entry.kind;
}
async function handle(entry){
 const selected=await choose('РК10 · '+effectiveKind(entry),(effectiveKind(entry)!==entry.kind?'Це аварійне повідомлення, а не плановий графік.\n':'')+entry.reason+'\n\n'+entry.message.slice(0,900),['Підтвердити / виправити','Ігнорувати']);
 if(selected<0)return false;
 if(selected===1)return true;
 if(entry.kind==='status'){
   const action=await choose('Що означає повідомлення?',entry.message.slice(0,500),['Світло зникло','Світло зʼявилось','Не є статусом']);
   if(action<0)return false;if(action===2)return true;
   const label=action===0?'off':'on';
   const phrase=await prompt('Навчити розпізнавач','Введи характерну фразу, яка однозначно означає цей статус. Не вводь РК10, дату або час. Приклад: «електроживлення припинено». Вона використовуватиметься ТІЛЬКИ в рядку з РК10.','Фраза зі сповіщення');
   if(phrase===null)return false;
   const p=norm(phrase);
   if(p.length<5||p.length>100||/[\d]/.test(p)||/\b(?:рк|rk|pk)\s*10\b/iu.test(p)){
     await choose('Правило відхилено','Фраза має бути 5–100 символів, без цифр та назви РК10.',['Гаразд']);return false;
   }
   const lines=entry.message.split('\n');
   if(!lines.some(line=>/(?:рк|rk|pk)\s*10\b/iu.test(line)&&norm(line).includes(p))){
     await choose('Не вдалося навчити','Фраза має дослівно бути в тому самому рядку, де зазначено РК10. Це обмеження захищає від хибних перемикань.',['Гаразд']);return false;
   }
   let rules=read(rulesPath,{});rules.status=Array.isArray(rules.status)?rules.status:[];
   if(rules.status.some(r=>norm(r.phrase)===p&&r.value!==label)){
     await choose('Конфлікт правил','Ця сама фраза вже навчена означати протилежний стан. Нове правило не записано.',['Гаразд']);return false;
   }
   if(!rules.status.some(r=>norm(r.phrase)===p&&r.value===label)){
     backup(rulesPath);rules.status.push({phrase:p,value:label,created:Date.now()});save(rulesPath,rules);
   }
   await choose('Правило збережено','Майбутні повідомлення з цією фразою та РК10 будуть розпізнані. Минулу подію автоматично НЕ додано в історію, щоб не записати неправильний час. Для цього є «Відновити подію світла».',['Гаразд']);
   return true;
 }
 if(effectiveKind(entry)==='schedule'){
   const date=await prompt('Дата графіка','Дата у форматі РРРР-ММ-ДД.','2026-11-08');if(date===null)return false;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date+'T00:00:00').getTime())||new Date(date+'T00:00:00').toLocaleDateString('sv-SE')!==date){await choose('Некоректна дата','Не зберігав нічого.',['Гаразд']);return false;}
   const source=await prompt('Підтверди повний графік','Напиши всі інтервали через ; або з нового рядка. Формат: 00:00-07:00 off; 07:00-10:00 on; ... до 24:00. on = світло є, off = немає.','00:00-07:00 off; 07:00-10:00 on; ...');if(source===null)return false;
   const ranges=manualRanges(source);if(!ranges){await choose('Графік не збережено','Інтервали мають без пропусків покривати 00:00–24:00 і чергувати on/off.',['Гаразд']);return false;}
   let db=read(schedulePath,{schedules:{},incidents:[]});if(!db||typeof db!=='object')db={schedules:{},incidents:[]};db.schedules=db.schedules||{};
   const conf=await choose('Зберегти підтверджений графік?',date+' · '+ranges.length+' інтервалів. Запис замінить графік за цю дату.',['Так, зберегти']);if(conf!==0)return false;
   backup(schedulePath);db.schedules[date]={ranges,received:Date.now(),manual:true};save(schedulePath,db);
   await choose('Готово','Підтверджений графік збережено. Це не нове універсальне правило парсингу: якщо формат знову зміниться, буде нове попередження.',['Гаразд']);return true;
 }
 if(effectiveKind(entry)==='incident'){
   const action=await choose('Аварійне повідомлення','Вибери підтверджений зміст.',['Аварійне відключення діє','Аварію скасовано','Не стосується РК10']);if(action<0)return false;if(action===2)return true;
   const date=await prompt('Дата аварії','Дата у форматі РРРР-ММ-ДД.','2026-11-08');if(date===null)return false;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00').toLocaleDateString('sv-SE')!==date){await choose('Некоректна дата','Дані не змінено.',['Гаразд']);return false;}
   let db=read(schedulePath,{schedules:{},incidents:[]});db.incidents=Array.isArray(db.incidents)?db.incidents:[];
   backup(schedulePath);db.incidents=db.incidents.filter(x=>x.date!==date);db.incidents.push({date,status:action===0?'active':'cancel',received:Date.now(),manual:true});save(schedulePath,db);return true;
 }
 return false;
}
// Migrate false alarms generated by older schedule parser, without modifying schedules or light history.
// Only a queued *schedule parsing* error that contains a clear emergency statement
// and does NOT contain a real 'schedule for today/tomorrow' header can be retired.
function obsoleteEmergencyScheduleError(entry){
 if(!entry || entry.status!=='pending' || entry.kind!=='schedule')return false;
 const reason=norm(entry.reason);
 if(!/(?:не вдалося прочитати|не вдалося розпізнати|повн[а-яіїєґ]* графік|планов[а-яіїєґ]* графік)/iu.test(reason))return false;
 return effectiveKind(entry)==='incident';
}
let items=read(pendingPath,[]);if(!Array.isArray(items))items=[];
let cleaned=0;
for(const entry of items){
 if(obsoleteEmergencyScheduleError(entry)){
   entry.status='dismissed_false_schedule';
   entry.reviewedAt=Date.now();
   entry.resolution='Аварійне повідомлення, помилково записане старою версією як графік';
   cleaned++;
 }
}
if(cleaned){backup(pendingPath);save(pendingPath,items);}
let outstanding=items.filter(x=>x.status==='pending');
if(!outstanding.length){await choose('РК10 · Все добре',(cleaned?'Прибрано старих помилкових перевірок графіка: '+cleaned+'.\n\n':'')+'Немає неперевірених повідомлень. Якщо Telegram не надіслав сповіщення, скрипт не може визначити пропуск.',['Гаразд']);}
else{
 const selected=await choose('РК10 · Потрібна перевірка','Невідомих повідомлень: '+outstanding.length+(cleaned?'\nВиправлено старих хибних сповіщень: '+cleaned:'')+'\n\nОстаннє: '+outstanding[outstanding.length-1].reason+'\n'+outstanding[outstanding.length-1].message.slice(0,250),['Перевірити останнє']);
 if(selected===0){let obj=outstanding[outstanding.length-1];let done=await handle(obj);if(done){obj.status='reviewed';obj.reviewedAt=Date.now();save(pendingPath,items);}}
}
Script.complete();
