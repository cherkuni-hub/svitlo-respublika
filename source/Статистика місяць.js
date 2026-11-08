// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// Scriptable · Чорна тема · Нативний чіткий текст
// Читає історію з «Світло вдома». Не змінює її.
const fm=FileManager.local();
const file=fm.joinPath(fm.documentsDirectory(),"light-history.json");
const now=Date.now();
let original=[];
try{
  if(fm.fileExists(file)){
    const x=JSON.parse(fm.readString(file));
    if(Array.isArray(x))original=x;
  }
}catch(e){}
const events=original.filter(e=>e &&
  (e.status==="on"||e.status==="off") &&
  Number.isFinite(e.at)&&e.at<=now)
  .sort((a,b)=>a.at-b.at);
const intervals=[];
for(let i=0;i<events.length;i++){
  const a=events[i].at;
  const b=Math.min(i+1<events.length?events[i+1].at:now,now);
  if(b>a)intervals.push({a,b,status:events[i].status,
    completed:i+1<events.length&&events[i+1].status==="on"});
}
function intersect(a,b,c,d){
  return Math.max(0,Math.min(b,d)-Math.max(a,c));
}
function stats(a,b){
  let off=0,on=0;
  for(const x of intervals){
    const ms=intersect(a,b,x.a,x.b);
    if(x.status==="off")off+=ms;else on+=ms;
  }
  return {off,on,known:off+on};
}
function duration(ms){
  const m=Math.max(0,Math.floor(ms/60000));
  return Math.floor(m/60)+" год "+String(m%60).padStart(2,"0")+" хв";
}
function short(ms){
  const m=Math.max(0,Math.floor(ms/60000));
  return Math.floor(m/60)+"г"+String(m%60).padStart(2,"0");
}
const P={
  bg:"#000000",text:"#FFFFFF",muted:"#A3A3A3",
  red:"#F87171",green:"#4ADE80",tile:"#303030",
  empty:"#161616",dim:"#858585",divider:"#3A3A3A",
  card:"#272727",good:"#254A35",low:"#365E45",
  mid:"#80612F",high:"#87413D"
};
function text(parent,value,size,color=P.text,bold=false){
  const t=parent.addText(String(value));
  t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);
  t.textColor=new Color(color);
  t.lineLimit=1;
  t.minimumScaleFactor=0.6;
  return t;
}
function centered(parent,value,size,color=P.text,bold=false){
  const row=parent.addStack();
  row.addSpacer();
  text(row,value,size,color,bold);
  row.addSpacer();
}
function separator(w){
  const line=w.addStack();
  line.size=new Size(0,1);
  line.backgroundColor=new Color(P.divider);
}

const today=new Date(now),year=today.getFullYear(),month=today.getMonth();
const first=new Date(year,month,1);
const endMonth=new Date(year,month+1,1);
const count=new Date(year,month+1,0).getDate();
const offset=(first.getDay()+6)%7;
const rowCount=Math.ceil((offset+count)/7);
const totals=stats(first.getTime(),Math.min(now,endMonth.getTime()));
const items=[];
for(let i=1;i<=count;i++){
  const start=new Date(year,month,i).getTime();
  const end=Math.min(now,new Date(year,month,i+1).getTime());
  const x=stats(start,end);
  items.push({...x,future:start>now,
    partial:x.known>0&&x.known<end-start-60000});
}
const name=first.toLocaleDateString("uk-UA",{month:"long",year:"numeric"});
const w=new ListWidget();
w.backgroundColor=new Color(P.bg);
w.setPadding(11,13,10,13);
text(w,"⚡ Статистика світла",21,P.text,true);
w.addSpacer(3);
text(w,name.charAt(0).toUpperCase()+name.slice(1),11,P.muted);
w.addSpacer(9);

// Верхня панель займає всю доступну ширину, як календар.
// Гнучкі проміжки доповнюють ширину без масштабування тексту.
const summary=w.addStack();
summary.layoutHorizontally();
summary.backgroundColor=new Color(P.card);
summary.cornerRadius=9;
summary.setPadding(6,8,6,8);

function metric(label,value,color){
  const box=summary.addStack();
  box.layoutVertically();
  box.size=new Size(111,47);
  text(box,label,10,P.muted);
  box.addSpacer(5);
  text(box,value,14,color,true);
}
function verticalDivider(){
  const line=summary.addStack();
  line.size=new Size(1,39);
  line.backgroundColor=new Color("#484848");
}
metric("Без світла",
  totals.known?duration(totals.off):"Немає даних",P.red);
summary.addSpacer();
verticalDivider();
summary.addSpacer(3);
const percent=summary.addStack();
percent.layoutVertically();
percent.size=new Size(63,47);
percent.addSpacer(2);
const share=totals.known>0?
  Math.round(totals.on/totals.known*100)+"%":"—";
centered(percent,share,21,totals.known>0?P.green:P.muted,true);
percent.addSpacer(2);
centered(percent,"зі світлом",8,P.muted);
percent.addSpacer(2);
summary.addSpacer(3);
verticalDivider();
summary.addSpacer();
metric("Зі світлом",
  totals.known?duration(totals.on):"Немає даних",P.green);
w.addSpacer(9);
const section=w.addStack();
text(section,"Без світла за днями",12,P.text,true);
section.addSpacer();
text(section,"день / год",9,P.muted);
w.addSpacer(6);

// Колонки по всій ширині: без лівого порожнього поля.
// Ніякого DrawContext — лише нативний текст Scriptable.
const weekNames=["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
const weekdayRow=w.addStack();
for(let i=0;i<7;i++){
  if(i)weekdayRow.addSpacer();
  const col=weekdayRow.addStack();
  col.size=new Size(39,15);
  centered(col,weekNames[i],10,P.muted,true);
}
w.addSpacer(5);

const height=rowCount===6?24:28;
for(let r=0;r<rowCount;r++){
  const line=w.addStack();
  for(let c=0;c<7;c++){
    if(c)line.addSpacer();
    const day=r*7+c-offset+1;
    const cell=line.addStack();
    cell.layoutVertically();
    cell.size=new Size(39,height);
    cell.cornerRadius=5;
    if(day<1||day>count){
      cell.backgroundColor=new Color(P.empty);
      continue;
    }
    const x=items[day-1];
    const unknown=x.future||x.known===0;
    let background=P.tile;
    if(!unknown){
      const hours=x.off/3600000;
      background=hours===0?P.good:hours<=3?P.low:
        hours<=6?P.mid:P.high;
    }
    cell.backgroundColor=new Color(background);
    cell.addSpacer(1);
    centered(cell,day,10,unknown?P.dim:P.text);
    cell.addSpacer(1);
    centered(cell,unknown?"—":short(x.off)+(x.partial?"*":""),
      10,unknown?P.dim:P.text,true);
    cell.addSpacer(1);
  }
  if(r<rowCount-1)w.addSpacer(3);
}
w.addSpacer(6);
text(w,"* неповний день  ·  — немає даних",9,P.muted);
w.refreshAfterDate=new Date(now+60000);
Script.setWidget(w);
if(config.runsInApp)await w.presentLarge();
Script.complete();
