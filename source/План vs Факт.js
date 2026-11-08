// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: red; icon-glyph: magic;
// РК10 · План vs Факт — LARGE, компактна версія з читабельними підписами
// Лише читає rk10-schedules-v1.json та light-history.json.
// Не змінює графіки, історію чи інші віджети.
const fm = FileManager.local();
const root = fm.documentsDirectory();
const now = Date.now();
const PLAN = fm.joinPath(root, 'rk10-schedules-v1.json');
const FACT = fm.joinPath(root, 'light-history.json');
const colors = {bg:'#090909', white:'#FFFFFF', muted:'#A3A3A3',green:'#4ADE80',red:'#F87171',yellow:'#EAB308',line:'#444444',tile:'#181818',gray:'#303030'};
const color = x => new Color(colors[x] || x);
function load(file) {try {return fm.fileExists(file) ? JSON.parse(fm.readString(file)) : null;} catch(e) {console.log('Помилка JSON: '+e);return null;}}
function pad(n) {return String(n).padStart(2,'0');}
function key(d) {return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
function dayStart(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();}
function addDay(d,n){const a = new Date(dayStart(d));a.setDate(a.getDate()+n);return a;}
function hm(ts){const d=new Date(ts);return `${pad(d.getHours())}:${pad(d.getMinutes())}`;}
function duration(ms){const m=Math.floor(Math.max(0,ms)/60000);return m>=60 ? `${Math.floor(m/60)} год ${m%60} хв` : `${m} хв`;}
function shortDuration(ms){const m=Math.floor(Math.max(0,ms)/60000);return m>=60 ? `${Math.floor(m/60)} год ${m%60} хв` : `${m} хв`;}
function validRanges(a){if(!Array.isArray(a)||!a.length||a[0].from!==0||a[a.length-1].to!==1440)return false;
  return a.every((r,i)=>Number.isInteger(r.from)&&Number.isInteger(r.to)&&r.to>r.from&&r.from>=0&&r.to<=1440&&typeof r.on==='boolean'&&(!i||(r.from===a[i-1].to&&r.on!==a[i-1].on)));}
// Data-quality monitor: read-only, no modifications to source files.
function warnData(reason){
 const p=fm.joinPath(root,'rk10-plan-fact-data-warnings.json');let x={};try{x=JSON.parse(fm.readString(p))}catch(_){}
 const t=Date.now(),key=reason;if(t-(x[key]||0)<24*3600000)return;
 x[key]=t;fm.writeString(p,JSON.stringify(x));
 try{let n=new Notification();n.title='⚠️ РК10 · Помилка статистики';n.body=reason+' · Дані не змінено.';let v=n.schedule();if(v&&v.catch)v.catch(e=>console.log(String(e)));}catch(e){console.log(String(e));}
}
const db = load(PLAN);const history = load(FACT);
const schedules = db && db.schedules && typeof db.schedules==='object' ? db.schedules : {};
if(fm.fileExists(PLAN) && (!db || typeof db!=='object'||!db.schedules||typeof db.schedules!=='object'))warnData('Пошкоджено файл графіків');
if(fm.fileExists(FACT) && !Array.isArray(history))warnData('Пошкоджено історію світла');
if(db && db.schedules && Object.values(db.schedules).some(v=>v&&!validRanges(v.ranges)))warnData('Некоректні інтервали графіка');
if(Array.isArray(history) && history.some(e=>!e||!['on','off'].includes(e.status)||!Number.isFinite(e.at)))warnData('Некоректні події в історії');
const rawEvents = Array.isArray(history) ? history : [];
const events = rawEvents.filter(e=>e&&(e.status==='on'||e.status==='off')&&Number.isFinite(e.at)&&e.at<=now)
 .map(e=>({at:e.at,on:e.status==='on'})).sort((a,b)=>a.at-b.at);
// Для дублікатів одного часу беремо останню подію.
const unique=[];for(const ev of events){if(unique.length&&unique[unique.length-1].at===ev.at)unique[unique.length-1]=ev;else unique.push(ev);}
function compare(date){
 const start=dayStart(date),end=Math.min(dayStart(addDay(date,1)),now),s=schedules[key(date)];
 if(end<=start||!s||!validRanges(s.ranges))return null;
 const plans=s.ranges.map(r=>({a:new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,r.from).getTime(),b:new Date(date.getFullYear(),date.getMonth(),date.getDate(),0,r.to).getTime(),on:r.on}));
 // Стан до першої події не встановлюємо. Стан після події триває до наступної події/теперішнього моменту.
 const facts=[];
 for(let i=0;i<unique.length;i++){
  const a=Math.max(start,unique[i].at),b=Math.min(end,i+1<unique.length?unique[i+1].at:now);
  if(b>a)facts.push({a,b,on:unique[i].on});
 }
 let covered=0,match=0,extra=0,missed=0;
 for(const f of facts)for(const p of plans){const a=Math.max(f.a,p.a,start),b=Math.min(f.b,p.b,end);if(b<=a)continue;
  const span=b-a;covered+=span;if(p.on===f.on)match+=span;else if(f.on)extra+=span;else missed+=span;
 }
 const changes=plans.slice(1).map(p=>({at:p.a,on:p.on}));
 const candidates=unique.filter(e=>e.at>=start&&e.at<end);
 const pairs=[];const used=new Set();const unmatched=[];
 for(const ev of candidates){let best=-1,dist=Infinity;
  changes.forEach((p,i)=>{const gap=Math.abs(ev.at-p.at);if(p.on===ev.on&&!used.has(i)&&gap<=3*3600000&&gap<dist){best=i;dist=gap;}});
  if(best>=0){used.add(best);pairs.push({at:ev.at,planned:changes[best].at,on:ev.on,delta:Math.round((ev.at-changes[best].at)/60000)});}else unmatched.push(ev);
 }
 return {date,start,end,covered,match,extra,missed,pairs,unmatched,notObserved:changes.filter((c,i)=>!used.has(i)),accuracy:covered?Math.round(match/covered*100):null,coverage:Math.round(covered/(end-start)*100)};
}
const today=new Date();const series=[];for(let i=6;i>=0;i--){const d=addDay(today,-i);series.push({date:d,day:['Нд','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()],data:compare(d)});}
const available=series.filter(s=>s.data&&s.data.covered>0);
const selected=available.length?available[available.length-1].data:null;
const ranked=selected?[...selected.pairs].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)||a.planned-b.planned):[];
const recent=ranked.slice(0,2);
const more=Math.max(0,ranked.length-2);


// UI: компактний Large — точність + баланс, два відхилення, 7 днів.
function UIcolor(v){return new Color(({bg:'#090909',white:'#FFFFFF',muted:'#A3A3A3',green:'#4ADE80',red:'#F87171',yellow:'#EAB308',gray:'#303030',tile:'#1B1B1B',line:'#444444'})[v]||v);}
function textUI(p,value,size=12,tone='white',bold=false){let t=p.addText(String(value));t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);t.textColor=UIcolor(tone);t.lineLimit=1;t.minimumScaleFactor=0.77;return t;}
function hrow(p){let s=p.addStack();s.layoutHorizontally();s.centerAlignContent();return s;}
function space(p,n){p.addSpacer(n);}
function rule(p,width){let d=p.addStack();d.size=new Size(width,1);d.backgroundColor=UIcolor('line');}
function balanceMs(v){if(v===null)return '—';const m=Math.round(Math.abs(v)/60000),sign=v<0?'−':v>0?'+':'';return sign+(m>=60?Math.floor(m/60)+' год '+m%60+' хв':m+' хв');}
function balSmall(ms){if(ms===null)return '—';const m=Math.round(Math.abs(ms)/60000);return (ms>0?'+':ms<0?'−':'')+(m>=60?Math.floor(m/60)+':'+pad(m%60):m+'хв');}
function balanceTone(ms){return ms>0?'green':ms<0?'red':'white';}
function pctTone(accuracy){return accuracy===null?'white':accuracy>=85?'green':accuracy>=70?'yellow':'red';}
const chosenBalance=selected?selected.extra-selected.missed:null;
const screenW=Device.screenSize().width,innerW=screenW-48-28;
const widget=new ListWidget();widget.backgroundColor=UIcolor('bg');widget.setPadding(11,14,10,14);
const heading=hrow(widget);textUI(heading,'◫',16,'yellow',true);heading.addSpacer(6);textUI(heading,'План vs Факт',17,'white',true);heading.addSpacer();textUI(heading,selected?`РК10 · ${pad(selected.date.getDate())}.${pad(selected.date.getMonth()+1)}`:'РК10 · 7 днів',10.5,'muted');
space(widget,8);
const top=hrow(widget);const upperTileW=(innerW-8)/2;
function statTile(parent,title,value,tone,note){let st=parent.addStack();st.layoutVertically();st.size=new Size(upperTileW,0);st.backgroundColor=UIcolor('tile');st.cornerRadius=10;st.setPadding(8,8,7,8);textUI(st,title,11,'muted');space(st,3);textUI(st,value,20,tone,true);space(st,2);textUI(st,note,9.5,'muted');return st;}
statTile(top,'Баланс світла',balanceMs(chosenBalance),chosenBalance===null?'white':balanceTone(chosenBalance),'за підтверджений час');top.addSpacer(8);
statTile(top,'Точність графіка',selected?selected.accuracy+'%':'—',selected?pctTone(selected.accuracy):'white','збіг плану й факту');
space(widget,7);
const totals=hrow(widget);
function miniTile(parent,label,v,tone){let st=parent.addStack();st.layoutVertically();st.size=new Size(upperTileW,0);st.backgroundColor=UIcolor('tile');st.cornerRadius=9;st.setPadding(6,8,6,8);textUI(st,label,10.5,'muted');space(st,2);textUI(st,selected?(tone==='green'?'+':'−')+shortDuration(v):'—',13,tone,true);return st;}
miniTile(totals,'⊕ Додаткове світло',selected?selected.extra:0,'green');totals.addSpacer(8);miniTile(totals,'⊖ Недоотримане',selected?selected.missed:0,'red');
space(widget,8);rule(widget,innerW);space(widget,7);
const deviations=hrow(widget);textUI(deviations,'Відхилення перемикань',12,'white',true);deviations.addSpacer();textUI(deviations,selected?(more?'Ще '+more+' · натисни':'Натисни'):'Немає даних',10.5,'muted');space(widget,5);
for(let i=0;i<2;i++){let p=recent[i];let r=hrow(widget);textUI(r,p?(p.on?'Увімкнення':'Вимкнення')+' о '+hm(p.planned):'—',11,p?'white':'muted');r.addSpacer();let good=p&&((p.on&&p.delta<0)||(!p.on&&p.delta>0));textUI(r,p?(p.delta===0?'вчасно':(p.delta<0?'−':'+')+Math.abs(p.delta)+' хв'):'—',11,p?(p.delta===0||good?'green':'red'):'muted',true);if(i===0)space(widget,3);}
space(widget,8);rule(widget,innerW);space(widget,7);
const weekly=hrow(widget);textUI(weekly,'Останні 7 днів',12,'white',true);weekly.addSpacer();textUI(weekly,'Точність / баланс',10.5,'muted');space(widget,6);
const bars=hrow(widget),barGap=4,cellW=Math.floor((innerW-6*barGap)/7),barH=44;
for(let i=0;i<series.length;i++){
 const d=series[i],a=d.data&&d.data.covered>0?d.data:null;
 const cell=bars.addStack();cell.layoutVertically();cell.size=new Size(cellW,77);
 const label=textUI(cell,d.day,10,'muted');label.centerAlignText();space(cell,3);
 let area=cell.addStack();area.layoutVertically();area.size=new Size(cellW,barH);
 area.backgroundColor=UIcolor('gray');area.cornerRadius=4;
 if(a){const fillHeight=Math.max(4,barH*a.accuracy/100);area.addSpacer(barH-fillHeight);
 const fill=area.addStack();fill.layoutVertically();fill.size=new Size(cellW,fillHeight);fill.cornerRadius=4;fill.backgroundColor=UIcolor(balanceTone(a.extra-a.missed));
 // Баланс пишемо всередині кольорового стовпчика, якщо вміщається.
 if(fillHeight>=15){fill.addSpacer();const centered=fill.addStack();centered.layoutHorizontally();centered.size=new Size(cellW,12);centered.addSpacer();let n=textUI(centered,balSmall(a.extra-a.missed),8,(a.extra-a.missed)>0?'#101418':'white',true);n.lineLimit=1;n.minimumScaleFactor=0.75;centered.addSpacer();fill.addSpacer();}}
 space(cell,3);const pctRow=cell.addStack();pctRow.layoutHorizontally();pctRow.size=new Size(cellW,12);pctRow.addSpacer();const percent=textUI(pctRow,a?a.accuracy+'%':'—',10,'white');percent.lineLimit=1;pctRow.addSpacer();
 if(i<series.length-1)bars.addSpacer(barGap);
}
space(widget,5);textUI(widget,selected?'Перевірено: '+duration(selected.covered)+' із 24 год':'Очікуємо план та історію перемикань',10.5,'muted');
widget.url='scriptable:///run?scriptName='+encodeURIComponent(Script.name());
Script.setWidget(widget);

function escapeHTML(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fullDayHTML(item){const d=item.data;
 const label=`${pad(item.date.getDate())}.${pad(item.date.getMonth()+1)}.${item.date.getFullYear()}`;
 if(!d||!d.covered)return `<section><h2>${label}</h2><p class="muted">Немає спільних підтверджених даних плану й факту.</p></section>`;
 let list=[...d.pairs].sort((a,b)=>a.planned-b.planned);
 let events=list.map(p=>{const good=p.delta===0||(p.on&&p.delta<0)||(!p.on&&p.delta>0);
 return `<div class="event"><div>${p.on?'Увімкнення':'Вимкнення'} <b>${hm(p.planned)}</b><small>Фактично: ${hm(p.at)}</small></div><b class="${good?'green':'red'}">${p.delta===0?'вчасно':(p.delta<0?'раніше':'пізніше')+' на '+Math.abs(p.delta)+' хв'}</b></div>`;}).join('');
 if(!events)events='<p class="muted">Підтверджених пар перемикань немає.</p>';
 if(d.unmatched.length)events+='<h3>Події без планової пари</h3>'+d.unmatched.map(e=>`<div class="event">${e.on?'Увімкнення':'Вимкнення'} ${hm(e.at)} <small>без пари</small></div>`).join('');
 return `<section><h2>${label}</h2>${cardHTML({accuracy:d.accuracy,extra:d.extra,missed:d.missed,covered:d.covered})}<h3>Усі перемикання (${list.length})</h3>${events}<p class="muted">Відхилення перемикань — лише підтверджені пари. Баланс враховує всі підтверджені хвилини.</p></section>`;
}
function monthDate(anchor,offset){return new Date(anchor.getFullYear(),anchor.getMonth()+offset,1);}
function summaryFor(items){let covered=0,match=0,extra=0,missed=0,elapsed=0,plannedDays=0,observedDays=0;
 for(let item of items){const d=item.data;if(!d)continue;plannedDays++;if(d.covered)observedDays++;covered+=d.covered;match+=d.match;extra+=d.extra;missed+=d.missed;elapsed+=Math.max(0,d.end-d.start);}
 return {covered,match,extra,missed,elapsed,plannedDays,observedDays,accuracy:covered?Math.round(100*match/covered):null};}
function compactDay(item){let d=item.data;return {date:key(item.date),day:item.date.getDate(),weekday:item.date.getDay(),covered:d?d.covered:0,accuracy:d&&d.covered?d.accuracy:null,balance:d&&d.covered?d.extra-d.missed:null,html:fullDayHTML(item)};}
function reportMonth(date){let first=new Date(date.getFullYear(),date.getMonth(),1),total=new Date(first.getFullYear(),first.getMonth()+1,0).getDate(),days=[];
 for(let i=1;i<=total;i++){let d=new Date(first.getFullYear(),first.getMonth(),i);days.push({date:d,data:compare(d)});}
 return {id:key(first),title:first.toLocaleDateString('uk-UA',{month:'long',year:'numeric'}),days:days.map(compactDay),summary:summaryFor(days)};}
function cardHTML(s){if(!s||!s.covered)return '<p class="muted">Недостатньо даних для підрахунку.</p>';
 let bal=s.extra-s.missed;
 return `<div class="stats"><div><small>Баланс світла</small><strong class="${bal>0?'green':bal<0?'red':''}">${bal>0?'+':bal<0?'−':'±'}${duration(Math.abs(bal))}</strong></div><div><small>Точність графіка</small><strong>${s.accuracy}%</strong></div><div><small>Додаткове світло</small><strong class="green">+${duration(s.extra)}</strong></div><div><small>Недоотримане</small><strong class="red">−${duration(s.missed)}</strong></div></div><p class="fine">Перевірено: ${duration(s.covered)}. Невідомі періоди не враховано.</p>`;}
async function showReport(){let months=[];for(let i=-11;i<=0;i++)months.push(reportMonth(monthDate(today,i)));
 let all={months,week:series.map(compactDay),weekSummary:summaryFor(series),today:key(today)};
 let safe=JSON.stringify(all).replace(/</g,'\\u003c').replace(/&/g,'\\u0026');
 const html=`<!doctype html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>
 :root{color-scheme:dark}*{box-sizing:border-box}body{font:-apple-system-body;background:#090909;color:#fff;margin:0;padding:18px 15px 44px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}h1{font-size:23px;margin:0 0 13px}h2{font-size:19px;margin:3px 0 14px}h3{font-size:16px;margin:18px 0 9px}small,.muted{color:#a3a3a3;font-size:13px}section{margin-top:13px;background:#151515;border:1px solid #343434;border-radius:16px;padding:14px}.stats{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.stats>div{background:#252525;padding:11px 9px;border-radius:11px;min-width:0}.stats strong{font-size:20px;display:block;margin-top:6px;overflow-wrap:anywhere}.green{color:#4ade80!important}.red{color:#f87171!important}.fine{font-size:12px;color:#aaa;line-height:1.5}.event{border-top:1px solid #383838;display:flex;justify-content:space-between;align-items:flex-start;gap:9px;padding:12px 0;font-size:14px}.event b{font-size:13px}.event small{display:block;margin-top:3px}.tabs{background:#292929;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:12px}.tab{background:transparent;color:#aaa;border:0;border-radius:9px;padding:10px 0;font-size:14px}.tab.active{background:#575757;color:white;font-weight:700}.hidden{display:none}.nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0 8px}.nav button{background:#292929;color:#fff;border:0;border-radius:8px;min-width:34px;height:34px;font-size:23px}.nav button:disabled{opacity:.3}.nav strong{font-size:17px;text-transform:capitalize}.bars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin:14px 0 6px}.column{text-align:center;min-width:0;font-size:11px;color:#aaa}.outer{height:92px;background:#292929;position:relative;border-radius:6px;margin:7px 0;overflow:hidden}.fill{position:absolute;bottom:0;width:100%;border-radius:5px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px}.fill.pos{background:#26794d}.fill.neg{background:#a33f46}.fill.zero{background:#555}.inside{color:white;font-size:10px;font-weight:700;white-space:nowrap}.pct{font-weight:700;color:white;font-size:11px}.dayrow{display:grid;grid-template-columns:62px minmax(0,1fr) 38px 92px;gap:6px;padding:9px 0;border-bottom:1px solid #303030;align-items:center;font-size:12px}.track{height:9px;background:#363636;border-radius:8px;overflow:hidden}.track div{height:100%;background:#4ade80;border-radius:8px}.money{text-align:right;font-size:11px;font-weight:600}.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.weekdays{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;color:#aaa;font-size:11px;margin:12px 0 7px}.calday{background:#292929;border:0;border-radius:8px;min-height:55px;color:#ddd;font-size:12px;padding:4px 2px;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center}.calday .bal{font-size:9px;font-weight:700}.calday.pos{background:#173b28}.calday.neg{background:#442528}.calday.zero{background:#333}.calday:active{outline:1px solid white}.summarycard{margin-top:13px}.tip{border-radius:11px;background:#202820;color:#cdd8ce;padding:11px;font-size:12px;line-height:1.5;margin-top:12px}
 </style></head><body><h1>План vs Факт · РК10</h1><div class="tabs"><button class="tab active" data-v="day">День</button><button class="tab" data-v="week">Тиждень</button><button class="tab" data-v="month">Місяць</button></div>
 <div id="day"><div class="nav"><button id="dayPrev">‹</button><strong id="dayTitle"></strong><button id="dayNext">›</button></div><div id="dayBody"></div></div>
 <div id="week" class="hidden"><section><h2>Останні 7 днів</h2><div id="weekStats"></div><h3>Точність (%) і баланс (год:хв)</h3><div id="weekChart"></div><h3>Деталізація за днями</h3><div id="weekRows"></div></section></div>
 <div id="month" class="hidden"><section><div class="nav"><button id="monthPrev">‹</button><strong id="monthTitle"></strong><button id="monthNext">›</button></div><div id="monthStats"></div><div class="nav"><h3>Календар</h3></div><div class="weekdays"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Нд</span></div><div class="calendar" id="calendar"></div></section></div>
 <script>const DATA=${safe};const $=id=>document.getElementById(id);const days=DATA.months.flatMap(m=>m.days),byDate=Object.fromEntries(days.map(d=>[d.date,d]));let dayKey=DATA.today,monthIndex=DATA.months.length-1;
 function dur(ms){const m=Math.round(Math.abs(ms)/60000);return m>=60?Math.floor(m/60)+' год '+(m%60)+' хв':m+' хв'}
 function signed(ms){if(ms==null)return '—';return (ms<0?'−':ms>0?'+':'')+dur(ms)}
 function short(ms){if(ms==null)return '—';const m=Math.round(Math.abs(ms)/60000);return (ms<0?'−':ms>0?'+':'')+(m>=60?Math.floor(m/60)+':'+String(m%60).padStart(2,'0'):m+'хв')}
 function dayLabel(v){const a=v.split('-');return a[2]+'.'+a[1]+'.'+a[0]}
 function setTab(v){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.v===v));['day','week','month'].forEach(x=>$(x).classList.toggle('hidden',x!==v));if(v==='day')drawDay();if(v==='week')drawWeek();if(v==='month')drawMonth()}
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.v));
 function drawDay(){const i=days.findIndex(x=>x.date===dayKey);$('dayTitle').textContent=dayLabel(dayKey);$('dayBody').innerHTML=byDate[dayKey]?byDate[dayKey].html:'<section>Немає даних</section>';$('dayPrev').disabled=i<=0;$('dayNext').disabled=i<0||i>=days.length-1}
 $('dayPrev').onclick=()=>{let i=days.findIndex(x=>x.date===dayKey);if(i>0){dayKey=days[i-1].date;drawDay()}};
 $('dayNext').onclick=()=>{let i=days.findIndex(x=>x.date===dayKey);if(i>=0&&i<days.length-1){dayKey=days[i+1].date;drawDay()}};
 function selectDay(key){dayKey=key;setTab('day')}
 function cards(s){if(!s||!s.covered)return '<p class="muted">Недостатньо підтверджених даних</p>';const b=s.extra-s.missed;return '<div class="stats"><div><small>Баланс світла</small><strong class="'+(b>0?'green':b<0?'red':'')+'">'+signed(b)+'</strong></div><div><small>Точність графіка</small><strong>'+s.accuracy+'%</strong></div><div><small>Додаткове світло</small><strong class="green">+'+dur(s.extra)+'</strong></div><div><small>Недоотримане</small><strong class="red">−'+dur(s.missed)+'</strong></div></div><div class="tip">Баланс = додаткове світло − недоотримане. Рахується лише за підтвердженими періодами.</div><p class="fine">Перевірено: '+dur(s.covered)+' · Днів із фактом: '+s.observedDays+'</p>'}
 function columns(list){return '<div class="bars">'+list.map(d=>{const v=d.accuracy,ms=d.balance;return '<div class="column"><div>'+['Нд','Пн','Вт','Ср','Чт','Пт','Сб'][d.weekday]+'</div><div class="outer">'+(v==null?'':'<div class="fill '+(ms>0?'pos':ms<0?'neg':'zero')+'" style="height:'+Math.max(4,v)+'%"><span class="inside">'+short(ms)+'</span></div>')+'</div><div class="pct">'+(v==null?'—':v+'%')+'</div></div>'}).join('')+'</div>'}
 function rows(list){return list.map(d=>'<div class="dayrow"><span>'+dayLabel(d.date).slice(0,5)+'</span><div class="track"><div style="width:'+(d.accuracy==null?0:d.accuracy)+'%"></div></div><b>'+(d.accuracy==null?'—':d.accuracy+'%')+'</b><b class="money '+(d.balance>0?'green':d.balance<0?'red':'')+'">'+short(d.balance)+'</b></div>').join('')}
 function drawWeek(){$('weekStats').innerHTML=cards(DATA.weekSummary);$('weekChart').innerHTML=columns(DATA.week);$('weekRows').innerHTML=rows(DATA.week);$('weekRows').querySelectorAll('.dayrow').forEach((el,i)=>el.onclick=()=>selectDay(DATA.week[i].date))}
 function drawMonth(){const m=DATA.months[monthIndex];$('monthTitle').textContent=m.title;$('monthStats').innerHTML=cards(m.summary);$('monthPrev').disabled=monthIndex===0;$('monthNext').disabled=monthIndex>=DATA.months.length-1;
 const target=$('calendar');target.innerHTML='';const empty=(m.days[0].weekday+6)%7;for(let i=0;i<empty;i++)target.appendChild(document.createElement('div'));
 m.days.forEach(d=>{let el=document.createElement('button');el.className='calday '+(d.balance==null?'':d.balance>0?'pos':d.balance<0?'neg':'zero');el.innerHTML='<span>'+d.day+'</span><b>'+(d.accuracy==null?'—':d.accuracy+'%')+'</b><span class="bal">'+short(d.balance)+'</span>';el.onclick=()=>selectDay(d.date);target.appendChild(el)});}
 $('monthPrev').onclick=()=>{if(monthIndex>0){monthIndex--;drawMonth()}};$('monthNext').onclick=()=>{if(monthIndex<DATA.months.length-1){monthIndex++;drawMonth()}};
 drawDay();</script></body></html>`;
 const web=new WebView();await web.loadHTML(html);await web.present();
}
if(!config.runsInWidget)await showReport();
Script.complete();
