// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: magic;
// Scriptable — Світло вдома. Works with Shortcuts > Run Script > Texts.
const fm = FileManager.local();
const dir = fm.documentsDirectory();
const stateFile = fm.joinPath(dir, 'light-home.json');
const historyFile = fm.joinPath(dir, 'light-history.json');
const now = Date.now();
const fmAD=fm;

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

let s = {status:'unknown',since:null,lastOutage:null,lastSeen:null};
if (fm.fileExists(stateFile)) {
  try { s = {...s,...JSON.parse(fm.readString(stateFile))}; } catch (_) {}
}
let history = [];
if (fm.fileExists(historyFile)) {
  try { const value = JSON.parse(fm.readString(historyFile)); if(Array.isArray(value)) history=value; } catch (_) {}
}
history = history.filter(e=>e && (e.status==='on'||e.status==='off') && Number.isFinite(e.at))
  .sort((a,b)=>a.at-b.at);
function dur(ms) {
  const n=Math.max(0,Math.floor(ms/60000));
  const d=Math.floor(n/1440),h=Math.floor(n%1440/60),m=n%60;
  return (d?d+' дн ':'')+(h?h+' год ':'')+m+' хв';
}
function clock(t) {return new Date(t).toLocaleTimeString('uk-UA',{hour:'2-digit',minute:'2-digit'});}
const rk10=/#?\s*[РP][КK]\s*10(?![\p{L}\p{N}])/iu;
function reportedStart(line,received) {
  // When a bot supplies its own duration, its time is more reliable than notification arrival.
  const d=line.match(/(\d+)\s*дн/iu),h=line.match(/(\d+)\s*год/iu),m=line.match(/(\d+)\s*хв/iu);
  if(d||h||m) return received-((d?+d[1]*1440:0)+(h?+h[1]*60:0)+(m?+m[1]:0))*60000;
  const time=line.match(/з\s+(\d{1,2}):(\d{2})/iu);
  if(time) {let t=new Date(received);t.setHours(+time[1],+time[2],0,0);if(t.getTime()>received)t.setDate(t.getDate()-1);return t.getTime();}
  return received;
}
function record(next,at) {
  // No historical baseline is invented from the previously tested widget status.
  const last=history[history.length-1];
  if(!last || last.status!==next) {
    history.push({status:next,at});
  } else if(next==='off' && at<last.at-120000) {
    // A later factual report can move the start of the SAME ongoing outage backwards.
    // Do not move it before an already recorded preceding ON event.
    const prev=history[history.length-2];
    last.at=Math.max(at,prev?prev.at+1000:at);
  }
  // Keep up to 90 days + last preceding state, so intervals across the cutoff remain calculable.
  const cutoff=Date.now()-90*86400000;
  const first=history.findIndex(e=>e.at>=cutoff);
  if(first>1) history=history.slice(first-1);
  fm.writeString(historyFile,JSON.stringify(history));
}
function update(next,start,received,hasReportedStart=false) {
  const firstRecordedEvent=history.length===0;
  const old=s.status;
  const effectiveStart=next==='off'&&hasReportedStart ? start : received;
  if(next!==old) {
    if(old==='off'&&s.since) s.lastOutage=Math.max(0,received-s.since);
    s.status=next;
    s.since=next==='off'?effectiveStart:received;
  } else if(firstRecordedEvent) {
    // Previous status may have been created by manual tests. Start fresh on first REAL event.
    s.since=effectiveStart;
  } else if(next==='off'&&hasReportedStart&&(!s.since||effectiveStart<s.since-120000)) {
    s.since=effectiveStart;
  }
  s.lastSeen=received;
  record(next,effectiveStart);
}
function parseMessage(message) {
  const received=Date.now();
  const lines=message.replace(/\r/g,'\n').split('\n').map(x=>x.trim());
  // Switch announcements; each address list may wrap onto the next line.
  for(let i=0;i<lines.length;i++) {
    const match=lines[i].match(/(увімкнулось|вимкнулось)\s*:/iu);
    if(!match)continue;
    let addresses=lines[i].slice(lines[i].indexOf(':')+1);
    let j=i+1;
    while(j<lines.length&&/^[,\s#]*[РP][КKБBТT]/iu.test(lines[j].replace(/^[^\p{L}#]*/u,''))) {
      addresses+=' '+lines[j];j++;
    }
    if(rk10.test(addresses)) {
      const on=match[1].toLowerCase()==='увімкнулось';
      update(on?'on':'off',received,received,false);
      return true;
    }
  }
  if(/графік на|аварійні відключення|планові графіки/iu.test(message)
     && !/не робе|поки робе/iu.test(message))return false;
  for(const line of lines) {
    if(!rk10.test(line))continue;
    if(/нема(?:є)? світла|без світла|не робе/iu.test(line)) {
      const hasTime=/\d+\s*(?:дн|год|хв)|з\s+\d{1,2}:\d{2}/iu.test(line);
      update('off',reportedStart(line,received),received,hasTime);return true;
    }
    if(/поки робе|поки працює|є світло|світло є/iu.test(line)) {
      update('on',received,received,false);return true;
    }
  }
  // Approved user-taught phrases; only on a line explicitly mentioning RK10.
  for(const line of lines){
    if(!rk10.test(line))continue;
    const normalized=adNorm(line);
    for(const rule of adRules('status')){
      if(!rule||typeof rule.phrase!=='string'||rule.phrase.length<5)continue;
      if(normalized.includes(adNorm(rule.phrase))){
        update(rule.value,received,received,false);return true;
      }
    }
    // Conservative dictionary of common alternative announcements.
    const off=/знеструмлен|немає (?:електро)?живлення|відсутн[єя] електропостачання|електропостачання припинен|напруг[аи] відсутн|живлення відключено/iu;
    const on=/електропостачання відновлен|подачу (?:електро)?енергії відновлен|електроживлення відновлен|напруг[ау] подано|заживлен|живлення відновлено/iu;
    if(off.test(line) && !on.test(line)){update('off',received,received,false);return true;}
    if(on.test(line) && !off.test(line)){update('on',received,received,false);return true;}
  }
  return false;
}
// Diagnostics: an alert only when an incoming message LOOKS like a status
// for RK10 but none of the supported formats can be parsed.
const diagnosticFile=fm.joinPath(dir,'light-unrecognized.json');
const diagnosticLogFile=fm.joinPath(dir,'light-unrecognized-log.json');
function probableStatusMessage(message) {
  const t=String(message);
  if(!rk10.test(t))return false;
  // Published timetables are NOT real-time switch events.
  if(/графік на|графік відключень|аварійні відключення|планові графіки/iu.test(t)
    && !/увімкнулось\s*:|вимкнулось\s*:|немає світла|нема світла|поки робе|поки працює/iu.test(t))return false;
  return /світл|електр|увімк|вимк|напруг|знеструм|живлен|не роб|працю|🔴|🟢|⚡|струм|енерг/iu.test(t);
}
function saveUnrecognized(raw) {
  const received=Date.now();
  const message=String(raw).slice(0,5000);
  const item={at:received,message};
  let log=[];
  if(fm.fileExists(diagnosticLogFile)) {
    try { const data=JSON.parse(fm.readString(diagnosticLogFile));if(Array.isArray(data))log=data; }catch(_){}
  }
  const same=log.length>0&&log[log.length-1].message===message&&received-log[log.length-1].at<30*60000;
  if(!same) {
    log.push(item);
    fm.writeString(diagnosticLogFile,JSON.stringify(log.slice(-50)));
  }
  fm.writeString(diagnosticFile,JSON.stringify({at:received,message,warning:'Не розпізнано формат статусу РК10'}));
  if(!same) {
    // Local notification: best effort; requires notifications enabled for Scriptable.
    try {
      const n=new Notification();
      n.title='⚠️ РК10: не розпізнано статус світла';
      n.body='Перевір повідомлення Telegram. Статус світла НЕ змінено. Текст записано в light-unrecognized-log.json.';
      n.sound='default';
      // Do not block Shortcuts automation on notification permission problems.
      n.schedule().catch(e=>console.log('Сповіщення Scriptable: '+e));
    } catch(e) {console.log('Сповіщення Scriptable: '+e);}
  }
  return !same;
}
function statusText() {
  if(s.status==='unknown') return 'Немає даних про світло';
  const result=[s.status==='on'?'Є світло':'Немає світла'];
  if(s.status==='off'&&s.since)result.push('Вже '+dur(Date.now()-s.since));
  else if(s.lastOutage!=null)result.push('Не було '+dur(s.lastOutage));
  if(s.since)result.push((s.status==='on'?'Відновлено ':'Вимкнено ')+clock(s.since));
  if(s.lastSeen)result.push('Останнє повідомлення '+clock(s.lastSeen));
  return result.join('\n');
}
const input=(args.plainTexts&&args.plainTexts.length?args.plainTexts[0]:null)??args.shortcutParameter;
if(input!==null&&input!==undefined&&String(input).trim()!=='') {
  let warningOutput=null;
  if(String(input).trim()!=='STATUS') {
    const raw=String(input);
    const recognized=parseMessage(raw);
    // Preserve normal successful update behavior.
    if(recognized) fm.writeString(stateFile,JSON.stringify(s));
    else if(probableStatusMessage(raw)) {
      adAlert('status',raw,'Не розпізнано статус світла');
      warningOutput='⚠️ НЕ РОЗПІЗНАНО СТАТУС РК10. Перевір Telegram.\n'+raw.slice(0,350);
    }
  }
  Script.setShortcutOutput(warningOutput||statusText());
  Script.complete();
} else {
  const w=new ListWidget();w.backgroundColor=new Color('#000000');w.setPadding(15,15,15,15);
  const on=s.status==='on',off=s.status==='off';
  const color=new Color(on?'#22C55E':off?'#EF4444':'#A3A3A3');
  const row=w.addStack();row.centerAlignContent();
  const sym=SFSymbol.named(on?'bolt.fill':'bolt.slash.fill');
  const icon=row.addImage(sym.image);icon.imageSize=new Size(20,20);icon.tintColor=color;
  row.addSpacer(9);
  const name=row.addText('Світло вдома');name.font=Font.boldSystemFont(15);name.textColor=Color.white();name.lineLimit=1;name.minimumScaleFactor=0.75;
  w.addSpacer(16);
  const title=w.addText(on?'Є світло':off?'Немає світла':'Немає даних');
  title.font=Font.boldSystemFont(off?20:24);title.textColor=color;title.lineLimit=1;title.minimumScaleFactor=0.7;
  w.addSpacer(8);
  let detail='Очікуємо повідомлення';
  if(off&&s.since)detail='Вже '+dur(Date.now()-s.since);
  else if(on&&s.lastOutage!==null)detail='Не було '+dur(s.lastOutage);
  else if(on)detail='Світло працює';
  const txt=w.addText(detail);txt.font=Font.systemFont(12);txt.textColor=Color.white();txt.lineLimit=1;txt.minimumScaleFactor=0.7;
  w.addSpacer(5);
  const foot=w.addText(s.since?(on?'Відновлено о ':'Вимкнено о ')+clock(s.since):'Статус невідомий');
  foot.font=Font.systemFont(10);foot.textColor=new Color('#A3A3A3');foot.lineLimit=1;
  if(s.lastSeen) {
    w.addSpacer(3);const stale=Date.now()-s.lastSeen>3600000;
    const last=w.addText((stale?'⚠ ':'')+'Дані: '+clock(s.lastSeen));
    last.font=Font.systemFont(9);last.textColor=new Color(stale?'#FBBF24':'#A3A3A3');last.lineLimit=1;
  }
  w.refreshAfterDate=new Date(Date.now()+60000);
  Script.setWidget(w);
  if(config.runsInApp)await w.presentSmall();
  Script.complete();
}
