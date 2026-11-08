// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// РК10 · робочий Large-віджет. Геометрія = погоджений користувачем тест.
// Дані: rk10-schedules-v1.json, заповнює скрипт «02_Імпорт_Telegram_РК10».
// Віджет нічого не записує і не змінює інші віджети світла.
const C = {
  bg: new Color('#080808'), white: new Color('#FFFFFF'),
  muted: new Color('#A6A6AA'), gray: new Color('#707077'),
  green: new Color('#69E38B'), red: new Color('#F17479'),
  alert: new Color('#F58C94'), line: new Color('#55555A'),
  gold: new Color('#FFD43B')
};
const padding = 13;
const graphW = Device.screenSize().width - 48 - 2 * padding;
const graphH = 92;
const fm = FileManager.local();
const store = fm.joinPath(fm.documentsDirectory(), 'rk10-schedules-v1.json');
function pad(n) { return String(n).padStart(2, '0'); }
function key(d) { return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function calendarDay(now, shift) { return new Date(now.getFullYear(), now.getMonth(), now.getDate()+shift); }
function displayDate(d) { return 'РК10 · ' + pad(d.getDate()) + '.' + pad(d.getMonth()+1); }
function readDB() {
  try {
    if (!fm.fileExists(store)) return { schedules:{}, incidents:[] };
    let x = JSON.parse(fm.readString(store));
    if (!x || typeof x !== 'object') throw Error('invalid storage');
    return { schedules: x.schedules && typeof x.schedules==='object' ? x.schedules : {}, incidents:Array.isArray(x.incidents)?x.incidents:[] };
  } catch (_) { return { schedules:{}, incidents:[] }; }
}
function validRanges(ranges) {
  if (!Array.isArray(ranges) || !ranges.length || ranges[0].from !== 0 || ranges[ranges.length-1].to !== 1440) return false;
  for (let i=0;i<ranges.length;i++) {
    let s = ranges[i];
    if (!Number.isInteger(s.from) || !Number.isInteger(s.to) || s.from<0 || s.to>1440 || s.to<=s.from || typeof s.on!=='boolean') return false;
    if (i && (s.from!==ranges[i-1].to || s.on===ranges[i-1].on)) return false;
  }
  return true;
}
function hasIncident(db, date) {
  let matches = db.incidents.filter(x => x && x.date===date && (x.status==='active'||x.status==='cancel'));
  matches.sort((a,b)=>(b.received||0)-(a.received||0));
  return matches.length>0 && matches[0].status==='active';
}
function text(parent, value, size, color, bold=false) {
  const t=parent.addText(value);
  t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);
  t.textColor=color;
  t.lineLimit=1;
  t.minimumScaleFactor=.95;
  return t;
}
function header(w, title, date, sign) {
  const row=w.addStack(); row.centerAlignContent();
  text(row,sign,18,C.gold,true);row.addSpacer(6);
  text(row,title,17.5,C.white,true);row.addSpacer();
  text(row,date,10.5,C.muted);
}
function status(w, warning) {
  const row=w.addStack();row.centerAlignContent();
  text(row,warning?'⚠':'✓',16,warning?C.alert:C.green,true);row.addSpacer(7);
  text(row,warning?'Аварійні відключення':'Аварій не повідомлено',13,warning?C.alert:C.green);
}
function fmt(minute) {
  if(minute===1440)return '24:00';
  return pad(Math.floor(minute/60))+':'+pad(minute%60);
}
// Exact graphic function from approved Large test.
function segment(ctx,from,to,y,h,first,last,color) {
  const x1=graphW*from/1440, x2=graphW*to/1440;
  if(x2<=x1)return;
  const r=Math.min(h/2,(x2-x1)/2),p=new Path();
  p.move(new Point(x1+(first?r:0),y));
  p.addLine(new Point(x2-(last?r:0),y));
  if(last)p.addQuadCurve(new Point(x2,y+r),new Point(x2,y));
  p.addLine(new Point(x2,y+h-(last?r:0)));
  if(last)p.addQuadCurve(new Point(x2-r,y+h),new Point(x2,y+h));
  p.addLine(new Point(x1+(first?r:0),y+h));
  if(first)p.addQuadCurve(new Point(x1,y+h-r),new Point(x1,y+h));
  p.addLine(new Point(x1,y+(first?r:0)));
  if(first)p.addQuadCurve(new Point(x1+r,y),new Point(x1,y));
  p.closeSubpath();ctx.addPath(p);ctx.setFillColor(color);ctx.fillPath();
}
function graph(ranges) {
  const ctx=new DrawContext();ctx.size=new Size(graphW,graphH);ctx.respectScreenScale=true;ctx.opaque=false;
  const barY=45,barH=22;
  const data=ranges||[{from:0,to:1440,on:null}];
  for(let i=0;i<data.length;i++){
    const s=data[i];
    segment(ctx,s.from,s.to,barY,barH,i===0,i===data.length-1,
      s.on===null?C.gray:(s.on?C.green:C.red));
  }
  const marks=ranges?[0,...ranges.slice(0,-1).map(s=>s.to),1440]:[0,360,720,1080,1440];
  const labelWidth=43;
  const rows=[[],[],[{left:0,right:labelWidth},{left:graphW-labelWidth,right:graphW}]];
  ctx.setFont(Font.systemFont(11.1));ctx.setTextColor(C.white);ctx.setTextAlignedCenter();
  for(const minute of [...new Set(marks)].sort((a,b)=>a-b)){
    const x=graphW*minute/1440,edge=minute===0||minute===1440;
    const left=Math.max(0,Math.min(graphW-labelWidth,x-labelWidth/2));
    const preferences=minute===810?[2,1,0]:[1,0,2];
    let row=edge?2:-1;
    if(!edge){
      for(const candidate of preferences){
        const free=rows[candidate].every(a=>left>=a.right+3||left+labelWidth<=a.left-3);
        if(free){row=candidate;break;}
      }
      if(row<0)row=0;
      rows[row].push({left,right:left+labelWidth});
    }
    const yy=[0,21,73][row];
    ctx.drawTextInRect(fmt(minute),new Rect(left,yy,labelWidth,17));
    ctx.setFillColor(C.muted);
    const lineStart=row===2?barY+barH:(row===0?16:37);
    const lineEnd=row===2?73:barY;
    ctx.fillRect(new Rect(Math.max(0,x-.35),lineStart,.7,lineEnd-lineStart));
  }
  return ctx.getImage();
}
function chart(w,ranges){
  const im=w.addImage(graph(ranges));im.imageSize=new Size(graphW,graphH);im.resizable=false;
}
function divider(w){
  const ctx=new DrawContext();ctx.size=new Size(graphW,2);ctx.respectScreenScale=true;ctx.opaque=false;
  ctx.setFillColor(C.line);ctx.fillRect(new Rect(0,0,graphW,1));
  const im=w.addImage(ctx.getImage());im.imageSize=new Size(graphW,2);im.resizable=false;
}
// Only dynamic data and dates differ from the approved test.
const now=new Date(),today=calendarDay(now,0),tomorrow=calendarDay(now,1);
const db=readDB();
const a=db.schedules[key(today)],b=db.schedules[key(tomorrow)];
const todayRanges=a&&validRanges(a.ranges)?a.ranges:null;
const tomorrowRanges=b&&validRanges(b.ranges)?b.ranges:null;
const todayAlert=hasIncident(db,key(today)),tomorrowAlert=hasIncident(db,key(tomorrow));
const w=new ListWidget();w.backgroundColor=C.bg;w.setPadding(12,padding,11,padding);
header(w,'Графік на сьогодні',displayDate(today),'⚡');
w.addSpacer(7);status(w,todayAlert);w.addSpacer(3);chart(w,todayRanges);w.addSpacer(2);
text(w,todayAlert?'Плановий графік може не діяти':(todayRanges?'За повідомленням ЖК':'Очікуємо графік на сьогодні'),12,todayAlert?C.alert:C.muted);
w.addSpacer(13);divider(w);w.addSpacer(13);
header(w,'Графік на завтра',displayDate(tomorrow),'▦');
w.addSpacer(7);status(w,tomorrowAlert);w.addSpacer(3);chart(w,tomorrowRanges);w.addSpacer(3);
text(w,tomorrowAlert?'Плановий графік може не діяти':(tomorrowRanges?'За повідомленням ЖК':'Очікуємо графік на завтра'),12,tomorrowAlert?C.alert:C.muted);
Script.setWidget(w);if(!config.runsInWidget)await w.presentLarge();Script.complete();
