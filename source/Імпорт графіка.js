// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// SCRIPTABLE: importer for both widgets.
// RK10 power schedule: shared routines (embedded into each standalone script).
const FM = FileManager.local();
const fmAD=FM;

// Shared RK10 adaptation data. All original files are retained.
const AD_PENDING=fmAD.joinPath(fmAD.documentsDirectory(),'rk10-adaptive-pending.json');
const AD_RULES=fmAD.joinPath(fmAD.documentsDirectory(),'rk10-adaptive-rules.json');
const AD_LOG=fmAD.joinPath(fmAD.documentsDirectory(),'rk10-adaptive-log.json');
function adRead(path,fallback){try{const a=JSON.parse(fmAD.readString(path));return a&&typeof a==='object'?a:fallback;}catch(_){return fallback;}}
function adWrite(path,data){fmAD.writeString(path,JSON.stringify(data,null,2));}
function adNorm(s){return String(s||'').toLowerCase().replace(/[’‘`]/g,"'").replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();}
function adAlert(kind,message,reason){
  let now=Date.now(), list=adRead(AD_PENDING,[]);if(!Array.isArray(list))list=[];
  const norm=adNorm(message), key=kind+'|'+norm;
  const last=list.find(x=>x.key===key&&now-x.at<30*60000);
  if(last)return;
  list.push({id:'p'+now+'-'+Math.floor(Math.random()*10000),key,kind,at:now,message:String(message).slice(0,6000),reason,status:'pending'});
  adWrite(AD_PENDING,list.slice(-100));
  let log=adRead(AD_LOG,[]);if(!Array.isArray(log))log=[];
  log.push({at:now,kind,reason,preview:String(message).slice(0,500)});adWrite(AD_LOG,log.slice(-200));
  try{let n=new Notification();n.title='⚠️ РК10 · Перевір повідомлення';n.body=reason+'. Відкрий «РК10 · Перевірка повідомлень».';n.sound='default';let p=n.schedule();if(p&&p.catch)p.catch(e=>console.log('Сповіщення: '+e));}catch(e){console.log('Сповіщення: '+e);}
}
function adRules(kind){let o=adRead(AD_RULES,{});return Array.isArray(o[kind])?o[kind]:[];}

const STORAGE = FM.joinPath(FM.documentsDirectory(), 'rk10-schedules-v1.json');
const ADDRESS = 'РК10';
function pad(n){return String(n).padStart(2,'0');}
function dayKey(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function midnight(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function plusDays(d,n){let x=midnight(d);x.setDate(x.getDate()+n);return x;}
function load(){try {let o=JSON.parse(FM.readString(STORAGE));return o&&typeof o==='object'?o:{schedules:{},incidents:[]};}catch(e){return {schedules:{},incidents:[]};}}
function save(o){FM.writeString(STORAGE,JSON.stringify(o));}
function asStr(x){if(x==null)return ''; if(typeof x==='string')return x;try{return JSON.stringify(x)}catch(e){return String(x)}}
function getInput(){let p=(args.plainTexts||[]).map(asStr).filter(Boolean);if(!p.length&&args.shortcutParameter!=null)p.push(asStr(args.shortcutParameter));return p.join('\n').trim();}
function norm(s){return String(s||'').replace(/\u00a0/g,' ').replace(/[‐‑‒–—−]/g,'-').replace(/\r/g,'').replace(/[ 	]+/g,' ').trim();}
function isRK10(s){return /(?:^|[^\p{L}\p{N}])(?:рк|pk|rk)\s*10(?![\p{L}\p{N}\/])/iu.test(s);}
function groupHeading(line){
  let s=norm(line).replace(/^[🔴🟢🟥🟩⚡✅\s]+/u,'');
  if(s.length>160 || /\d{1,2}:\d{2}|графік|аварі|світл|відключ|застосову|не діють|скасован|ремонт|початок|заверш|год\./iu.test(s))return false;
  return /(?:^|[^\p{L}\p{N}])(?:РК\s*\d+[АA]?|ТР\s*\d+[АA]?|БШ\s*\d+(?:\/\d+)?[АA]?|Т4А)(?!\p{L})/iu.test(s);
}
function parseTime(s){let m=String(s).trim().match(/^(\d{1,2})(?:(?:[:.])(\d{2}))?$/);if(!m)return null;let h=+m[1],mi=+(m[2]||0);return h<=24&&mi<60&&(h!==24||mi===0)?h*60+mi:null;}
function parseRanges(lines,i){
 let ranges=[];
 for(let j=i+1;j<lines.length;j++){
   let z=norm(lines[j]);
   if(groupHeading(z)||/зі світлом\s*:/iu.test(z)||/⚡|аварі|графік на|графік оновлено/iu.test(z))break;
   let m=z.match(/^\s*([🟢🟥🟩🔴✅❌])\s*(\d{1,2}(?:[:.]\d{2})?)\s*(?:-|до)\s*(\d{1,2}(?:[:.]\d{2})?)/u);
   if(!m){if(ranges.length && z && !/^\s*[|•\-]/.test(z))break;continue;}
   let a=parseTime(m[2]),b=parseTime(m[3]);
   if(a==null||b==null||b<=a)break;
   let on=/[🟢🟩✅]/u.test(m[1]);ranges.push({from:a,to:b,on});
 }
 if(!ranges.length)return null;
 // Only accept a full contiguous, explicit 00:00–24:00 schedule. Truncated notifications must not overwrite valid data.
 if(ranges[0].from!==0||ranges[ranges.length-1].to!==1440)return null;
 for(let k=1;k<ranges.length;k++)if(ranges[k].from!==ranges[k-1].to||ranges[k].on===ranges[k-1].on)return null;
 return ranges;
}
const MONTHS={'січня':1,'лютого':2,'березня':3,'квітня':4,'травня':5,'червня':6,'липня':7,'серпня':8,'вересня':9,'жовтня':10,'листопада':11,'грудня':12};
function readScheduleDate(t,received){
 let m=t.match(/(?:графік|розклад)\s+на\s+(сьогодні|завтра)\s*,?\s*(\d{1,2})?\s*([а-яіїєґ]+)/iu);
 if(!m){m=t.match(/(?:графік|розклад)\s+на\s+(сьогодні|завтра)/iu);if(!m)return null;}
 let base=midnight(received), chosen=plusDays(base,m[1].toLowerCase()==='завтра'?1:0);
 if(m[2]&&m[3]&&MONTHS[m[3].toLowerCase()]){
   let month=MONTHS[m[3].toLowerCase()],day=+m[2];
   let y=chosen.getFullYear(),d=new Date(y,month-1,day);
   // Year rollover for end-of-December posts describing early January and vice versa.
   if((d.getTime()-base.getTime())>180*864e5)d=new Date(y-1,month-1,day);
   if((base.getTime()-d.getTime())>180*864e5)d=new Date(y+1,month-1,day);
   if(d.getDate()!==day || d.getMonth()!==month-1)return null;
   return dayKey(d);
 }
 return dayKey(chosen);
}
function findScheduleDate(text,received){return readScheduleDate(norm(text),received);}
function parseSchedules(text,received){
 let starts=[...text.matchAll(/(?:🔄\s*)?(?:📅\s*)?(?:Графік|Розклад)\s+на\s+(?:сьогодні|завтра)/giu)].map(m=>m.index);let chunks=starts.map((at,i)=>text.slice(at,starts[i+1]||text.length));
 let result=[];
 for(let chunk of chunks){let date=findScheduleDate(chunk,received);if(!date)continue;
 let lines=chunk.split('\n');
 for(let i=0;i<lines.length;i++){
   if(!groupHeading(lines[i])||!isRK10(lines[i]))continue;
   let ranges=parseRanges(lines,i);if(ranges)result.push({date,ranges});
 }
 }
 return result;
}
function incidentStatus(text){
 let s=norm(text);
 if(/аварій[а-яіїєґ]*\s+відключенн[а-яіїєґ]*\s+скасован|аварій[а-яіїєґ]*\s+відключенн[а-яіїєґ]*\s+завершен|планов[а-яіїєґ]*\s+графік[а-яіїєґ]*\s+(?:відновлен|діють)/iu.test(s))return 'cancel';
 if(/аварій[а-яіїєґ]*\s+відключенн[а-яіїєґ]*|планов[а-яіїєґ]*\s+графік[а-яіїєґ]*\s+не\s+діють/iu.test(s))return 'active';
 return '';
}
function getIncidentDays(text,received){
 let m=norm(text).match(/(?:графік\s+на\s+)?(сьогодні|завтра)\s*,?\s*(\d{1,2})?\s*([а-яіїєґ]+)?/iu);
 let d=m?readScheduleDate('Графік на '+m[0].replace(/^графік\s+на\s+/iu,''),received):null;
 let base=d?new Date(d+'T00:00:00'):midnight(received);
 let days=[dayKey(base)];
 // Specific cross-midnight outages marked with HH:MM–HH:MM.
 let spans=[...norm(text).matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/gu)];
 if(spans.some(m=>{let a=parseTime(m[1]),b=parseTime(m[2]);return a!==null&&b!==null&&b<a&&b>0;}))days.push(dayKey(plusDays(base,1)));
 return [...new Set(days)];
}
function importText(text,received){
 const db=load();db.schedules=db.schedules||{};db.incidents=db.incidents||[];
 let changed=0,why=[];
 let schedules=parseSchedules(text,received);
 for(let s of schedules){
   let old=db.schedules[s.date];
   // Incoming latest matching message replaces earlier message for same date.
   if(!old||old.received<=received.getTime()){
     db.schedules[s.date]={ranges:s.ranges,received:received.getTime()};changed++;why.push('Графік '+s.date);
   }
 }
 let state=incidentStatus(text);
 // An address-specific DTEK accident may be included at the end of an ordinary schedule message.
 if(!state && /⚡\s*АВАРІЯ\s*ДТЕК/iu.test(text)){let part=text.slice(text.search(/⚡\s*АВАРІЯ\s*ДТЕК/iu));if(isRK10(part))state='active';}
 if(state){
   // Avoid an irrelevant house's incident affecting RK10, but allow globally announced warnings.
   let hasAddress=/\b(?:РК|ТР|БШ|Т4А)\s*\d/iu.test(text);
   if(!hasAddress || isRK10(text)){
     let days=getIncidentDays(text,received);
     for(let d of days){
       db.incidents=db.incidents.filter(x=>x.date!==d);
       db.incidents.push({date:d,status:state,received:received.getTime()});changed++;
     }
     why.push(state==='active'?'Аварійний режим':'Аварію скасовано');
   }
 }
 // Keep recent dates only.
 const cutoff=dayKey(plusDays(received,-10));
 for(let d of Object.keys(db.schedules))if(d<cutoff)delete db.schedules[d];
 db.incidents=db.incidents.filter(x=>x.date>=cutoff);
 if(changed)save(db);
 return {changed,why,schedules:schedules.length,incident:state};
}

function adCheckInput(text,result){
  const t=adNorm(text);
  if(!isRK10(t))return;
  // "Планові графіки не діють" is an emergency notice, NOT a schedule.
  // Only posts explicitly announcing a schedule for today/tomorrow qualify.
  const scheduleHeader=/(?:графік|розклад)\s+на\s+(?:сьогодні|завтра)/iu.test(t);
  const emergency=/(?:аварій[а-яіїєґ]*\s+відключенн|аварі[яїієґ]|аварійн|планов[а-яіїєґ]*\s+графік[а-яіїєґ]*\s+не\s+діють|⚡\s*аварія\s*дтек)/iu.test(t);
  if(scheduleHeader && result.schedules===0){
    adAlert('schedule',text,'Не вдалося прочитати повний плановий графік РК10');
  } else if(emergency && !result.incident){
    adAlert('incident',text,'Не вдалося визначити аварійне повідомлення РК10');
  }
}
// Telegram notification trigger fires for every message from the ЖК channel.
// A status message is handled by "Світло вдома", not by this schedule importer.
// Skip all unrelated notifications BEFORE touching schedule files or opening dialogs.
function isImporterMessage(text){
 const t=norm(text);
 const isSchedule=/(?:графік|розклад)\s+на\s+(?:сьогодні|завтра)/iu.test(t);
 const isIncident=/(?:аварійн[а-яіїєґ]*\s+відключенн|аварі[яїієґ]|аварія\s+дтек|планов[а-яіїєґ]*\s+графік[а-яіїєґ]*\s+не\s+діють)/iu.test(t);
 return isSchedule || isIncident;
}
function importError(e,input){
 const msg=String(e && (e.stack||e.message)||e).slice(0,1500);
 try {
   let log=adRead(AD_LOG,[]);if(!Array.isArray(log))log=[];
   log.push({at:Date.now(),kind:'import_error',reason:msg,preview:String(input).slice(0,500)});
   adWrite(AD_LOG,log.slice(-200));
 }catch(_){}
 try { adAlert('import_error',input,'Помилка імпорту графіка: '+msg.slice(0,130)); }catch(_){}
 console.log('РК10 імпорт: '+msg);
}
const input=getInput();
try {
 if(config.runsWithSiri){
   if(!input || !isImporterMessage(input)){
     // Normal state switch (e.g. "Увімкнулось: #РК10") or unrelated ЖК post.
     Script.setShortcutOutput('Пропущено: це не графік і не аварійне повідомлення');
   }else{
     const result=importText(input,new Date());
     adCheckInput(input,result);
     Script.setShortcutOutput(result.changed?'Збережено: '+result.why.join(', '):'Повного графіка РК10 в повідомленні немає');
   }
 }else{
   // Preserve the original interactive Scriptable mode for manual import.
if(input){let r=importText(input,new Date());adCheckInput(input,r);{let a=new Alert();a.title=r.changed?'Дані оновлено':'Не імпортовано';a.message=r.changed?r.why.join('\n'):'Перевір повний текст повідомлення та наявність РК10';a.addAction('ОК');await a.present();}}
else if(!config.runsInWidget){let a=new Alert();a.title='Імпорт графіка РК10';a.message='Скопіюй ПОВНЕ повідомлення з Telegram, потім натисни «Вставити». Автоматизація може також передавати Основний текст сповіщення в Texts.';a.addAction('Вставити');a.addCancelAction('Скасувати');if((await a.present())===0){let pasted=Pasteboard.pasteString();if(pasted){let r=importText(pasted,new Date());adCheckInput(pasted,r);let b=new Alert();b.title=r.changed?'Дані оновлено':'Немає повного графіка РК10';b.message=r.why.join('\n')||'Скопійоване повідомлення неповне або не містить потрібного блоку.';b.addAction('Гаразд');await b.present();}}}
 }
}catch(e){
 // Do not allow a parser/storage error to crash a Shortcuts notification automation.
 importError(e,input);
 if(config.runsWithSiri){try{Script.setShortcutOutput('Помилка імпорту записана в журнал РК10');}catch(_){}}
 else {const a=new Alert();a.title='Помилка імпорту';a.message=String(e);a.addAction('ОК');await a.present();}
}

Script.complete();
