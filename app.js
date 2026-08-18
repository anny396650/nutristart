/* ============================================================
   營養追蹤 — 自架版
   資料只存 localStorage（單機版）；AI 估算用使用者自己的 Gemini 金鑰。
   ============================================================ */
'use strict';

const KEY = 'nutri-tracker-v1';
const APP_VER = 'p1.2.0';

/* ---------- 固定資料 ---------- */

// 保健品組合的初值。到「設定 → 保健品組合」改成自己吃的。
// mi 是各營養素佔每日參考值的百分比，照罐身標示填。
const DEFAULT_SUPPS = [
  {id:'s1',t:'早餐',n:'綜合維他命 1 錠',mi:{},
   foods:[{n:'綜合維他命 1 錠',k:0,p:0,c:0,f:0,fi:0,su:0,na:0,sa:0,ch:0,po:0,ca:0,fe:0}]},
  {id:'s2',t:'睡前',n:'鈣片 1 錠',mi:{},
   foods:[{n:'鈣片 1 錠',k:0,p:0,c:0,f:0,fi:0,su:0,na:0,sa:0,ch:0,po:0,ca:0,fe:0}]}
];

const MEALS = [['b','早餐'],['l','午餐'],['d','晚餐'],['sn','點心'],['sup','保健食品']];
const MEAL_IDS = MEALS.map(m => m[0]);

const VITS = [['va','維他命A',100],['vc','維他命C',100],['ca','鈣',120],['fe','鐵',100],
  ['b1','維他命B1',100],['b2','維他命B2',100],['b6','維他命B6',100],['b12','維他命B12',100],
  ['vd','維他命D',100],['ve','維他命E',100],['fol','葉酸',100],['nia','菸鹼素',100],
  ['pan','泛酸',100],['bio','生物素',100],['iod','碘',100],['mg','鎂',100],
  ['zn','鋅',100],['se','硒',100]];

// 常吃清單的初值，都是常見食物的概略值，可以自己改數字或整批刪掉重建。
const DEFAULT_PRESETS = [
  {id:'p1',n:'白飯 1 碗',k:280,p:5.2,c:62,f:.6,fi:.6,su:0,na:2},
  {id:'p2',n:'全麥吐司 1 片',k:90,p:3.5,c:16,f:1.3,fi:2,su:1.5,na:150},
  {id:'p3',n:'燕麥片 40g',k:150,p:5.3,c:27,f:3.2,fi:4,su:.5,na:4,ca:20,fe:1.7},
  {id:'p4',n:'雞胸肉 100g（去皮）',k:110,p:23,c:0,f:1.5,fi:0,su:0,na:45,ch:70,po:300},
  {id:'p5',n:'水煮蛋 1 顆',k:78,p:6.3,c:.6,f:5.3,fi:0,su:.6,na:62,ch:186},
  {id:'p6',n:'板豆腐 100g',k:88,p:8.5,c:2,f:5,fi:.5,su:0,na:2,ca:140,fe:1.5},
  {id:'p7',n:'無糖豆漿 400ml',k:128,p:12,c:6,f:6.4,fi:1.2,su:0,na:40,ca:40,po:340},
  {id:'p8',n:'鮮奶 240ml',k:150,p:8,c:12,f:8,fi:0,su:12,na:100,ca:280},
  {id:'p9',n:'無糖優格 100g',k:60,p:5.5,c:5,f:2,fi:0,su:5,na:40,ca:150},
  {id:'p10',n:'香蕉 1 根',k:105,p:1.3,c:27,f:.4,fi:3.1,su:14,na:1,po:420},
  {id:'p11',n:'蘋果 1 顆',k:95,p:.5,c:25,f:.3,fi:4.4,su:19,na:2},
  {id:'p12',n:'地瓜 150g',k:130,p:2.4,c:30,f:.2,fi:4.5,su:9,na:15,po:400}
];
const COMBO   = {id:'cb1',n:'🥣 早餐組合',items:['p3','p7']};
const ROUTINE = {n:'📋 一鍵記錄常吃組合',items:['p3','p7'],supps:['s1']};

// 每筆食物一定要有的欄位，載入時據此補齊，避免任何地方出現 undefined
const FOOD_NUM = ['k','p','c','f','fi','su','na','sa','ch','po','ca','fe','va','vc'];

const DEFAULTS = {
  days: {},
  presets: clone0(DEFAULT_PRESETS),   // 常吃清單，內建的也能改
  inbody: [],
  // 預設用台灣的每日參考值，到設定頁改成自己的
  targets: {k:2000,p:60,c:300,f:60,fi:25,su:50,na:2000,sa:18,ch:300,po:3500,wa:2000},
  goalW: 55,
  api: {key:''},
  supps: clone0(DEFAULT_SUPPS),   // 保健品組合，可自己改
  freq: {},                       // 常吃項目的點擊次數，用來排序
  // 保留欄位：這版沒有雲端同步，留著讓匯出檔跟完整版格式相容
  mt: {},
  mtG: 0
};
function clone0(v){ return JSON.parse(JSON.stringify(v)); }


/* ---------- 小工具 ---------- */
const r  = n => Math.round(n);
const r1 = n => Math.round(n * 10) / 10;
const num = (v, d) => { const x = +v; return Number.isFinite(x) ? x : (d || 0); };
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function iso(d){
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}
function shift(s,n){ const d = new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return iso(d); }
function pretty(s){
  const d = new Date(s+'T12:00:00');
  const w = ['日','一','二','三','四','五','六'][d.getDay()];
  return (d.getMonth()+1) + '/' + d.getDate() + ' 週' + w;
}
function today(){ return iso(new Date()); }

/* ============================================================
   儲存：localStorage + 與預設值深層合併
   ============================================================ */
function deepMerge(base, over){
  if(over === null || over === undefined) return clone(base);
  if(Array.isArray(base)) return Array.isArray(over) ? over.slice() : base.slice();
  if(typeof base === 'object'){
    if(typeof over !== 'object' || Array.isArray(over)) return clone(base);
    const out = {};
    for(const k in base) out[k] = deepMerge(base[k], over[k]);
    for(const k in over) if(!(k in base)) out[k] = over[k];   // 保留未知的新欄位
    return out;
  }
  return over === undefined ? base : over;
}
function clone(v){ return JSON.parse(JSON.stringify(v)); }

/** 把載入的資料補成一定合法的形狀。這裡是「絕不出現 undefined」的最後一道防線。 */
function normalize(D){
  if(!D.days || typeof D.days !== 'object' || Array.isArray(D.days)) D.days = {};
  for(const dk of Object.keys(D.days)){
    const day = D.days[dk];
    if(!day || typeof day !== 'object'){ delete D.days[dk]; continue; }
    if(!Array.isArray(day.f)) day.f = [];
    if(!day.s || typeof day.s !== 'object' || Array.isArray(day.s)) day.s = {};
    day.w = (day.w === null || day.w === undefined || !Number.isFinite(+day.w)) ? null : +day.w;
    day.wa = Math.max(0, num(day.wa, 0));      // 當天累計喝水量 ml
    // 保健品的當天快照。舊資料沒有這欄，維持空的就好（會退回用現行設定顯示）
    if(!day.sn || typeof day.sn !== 'object' || Array.isArray(day.sn)) day.sn = {};
    for(const id of Object.keys(day.sn)){
      const v = day.sn[id];
      if(!v || typeof v !== 'object'){ delete day.sn[id]; continue; }
      day.sn[id] = {
        t: String(v.t || ''), n: String(v.n || '未命名'),
        mi: (v.mi && typeof v.mi === 'object' && !Array.isArray(v.mi))
            ? Object.keys(v.mi).reduce((a,k) => { a[k] = num(v.mi[k], 0); return a; }, {}) : {}
      };
    }
    day.f = day.f.filter(x => x && typeof x === 'object').map(x => {
      const o = {n: String(x.n || '未命名'), tag: String(x.tag || '')};
      for(const kk of FOOD_NUM) o[kk] = num(x[kk], 0);
      // 舊資料沒有餐別欄位，用 tag 回推：保健品歸 sup，其他當早餐
      o.m = MEAL_IDS.indexOf(x.m) >= 0 ? x.m : (o.tag.indexOf('sup:') === 0 ? 'sup' : 'b');
      return o;
    });
  }

  if(!Array.isArray(D.presets)) D.presets = clone(DEFAULT_PRESETS);
  D.presets = D.presets.filter(x => x && typeof x === 'object' && x.id).map(x => {
    const o = {id: String(x.id), n: String(x.n || '未命名')};
    for(const kk of FOOD_NUM) o[kk] = num(x[kk], 0);
    return o;
  });

  if(!Array.isArray(D.inbody)) D.inbody = [];
  D.inbody = D.inbody.filter(x => x && typeof x === 'object' && x.d).map(x => ({
    d: String(x.d), w: num(x.w, 0), smm: num(x.smm, 0), pbf: num(x.pbf, 0)
  }));

  for(const kk in DEFAULTS.targets) D.targets[kk] = num(D.targets[kk], DEFAULTS.targets[kk]);
  D.goalW = num(D.goalW, DEFAULTS.goalW);

  if(!D.api || typeof D.api !== 'object') D.api = {key:''};
  D.api.key = String(D.api.key || '').trim();

  // 保健品：舊存檔沒有這欄，補上預設；有的話逐項驗形狀
  if(!Array.isArray(D.supps) || !D.supps.length) D.supps = clone(DEFAULT_SUPPS);
  D.supps = D.supps.filter(x => x && typeof x === 'object' && x.id).map(x => ({
    id: String(x.id),
    t: String(x.t || ''),
    n: String(x.n || '未命名'),
    off: !!x.off,
    mi: (x.mi && typeof x.mi === 'object' && !Array.isArray(x.mi))
        ? Object.keys(x.mi).reduce((a,k) => { a[k] = num(x.mi[k], 0); return a; }, {})
        : {},
    foods: (Array.isArray(x.foods) ? x.foods : []).filter(y => y && typeof y === 'object').map(y => {
      const o = {n: String(y.n || '未命名')};
      for(const kk of FOOD_NUM) o[kk] = num(y[kk], 0);
      return o;
    })
  }));

  if(!D.freq || typeof D.freq !== 'object' || Array.isArray(D.freq)) D.freq = {};
  for(const k of Object.keys(D.freq)) D.freq[k] = num(D.freq[k], 0);

  // 同步用的時間戳
  if(!D.mt || typeof D.mt !== 'object' || Array.isArray(D.mt)) D.mt = {};
  for(const k of Object.keys(D.mt)) D.mt[k] = num(D.mt[k], 0);
  D.mtG = num(D.mtG, 0);
  return D;
}

/** 目前生效的保健品組合。停用（off）的不出現在今天的清單裡。 */
function supps(){ return D.supps.filter(s => !s.off); }

/* ---------- 保健品的「當天快照」 ----------
   D.supps 是「現在的設定」。以前畫面直接拿它去渲染每一天，
   結果改一次組合，過去所有日子的名稱和維他命百分比都跟著變——歷史被回溯改寫。
   打勾時把當下的 {時段, 名稱, 維他命} 存進那一天，之後怎麼改設定都不影響已經記錄的日子。 */

/** 打勾：記錄狀態，並把當下的組合定義存成快照 */
function markSupp(d, id){
  const s = D.supps.find(x => x.id === id);
  d.s[id] = true;
  if(!d.sn || typeof d.sn !== 'object') d.sn = {};
  if(s) d.sn[id] = {t: s.t, n: s.n, mi: clone(s.mi || {})};
}
/** 取消打勾：快照一起清掉 */
function unmarkSupp(d, id){
  d.s[id] = false;
  if(d.sn) delete d.sn[id];
}
/** 這一天要用的定義：有快照就用快照，沒有（舊資料）才退回現在的設定 */
function suppView(d, s){
  const snap = d.sn && d.sn[s.id];
  return snap ? {id: s.id, t: snap.t, n: snap.n, mi: snap.mi || {}} : s;
}
/** 這一天該列出的組合：現行的，加上只存在於快照裡的（設定已刪但當天有記錄）*/
function suppsFor(d){
  const list = supps().map(s => suppView(d, s));
  const seen = new Set(list.map(x => x.id));
  if(d.sn) for(const id of Object.keys(d.sn)){
    if(seen.has(id) || !d.s[id]) continue;
    const snap = d.sn[id];
    list.push({id, t: snap.t, n: snap.n, mi: snap.mi || {}, gone: true});
  }
  return list;
}

let D = clone(DEFAULTS);
let cur = today();

function load(){
  let raw = null;
  try { raw = localStorage.getItem(KEY); }
  catch(e){ setSave('fail', '讀不到本機儲存，可能開了無痕模式'); }
  if(raw){
    try { D = deepMerge(DEFAULTS, JSON.parse(raw)); }
    catch(e){ D = clone(DEFAULTS); setSave('fail', '存檔解析失敗，已用預設值開啟'); }
  }
  // 沒有存檔時也要跑一次：pv 要被標記成已搬遷，
  // 否則第一次刪掉內建項目、存檔、重開之後它會自己長回來。
  D = normalize(D);
}

let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  setSave('saving');
  saveTimer = setTimeout(doSave, 700);      // debounce，避免連點時狂寫
}
function doSave(){
  try {
    localStorage.setItem(KEY, JSON.stringify(D));
    setSave('ok');
  } catch(e){
    const full = e && (e.name === 'QuotaExceededError' || e.code === 22);
    setSave('fail', full ? '空間不足，請匯出後清理舊資料' : '未儲存，點我重試');
  }
}

let toastT = null;
function setSave(st, msg){
  const el = document.getElementById('sstat');
  if(!el) return;
  clearTimeout(toastT);
  if(st === 'saving'){ el.className = 'toast'; el.onclick = null; return; }   // 儲存中不打擾
  if(st === 'ok'){
    el.className = 'toast show'; el.textContent = '已儲存'; el.onclick = null;
    toastT = setTimeout(() => { el.className = 'toast'; }, 1400);
    return;
  }
  el.className = 'toast show fail';
  el.textContent = msg || '未儲存，點我重試';
  el.onclick = doSave;
}
function toast(msg, kind, onClick){
  const el = document.getElementById('sstat');
  clearTimeout(toastT);
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  el.onclick = onClick || null;
  toastT = setTimeout(() => { el.className = 'toast'; el.onclick = null; }, onClick ? 8000 : 2200);
}

/* ---------- 資料存取 ---------- */
function day(s){
  if(!D.days[s]) D.days[s] = {f:[], s:{}, w:null, wa:0, sn:{}};
  return D.days[s];
}
/** 改到「某一天」的內容時用這個存，順便記下那天的修改時間，合併才有依據。 */
function saveDay(k){ D.mt[k || cur] = Date.now(); save(); }
/** 改到設定類（目標／常吃清單／保健品組合）時用這個存。 */
function saveCfg(){ D.mtG = Date.now(); save(); }
// 內建與自訂現在都住在 D.presets，所以每一筆都能改、能刪
function allPresets(){ return D.presets; }
function weightSeries(){
  return Object.keys(D.days).filter(k => D.days[k].w).sort().map(k => ({d:k, w:D.days[k].w}));
}

let chipQuery = '';          // 常吃清單的搜尋字串

let curMeal = (function(){
  const h = new Date().getHours();
  return h < 10 ? 'b' : h < 14 ? 'l' : h < 17 ? 'sn' : 'd';
})();

/* ============================================================
   畫面
   ============================================================ */
function renderAll(){ renderToday(); renderTrend(); renderSet(); }

function renderToday(){
  document.getElementById('dlabel').textContent = pretty(cur);
  const isT = cur === today();
  const jb = document.getElementById('jump');
  jb.style.opacity = isT ? '.35' : '1';
  jb.textContent = isT ? '今天' : '回今天';
  document.getElementById('next').disabled = isT;

  const d = day(cur), T = D.targets;
  let k = 0, p = 0, c = 0, f = 0;
  d.f.forEach(x => { k += x.k; p += x.p; c += x.c; f += x.f; });

  // 目標線落在 77%：max 是目標的 1.3 倍時，1/1.3 ≈ 0.769。吃超過才會往左移。
  const max = Math.max(T.k * 1.3, k * 1.05);
  const tPct = T.k / max * 100;
  document.getElementById('gsur').style.cssText = 'left:' + tPct + '%;right:0';
  document.getElementById('gmark').style.left = tPct + '%';
  const fill = document.getElementById('gfill');
  fill.style.width = Math.min(k / max * 100, 100) + '%';
  fill.classList.toggle('over', k > T.k);
  document.getElementById('gtl').textContent = '目標 ' + T.k;
  document.getElementById('gmax').textContent = r(max);
  document.getElementById('eaten').textContent = r(k).toLocaleString() + ' kcal';

  // 增肌是要盈餘，超過目標不該是紅色警告
  const gap = T.k - k;
  const msg = document.getElementById('hmsg'), sub = document.getElementById('hsub');
  if(k === 0){
    msg.innerHTML = '今天還沒開始';
    sub.textContent = '目標 ' + T.k.toLocaleString() + ' 大卡';
  } else if(gap > 0){
    msg.innerHTML = '還要吃 <b>' + r(gap).toLocaleString() + '</b>';
    sub.textContent = '已吃 ' + r(k).toLocaleString() + ' ／ 目標 ' + T.k.toLocaleString() + ' 大卡';
  } else {
    msg.innerHTML = '吃夠了 ✓ 盈餘 <b>+' + r(-gap) + '</b>';
    sub.textContent = '增肌需要盈餘，這是好事';
  }

  const mb = (id, vid, val, tgt, unit) => {
    document.getElementById(id).style.width = Math.min(val / tgt * 100, 100) + '%';
    document.getElementById(vid).innerHTML = '<b>' + r(val) + '</b> / ' + tgt + unit;
  };
  mb('bp','vp',p,T.p,'g'); mb('bc','vc',c,T.c,'g'); mb('bf','vf',f,T.f,'g');

  // 其他營養素
  const S6 = {fi:0,su:0,na:0,sa:0,ch:0,po:0,ca:0,fe:0,va:0,vc:0};
  d.f.forEach(x => { for(const kk in S6) S6[kk] += x[kk] || 0; });
  const T2 = {fi:T.fi, su:T.su, na:T.na, sa:T.sa, ch:T.ch, po:T.po};
  const cell = (lab, val, goal, unit, over) =>
    '<div class="mi' + (over && val > goal ? ' hi' : '') + '">' +
    '<div class="mn">' + lab + '</div>' +
    '<div class="mv">' + (val < 10 ? r1(val) : r(val)) + '</div>' +
    '<div class="mt">/ ' + goal + unit + '</div></div>';
  document.getElementById('micros').innerHTML =
    '<div class="micros">' +
      cell('纖維',S6.fi,T2.fi,'g') + cell('糖',S6.su,T2.su,'g',1) + cell('鈉',S6.na,T2.na,'mg',1) +
    '</div><div class="micros">' +
      cell('飽和脂肪',S6.sa,T2.sa,'g',1) + cell('膽固醇',S6.ch,T2.ch,'mg',1) + cell('鉀',S6.po,T2.po,'mg') +
    '</div>';

  // 維他命礦物質＝保健品固定值 ＋ 食物換算
  const DV = {va:700, vc:100, ca:1200, fe:15};
  const V = {}; VITS.forEach(x => V[x[0]] = 0);
  for(const kk in DV) V[kk] = (S6[kk] || 0) / DV[kk] * 100;
  suppsFor(d).forEach(x => { if(d.s[x.id] && x.mi) for(const kk in x.mi) V[kk] = (V[kk] || 0) + x.mi[kk]; });
  document.getElementById('vits').innerHTML = VITS.map(x => {
    const val = V[x[0]] || 0;
    const cls = val >= x[2] ? ' ok' : (val > 0 ? '' : ' zero');
    return '<div class="vc' + cls + '"><div class="vn">' + x[1] + '</div><div class="vv">' + r(val) + '%</div></div>';
  }).join('') + '<div class="vc fill"></div>'.repeat((4 - VITS.length % 4) % 4);

  // 體重
  const wi = document.getElementById('win'), ws = document.getElementById('wsave');
  wi.value = d.w || '';
  ws.textContent = d.w ? '已記錄' : '記錄';
  ws.classList.toggle('done', !!d.w);
  const hist = weightSeries();
  const dd = document.getElementById('wdiff');
  dd.textContent = hist.length > 1
    ? ((hist[hist.length-1].w - hist[0].w >= 0 ? '+' : '') + r1(hist[hist.length-1].w - hist[0].w) + ' kg 起算')
    : '';

  // 喝水
  const waT = D.targets.wa || 2000;
  document.getElementById('wameta').textContent = r(d.wa) + ' / ' + waT + ' ml';
  const wab = document.getElementById('wabar');
  wab.style.width = Math.min(d.wa / waT * 100, 100) + '%';
  wab.classList.toggle('full', d.wa >= waT);

  // 保健品
  const sc = document.getElementById('supps'); sc.innerHTML = '';
  let done = 0;
  const dayList = suppsFor(d);
  dayList.forEach(s => {
    const on = !!d.s[s.id]; if(on) done++;
    const el = document.createElement('button');
    el.className = 'supp' + (on ? ' on' : '');
    el.innerHTML = '<div class="box">' + (on ? '✓' : '') + '</div>' +
      '<div><div class="supp-t mono">' + esc(s.t) + (s.gone ? '（已移除）' : '') +
      '</div><div class="supp-n">' + esc(s.n) + '</div></div>';
    el.onclick = () => toggleSupp(s.id);
    sc.appendChild(el);
  });
  document.getElementById('scount').textContent = done + ' / ' + dayList.length;

  // 常吃 chips
  const cw = document.getElementById('chips'); cw.innerHTML = '';
  const rb = document.createElement('button');
  rb.className = 'chip routine'; rb.textContent = ROUTINE.n;
  rb.onclick = () => {
    ROUTINE.supps.forEach(id => {
      if(d.s[id]) return;
      markSupp(d, id);
      const sp = supps().find(x => x.id === id);
      if(sp && sp.foods) sp.foods.forEach(fo => addFood(fo, true, 'sup:' + id, 'sup'));
    });
    const mm = {p1:'b', p2:'b', p3:'l'};
    ROUTINE.items.forEach(i => {
      const pr = allPresets().find(x => x.id === i);
      if(pr && !d.f.some(x => x.n === pr.n)) addFood(pr, true, '', mm[i] || 'b');
    });
    saveDay(); renderToday();
  };
  cw.appendChild(rb);

  const cb = document.createElement('button');
  cb.className = 'chip combo'; cb.textContent = COMBO.n;
  cb.onclick = () => {
    COMBO.items.forEach(i => { const pr = allPresets().find(x => x.id === i); if(pr) addFood(pr, true); });
    saveDay(); renderToday();
  };
  cw.appendChild(cb);

  // 常用的排前面，清單長了才不用一直滑；有搜尋字串時只列符合的
  const q = chipQuery.trim().toLowerCase();
  if(q){ rb.style.display = 'none'; cb.style.display = 'none'; }
  const hits = allPresets()
    .filter(pr => !q || pr.n.toLowerCase().indexOf(q) >= 0)
    .sort((a, b) => (D.freq[b.id] || 0) - (D.freq[a.id] || 0));

  if(!hits.length){
    const em = document.createElement('div');
    em.className = 'empty'; em.style.width = '100%';
    em.textContent = '找不到「' + chipQuery + '」';
    cw.appendChild(em);
  }
  hits.forEach(pr => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.innerHTML = esc(pr.n) + ' <span class="k">' + pr.k + '</span>';
    b.onclick = () => {
      D.freq[pr.id] = (D.freq[pr.id] || 0) + 1;
      addFood(pr); renderToday();
    };
    cw.appendChild(b);
  });

  // 餐別選擇器
  const msw = document.getElementById('mealsel'); msw.innerHTML = '';
  MEALS.filter(m => m[0] !== 'sup').forEach(m => {
    const bt = document.createElement('button');
    bt.className = 'ms' + (curMeal === m[0] ? ' on' : '');
    bt.textContent = m[1];
    bt.onclick = () => { curMeal = m[0]; renderToday(); };
    msw.appendChild(bt);
  });

  // 依餐別分組
  const fl = document.getElementById('flist'); fl.innerHTML = '';
  document.getElementById('fcount').textContent = d.f.length + ' 項';
  if(!d.f.length) fl.innerHTML = '<div class="empty">還沒有紀錄。點常吃清單，或拍張照。</div>';
  MEALS.forEach(m => {
    const items = d.f.map((x,i) => ({x,i})).filter(o => o.x.m === m[0]);
    if(!items.length) return;
    const kk = items.reduce((a2,o) => a2 + o.x.k, 0);
    const hd = document.createElement('div'); hd.className = 'mhead';
    hd.innerHTML = '<span class="mt2">' + m[1] + '</span><span class="mk">' + r(kk) + ' kcal</span>';
    fl.appendChild(hd);
    items.forEach(o => {
      const el = document.createElement('div'); el.className = 'fitem';
      el.innerHTML = '<button class="finfo"><div class="fn">' + esc(o.x.n) + '</div>' +
        '<div class="fm">蛋白 ' + r1(o.x.p) + '　碳水 ' + r1(o.x.c) + '　脂肪 ' + r1(o.x.f) + '</div></button>' +
        '<div class="fk">' + r(o.x.k) + '</div>' +
        '<button class="del" aria-label="刪除">✕</button>';
      el.querySelector('.finfo').onclick = () => editFood(o.i);   // 點名稱就能改
      el.querySelector('.del').onclick = () => removeFood(o.i);
      fl.appendChild(el);
    });
  });
}

function toggleSupp(id){
  const d = day(cur);
  const s = D.supps.find(x => x.id === id);
  if(d.s[id]) unmarkSupp(d, id); else markSupp(d, id);
  if(s && s.foods){
    if(d.s[id]) s.foods.forEach(fo => addFood(fo, true, 'sup:' + id, 'sup'));
    else d.f = d.f.filter(x => x.tag !== 'sup:' + id);
  }
  saveDay(); renderToday();
}

/** 刪除一筆食物。
 *  保健品的單項可以自己刪掉（那天少吃其中一樣很常見），同組其他項留著、勾勾也維持。
 *  只有整組都被刪光了才取消打勾。
 *  當初會做成「刪一項＝整組移除」，是為了擋掉「取消打勾但品項還留著，
 *  再勾一次就變兩份」的重複記錄；改成這樣一樣不會重複——
 *  取消打勾時本來就會把同組剩下的清乾淨，再勾才重新加一整組。 */
function removeFood(i){
  const d = day(cur);
  const item = d.f[i];
  if(!item) return;
  d.f.splice(i, 1);
  if(item.tag && item.tag.indexOf('sup:') === 0){
    const gid = item.tag.slice(4);
    if(!d.f.some(x => x.tag === item.tag)) unmarkSupp(d, gid);
  }
  saveDay(); renderToday();
}

/** 點食物名稱進來改。改完只動數值，tag 與餐別保持原樣。 */
function editFood(i){
  const d = day(cur);
  const it = d.f[i];
  if(!it) return;
  const isSup = it.tag.indexOf('sup:') === 0;
  foodForm('編輯紀錄',
    isSup ? '這是保健品自動記的，改動只影響今天這筆。' : '改完按儲存。',
    it,
    o => { Object.assign(d.f[i], o); saveDay(); renderToday(); },
    '', { okText:'儲存', onDelete: () => removeFood(i) });
}

/** 把前一天的紀錄整份複製過來，固定菜單的人省事。 */
function copyPrevDay(){
  const prev = shift(cur, -1);
  const pd = D.days[prev];
  if(!pd || !pd.f.length){ toast('前一天沒有紀錄'); return; }
  const kcal = pd.f.reduce((a,b) => a + b.k, 0);
  const nSup = Object.keys(pd.s).filter(k => pd.s[k]).length;
  openSheet(
    '<h3>複製前一天</h3>' +
    '<div class="hint">把 <b>' + pretty(prev) + '</b> 的 <b>' + pd.f.length + '</b> 筆紀錄（共 ' +
    r(kcal) + ' kcal、保健品 ' + nSup + ' 組）<b>追加</b>到 ' + pretty(cur) + '。<br>' +
    '現有的紀錄不會被刪掉。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-go" id="x-go">複製過來</button></div>'
  );
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    const d = day(cur);
    pd.f.forEach(x => d.f.push(clone(x)));
    for(const k in pd.s) if(pd.s[k]) markSupp(d, k);
    saveDay(); closeSheet(); renderToday();
    toast('已複製 ' + pd.f.length + ' 筆');
  };
}

function addFood(o, silent, tag, meal){
  const d = day(cur);
  const rec = {n: String(o.n || '未命名'), tag: tag || '', m: meal || (tag ? 'sup' : curMeal)};
  for(const kk of FOOD_NUM) rec[kk] = num(o[kk], 0);
  d.f.push(rec);
  if(!silent) saveDay();
}

/* ---------- 圖表 ---------- */
function renderTrend(){
  const S = weightSeries();
  document.getElementById('wgoal').textContent = '目標 ' + D.goalW + 'kg ・ +0.5kg／月';
  const sv = document.getElementById('wchart');
  const W = 340, H = 150, PL = 30, PR = 8, PT = 10, PB = 20;

  if(S.length < 2){
    sv.innerHTML = '<text x="170" y="78" text-anchor="middle" font-size="12" fill="#7A7268" font-family="Noto Sans TC">記錄兩天以上就會出現曲線</text>';
  } else {
    const ws = S.map(x => x.w);
    let lo = Math.min(...ws) - .6, hi = Math.max(...ws) + .6;
    if(hi - lo < 1.5){ const m = (hi + lo) / 2; lo = m - .75; hi = m + .75; }
    const X = i => PL + i * (W - PL - PR) / (S.length - 1);
    const Y = v => PT + (hi - v) / (hi - lo) * (H - PT - PB);
    let g = '';
    for(let i = 0; i <= 3; i++){
      const v = lo + (hi - lo) * i / 3, y = Y(v);
      g += '<line x1="' + PL + '" y1="' + y + '" x2="' + (W-PR) + '" y2="' + y + '" stroke="#EBE4D8" stroke-width="1"/>' +
           '<text x="' + (PL-6) + '" y="' + (y+3.5) + '" text-anchor="end" font-size="9" fill="#7A7268" font-family="DM Mono">' + v.toFixed(1) + '</text>';
    }
    // +0.5kg/月 參考線，從第一筆往後推
    const d0 = new Date(S[0].d + 'T12:00:00'), dN = new Date(S[S.length-1].d + 'T12:00:00');
    const days = (dN - d0) / 864e5;
    const tEnd = Math.min(S[0].w + .5 * (days / 30), D.goalW);
    if(tEnd <= hi){
      g += '<line x1="' + X(0) + '" y1="' + Y(S[0].w) + '" x2="' + X(S.length-1) + '" y2="' + Y(tEnd) + '" stroke="#D9A441" stroke-width="1.5" stroke-dasharray="4 3"/>';
    }
    if(D.goalW <= hi && D.goalW >= lo){
      g += '<line x1="' + PL + '" y1="' + Y(D.goalW) + '" x2="' + (W-PR) + '" y2="' + Y(D.goalW) + '" stroke="#4A7C59" stroke-width="1" stroke-dasharray="2 3" opacity=".6"/>' +
           '<text x="' + (W-PR) + '" y="' + (Y(D.goalW)-5) + '" text-anchor="end" font-size="9" fill="#4A7C59" font-family="DM Mono">目標 ' + D.goalW + '</text>';
    }
    let pth = ''; S.forEach((x,i) => { pth += (i ? ' L' : 'M') + X(i) + ' ' + Y(x.w); });
    g += '<path d="' + pth + '" fill="none" stroke="#4A7C59" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
    S.forEach((x,i) => { g += '<circle cx="' + X(i) + '" cy="' + Y(x.w) + '" r="3" fill="#fff" stroke="#4A7C59" stroke-width="2"/>'; });
    const lb = s => s.slice(5).replace('-','/');
    g += '<text x="' + X(0) + '" y="' + (H-5) + '" text-anchor="start" font-size="9" fill="#7A7268" font-family="DM Mono">' + lb(S[0].d) + '</text>';
    g += '<text x="' + X(S.length-1) + '" y="' + (H-5) + '" text-anchor="end" font-size="9" fill="#7A7268" font-family="DM Mono">' + lb(S[S.length-1].d) + '</text>';
    sv.innerHTML = g;
  }

  document.getElementById('s-now').textContent  = S.length ? r1(S[S.length-1].w) : '—';
  document.getElementById('s-chg').textContent  = '—';
  document.getElementById('s-rate').textContent = '—';
  if(S.length > 1){
    const ch = S[S.length-1].w - S[0].w;
    const dys = (new Date(S[S.length-1].d) - new Date(S[0].d)) / 864e5 || 1;
    document.getElementById('s-chg').textContent  = (ch >= 0 ? '+' : '') + r1(ch);
    document.getElementById('s-rate').textContent = (ch >= 0 ? '+' : '') + r1(ch / dys * 30);
  }

  // 近 14 天熱量
  const days14 = []; for(let i = 13; i >= 0; i--) days14.push(shift(today(), -i));
  const kv = days14.map(s => { const dd = D.days[s]; return dd ? dd.f.reduce((a,b) => a + b.k, 0) : 0; });
  const kc = document.getElementById('kchart');
  const KW = 340, KH = 130, KPB = 16, KPT = 8;
  const kmax = Math.max(D.targets.k * 1.25, ...kv, 100);
  const bw = (KW - 8) / 14;
  let kg = '';
  const ty = KPT + (1 - D.targets.k / kmax) * (KH - KPT - KPB);
  kg += '<line x1="0" y1="' + ty + '" x2="' + KW + '" y2="' + ty + '" stroke="#D9A441" stroke-width="1.5" stroke-dasharray="4 3"/>';
  kv.forEach((v,i) => {
    const h = v / kmax * (KH - KPT - KPB);
    const y = KH - KPB - h, x = 4 + i * bw;
    const col = v === 0 ? '#EBE4D8' : (v >= D.targets.k ? '#D9A441' : '#4A7C59');
    kg += '<rect x="' + (x+1.5) + '" y="' + (v ? y : KH-KPB-2) + '" width="' + (bw-3) + '" height="' + (v ? h : 2) + '" rx="2.5" fill="' + col + '"/>';
  });
  kg += '<text x="4" y="' + (KH-3) + '" font-size="9" fill="#7A7268" font-family="DM Mono">14天前</text>';
  kg += '<text x="' + (KW-4) + '" y="' + (KH-3) + '" text-anchor="end" font-size="9" fill="#7A7268" font-family="DM Mono">今天</text>';
  kc.innerHTML = kg;
  document.getElementById('kline').textContent = '目標 ' + D.targets.k;

  const last7 = kv.slice(-7).filter(v => v > 0);
  const p7 = days14.slice(-7).map(s => { const dd = D.days[s]; return dd ? dd.f.reduce((a,b) => a + b.p, 0) : 0; }).filter(v => v > 0);
  document.getElementById('s-avgk').textContent = last7.length ? r(last7.reduce((a,b) => a+b, 0) / last7.length) : '—';
  document.getElementById('s-avgp').textContent = p7.length ? r(p7.reduce((a,b) => a+b, 0) / p7.length) + 'g' : '—';
  const sur = last7.reduce((a,b) => a + (b - D.targets.k), 0);
  document.getElementById('s-sur').textContent = last7.length ? ((sur >= 0 ? '+' : '') + r(sur)) : '—';

  // InBody（用 slice 複製再排，別動到原陣列的順序）
  const il = document.getElementById('iblist'); il.innerHTML = '';
  const rows = D.inbody.slice().sort((a,b) => a.d < b.d ? 1 : -1);
  if(!rows.length) il.innerHTML = '<div class="empty">還沒有 InBody 紀錄</div>';
  rows.forEach(x => {
    const el = document.createElement('div'); el.className = 'ib';
    el.innerHTML = '<span>' + esc(x.d.slice(5)) + '</span><span>' + x.w + '</span>' +
      '<span class="smm">' + x.smm + '</span><span>' + x.pbf + '%</span>' +
      '<button class="del" aria-label="刪除">✕</button>';
    el.querySelector('.del').onclick = () => {
      D.inbody = D.inbody.filter(y => !(y.d === x.d && y.w === x.w && y.smm === x.smm));
      saveCfg(); renderTrend();
    };
    il.appendChild(el);
  });
}

function renderSet(){
  ['k','p','c','f','fi','su','na','sa','ch','po','wa'].forEach(x => {
    const el = document.getElementById('t-' + x);
    el.value = D.targets[x];
    el.onchange = () => { D.targets[x] = num(el.value, D.targets[x]) || D.targets[x]; saveCfg(); renderAll(); };
  });
  const gw = document.getElementById('t-gw');
  gw.value = D.goalW;
  gw.onchange = () => { D.goalW = num(gw.value, D.goalW) || D.goalW; saveCfg(); renderTrend(); };

  const pl = document.getElementById('prelist'); pl.innerHTML = '';
  if(!D.presets.length) pl.innerHTML = '<div class="empty">清單是空的，按上面的「＋ 新增」加一筆</div>';
  D.presets.forEach(pr => {
    const el = document.createElement('div'); el.className = 'fitem';
    el.innerHTML = '<button class="finfo"><div class="fn">' + esc(pr.n) + '</div>' +
      '<div class="fm">蛋白 ' + r1(pr.p) + '　碳水 ' + r1(pr.c) + '　脂肪 ' + r1(pr.f) +
      (D.freq[pr.id] ? '　·　用過 ' + D.freq[pr.id] + ' 次' : '') + '</div></button>' +
      '<div class="fk">' + r(pr.k) + '</div>' +
      '<button class="del" aria-label="刪除">✕</button>';
    el.querySelector('.finfo').onclick = () => editPreset(pr.id);
    el.querySelector('.del').onclick = () => removePreset(pr.id);
    pl.appendChild(el);
  });


  document.getElementById('a-key').value = D.api.key;
  document.getElementById('apiState').textContent = D.api.key ? '已設定' : '未設定';

  renderSuppEditor();

  const nDays = Object.keys(D.days).length;
  const nFood = Object.values(D.days).reduce((a,x) => a + x.f.length, 0);
  let bytes = 0;
  try { bytes = (localStorage.getItem(KEY) || '').length; } catch(e){}
  document.getElementById('dataStat').textContent = nDays + ' 天 / ' + nFood + ' 筆 / ' + Math.ceil(bytes/1024) + 'KB';
  document.getElementById('verLab').textContent = 'v' + APP_VER;
}

/* ============================================================
   底稿 modal
   ============================================================ */
const mask = document.getElementById('mask'), sheet = document.getElementById('sheet');
function openSheet(html){ sheet.innerHTML = html; mask.classList.add('on'); }
function closeSheet(){ mask.classList.remove('on'); }
mask.onclick = e => { if(e.target === mask) closeSheet(); };
document.addEventListener('keydown', e => { if(e.key === 'Escape' && mask.classList.contains('on')) closeSheet(); });

function foodForm(title, hint, v, onOk, extra, opts){
  opts = opts || {};
  const val = kk => (v[kk] === 0 || v[kk] ? esc(v[kk]) : '');
  openSheet(
    '<h3>' + esc(title) + '</h3><div class="hint">' + esc(hint) + '</div>' + (extra || '') +
    '<div class="field"><label for="i-n">名稱</label><input id="i-n" value="' + esc(v.n || '') + '"></div>' +
    '<div class="grid4">' +
      '<div class="field"><label for="i-k">熱量 kcal</label><input type="number" inputmode="decimal" id="i-k" value="' + val('k') + '"></div>' +
      '<div class="field"><label for="i-p">蛋白質 g</label><input type="number" inputmode="decimal" id="i-p" value="' + val('p') + '"></div>' +
      '<div class="field"><label for="i-c">碳水 g</label><input type="number" inputmode="decimal" id="i-c" value="' + val('c') + '"></div>' +
      '<div class="field"><label for="i-f">脂肪 g</label><input type="number" inputmode="decimal" id="i-f" value="' + val('f') + '"></div>' +
    '</div>' +
    '<details><summary>其他營養素（選填）</summary><div class="grid4" style="margin-top:8px">' +
      '<div class="field"><label for="i-sa">飽和脂肪 g</label><input type="number" inputmode="decimal" id="i-sa" value="' + val('sa') + '"></div>' +
      '<div class="field"><label for="i-ch">膽固醇 mg</label><input type="number" inputmode="decimal" id="i-ch" value="' + val('ch') + '"></div>' +
      '<div class="field"><label for="i-fi">纖維 g</label><input type="number" inputmode="decimal" id="i-fi" value="' + val('fi') + '"></div>' +
      '<div class="field"><label for="i-su">糖 g</label><input type="number" inputmode="decimal" id="i-su" value="' + val('su') + '"></div>' +
      '<div class="field"><label for="i-na">鈉 mg</label><input type="number" inputmode="decimal" id="i-na" value="' + val('na') + '"></div>' +
      '<div class="field"><label for="i-po">鉀 mg</label><input type="number" inputmode="decimal" id="i-po" value="' + val('po') + '"></div>' +
      '<div class="field"><label for="i-ca">鈣 mg</label><input type="number" inputmode="decimal" id="i-ca" value="' + val('ca') + '"></div>' +
      '<div class="field"><label for="i-fe">鐵 mg</label><input type="number" inputmode="decimal" id="i-fe" value="' + val('fe') + '"></div>' +
    '</div></details>' +
    '<div class="sheet-btns">' +
      (opts.onDelete ? '<button class="b-del" id="x-del">刪除</button>' : '') +
      '<button class="b-no" id="x-no">取消</button>' +
      '<button class="b-go" id="x-go">' + esc(opts.okText || '記錄') + '</button>' +
    '</div>'
  );
  document.getElementById('x-no').onclick = closeSheet;
  if(opts.onDelete) document.getElementById('x-del').onclick = () => { closeSheet(); opts.onDelete(); };
  document.getElementById('x-go').onclick = () => {
    const g = id => num(document.getElementById(id).value, 0);
    onOk({
      n: document.getElementById('i-n').value.trim() || '未命名',
      k:g('i-k'), p:g('i-p'), c:g('i-c'), f:g('i-f'), fi:g('i-fi'), su:g('i-su'),
      na:g('i-na'), sa:g('i-sa'), ch:g('i-ch'), po:g('i-po'), ca:g('i-ca'), fe:g('i-fe')
    });
    closeSheet();
  };
}

/* ============================================================
   AI 估算（透過自己的代理，前端不碰金鑰）
   ============================================================ */
let lastRaw = '';

/** 代理網址。沒填就用同網域的 /api/estimate（Cloudflare Pages Function 的位置）。 */
/* 這版沒有伺服器端代理——每個人用自己的 Gemini 金鑰，瀏覽器直接呼叫 Google。
   金鑰只存在自己這台裝置的 localStorage，不會經過任何第三方伺服器。 */
const GEMINI_MODEL = 'gemini-3.6-flash';

const AI_PROMPT =
  '你是營養分析助手。估算「整份」的營養值（不是每 100g）。' +
  '【最優先】照片裡如果有營養標示表，一律以標示的數字為準，絕對不要用外觀猜。' +
  '讀標示時先看「每一份量」和「本包裝含X份」：標示通常是每一份的量，' +
  '要乘以份數換算成整包；若標示只有「每 100 公克」，就用淨重換算。' +
  '這種情況 name 用包裝上的品名，note 寫「依包裝標示」。' +
  '照片裡沒有標示時才用外觀估計，並把看不見的用油和調味也估進去，note 寫估算依據。' +
  '所有數值都要是數字，不確定就給合理估計，不要留空。' +
  'name 用繁體中文並帶上份量，note 用 15 字內。' +
  '單位：kcal 大卡、protein/carbs/fat/satfat/fiber/sugar 公克、' +
  'chol/sodium/potassium/calcium 毫克、iron 毫克。' +
  '只回傳符合指定格式的 JSON，不要加任何說明文字。';

const NUM_T = {type:'number'};
const AI_SCHEMA = {
  type:'object',
  properties:{
    name:{type:'string'}, note:{type:'string'},
    kcal:NUM_T, protein:NUM_T, carbs:NUM_T, fat:NUM_T, satfat:NUM_T, chol:NUM_T,
    fiber:NUM_T, sugar:NUM_T, sodium:NUM_T, potassium:NUM_T, calcium:NUM_T, iron:NUM_T
  },
  required:['name','note','kcal','protein','carbs','fat','satfat','chol',
            'fiber','sugar','sodium','potassium','calcium','iron']
};

async function askProxy(payload){
  const key = (D.api.key || '').trim();
  if(!key) throw new Error('還沒設定金鑰。到「設定 → AI 估算」填入你自己的 Gemini 金鑰，可以免費申請。');

  let parts;
  if(payload.mode === 'photo')
    parts = [{inline_data:{mime_type:'image/jpeg', data:payload.image}},
             {text: AI_PROMPT + '\n\n估算這張照片裡食物的營養值。'}];
  else
    parts = [{text: AI_PROMPT + '\n\n食物：' + String(payload.text || '').slice(0,500)}];

  let res, data;
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' +
                      GEMINI_MODEL + ':generateContent', {
      method:'POST',
      headers:{'content-type':'application/json', 'x-goog-api-key':key},
      body: JSON.stringify({contents:[{role:'user', parts}],
        generationConfig:{responseMimeType:'application/json', responseSchema:AI_SCHEMA}})
    });
    data = await res.json();
  } catch(e){ throw new Error('連不到 Gemini，檢查一下網路。'); }

  lastRaw = JSON.stringify(data).slice(0, 600);

  if(!res.ok || data.error){
    const m = (data && data.error && data.error.message) || ('HTTP ' + res.status);
    if(res.status === 400 && /API.?key|credential/i.test(m))
      throw new Error('金鑰不正確，到「設定 → AI 估算」重新檢查。');
    if(res.status === 403) throw new Error('這把金鑰沒有權限或已停用，重新申請一把。');
    if(res.status === 429) throw new Error('超過免費額度了，等一下再試。');
    throw new Error('Gemini 回報錯誤：' + m);
  }
  if(data.promptFeedback && data.promptFeedback.blockReason)
    throw new Error('模型拒絕分析這張圖片，換一張或改用文字描述。');

  const cand = (data.candidates || [])[0];
  if(cand && cand.finishReason === 'MAX_TOKENS') throw new Error('回應被截斷，再試一次。');
  const txt = ((cand && cand.content && cand.content.parts) || [])
    .map(p => p.text || '').join('').trim();
  if(!txt) throw new Error('模型沒有回傳內容');
  try { return JSON.parse(txt); }
  catch(e){ throw new Error('模型回傳的不是 JSON：' + txt.slice(0,80)); }
}


function showResult(j, badge){
  const N = x => { const v = parseFloat(x); return isFinite(v) ? v : 0; };
  foodForm('確認記錄', '數字可以直接改，改完再記錄。',
    {n: j.name || '食物', k: r(N(j.kcal)), p: r1(N(j.protein)), c: r1(N(j.carbs)), f: r1(N(j.fat)),
     sa: r1(N(j.satfat)), ch: r(N(j.chol)), fi: r1(N(j.fiber)), su: r1(N(j.sugar)),
     na: r(N(j.sodium)), po: r(N(j.potassium)), ca: r(N(j.calcium)), fe: r1(N(j.iron))},
    o => { addFood(o); renderToday(); },
    '<div class="aiwarn">' + badge + ' ' + esc(j.note || '估算值') + '<br>誤差約 ±20–30%，看不到用油和調味。</div>');
}

function showFail(msg){
  openSheet(
    '<h3>分析失敗</h3><div class="err">' + esc(msg) + '</div>' +
    '<div class="hint">改用文字描述通常最快，例如「香菇竹筍粥 一盒約400克」。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">關閉</button><button class="b-go" id="x-t">用文字描述</button></div>' +
    '<details><summary>技術細節（回報用）</summary>' +
    '<div style="font-size:10px;font-family:monospace;color:var(--soft);word-break:break-all;margin-top:6px">' +
    esc(lastRaw || '（沒有收到回應）') + '</div></details>'
  );
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-t').onclick = textEstimate;
}

function textEstimate(){
  openSheet(
    '<h3>用文字描述</h3><div class="hint">寫出食物和大概份量，越具體越準。</div>' +
    '<div class="field"><label for="t-desc">描述</label><input id="t-desc" placeholder="例：香菇竹筍粥 一盒約400克"></div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">自己填數字</button><button class="b-go" id="x-go">估算</button></div>'
  );
  document.getElementById('x-no').onclick = () =>
    foodForm('手動輸入', '照食物標示填。', {}, o => { addFood(o); renderToday(); });
  document.getElementById('x-go').onclick = async () => {
    const q = document.getElementById('t-desc').value.trim();
    if(!q) return;
    openSheet('<div class="loading"><div class="spin"></div><div style="font-size:14px;font-weight:700">估算中⋯</div></div>');
    try { showResult(await askProxy({mode:'text', text:q}), '✏️'); }
    catch(err){ showFail(err.message || '未知錯誤'); }
  };
}

document.getElementById('manBtn').onclick = textEstimate;
document.getElementById('camBtn').onclick = () => document.getElementById('fileIn').click();

document.getElementById('fileIn').onchange = async e => {
  const file = e.target.files[0];
  if(!file) return;
  e.target.value = '';
  openSheet('<div class="loading"><div class="spin"></div><div style="font-size:14px;font-weight:700">分析中⋯</div>' +
            '<div style="font-size:12px;color:var(--soft);margin-top:4px">估算這份的熱量和營養素</div></div>');
  try {
    let j = null, err = null;
    for(const px of [720, 480, 360]){          // 逐級縮小重試，網路差時比較容易過
      try {
        const b64 = await shrink(file, px, px >= 720 ? 0.68 : px >= 480 ? 0.58 : 0.45);
        j = await askProxy({mode:'photo', image:b64});
        break;
      } catch(er){
        err = er;
        // 設定錯誤或認證失敗，重試也沒用
        if(/代理網址|通行碼|網域|太頻繁/.test(er.message)) break;
        await new Promise(rs => setTimeout(rs, 600));
      }
    }
    if(!j) throw err || new Error('未知錯誤');
    showResult(j, '📷');
  } catch(err){ showFail((err && err.message) || '未知錯誤'); }
};

function shrink(file, maxPx, q){
  return new Promise((ok, no) => {
    const img = new Image(), rd = new FileReader();
    rd.onload = () => { img.src = rd.result; };
    rd.onerror = () => no(new Error('讀不到這個檔案，換一張試試'));
    img.onload = () => {
      const M = maxPx || 720;
      let w = img.width, h = img.height;
      if(!w || !h) return no(new Error('圖片尺寸讀不到（可能是 HEIC 格式）'));
      if(w > M || h > M){ const sc = M / Math.max(w, h); w = Math.round(w*sc); h = Math.round(h*sc); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);
      const b64 = (cv.toDataURL('image/jpeg', q || 0.68).split(',')[1]) || '';
      if(b64.length < 800) return no(new Error('圖片轉檔後是空的，換一張試試'));
      ok(b64);
    };
    img.onerror = () => no(new Error('這張圖瀏覽器打不開（可能是 HEIC），請改存成 JPG'));
    rd.readAsDataURL(file);
  });
}

/* ---------- 體重 ---------- */
function saveWeight(){
  const v = num(document.getElementById('win').value, 0);
  if(!v || v === day(cur).w) return;
  day(cur).w = v; saveDay(); renderToday();
}
document.getElementById('wsave').onclick = saveWeight;
// 打完數字直接切走也會存，不用非按「記錄」不可（change 在失焦時就會觸發）
document.getElementById('win').onchange = saveWeight;

/* ---------- 喝水 ---------- */
function addWater(ml){
  const d = day(cur);
  d.wa = Math.max(0, d.wa + ml);
  saveDay(); renderToday();
}
function askWater(){
  openSheet(
    '<h3>自訂水量</h3>' +
    '<div class="hint">輸入這次喝的量，想扣掉就填負數（例如 -250）。</div>' +
    '<div class="grid2"><div class="field"><label for="wa-v">毫升 ml</label>' +
    '<input type="number" inputmode="numeric" id="wa-v" value="300"></div></div>' +
    '<div class="sheet-btns"><button class="b-no" id="wa-no">取消</button>' +
    '<button class="b-go" id="wa-go">加入</button></div>'
  );
  document.getElementById('wa-no').onclick = closeSheet;
  document.getElementById('wa-go').onclick = () => {
    const v = num(document.getElementById('wa-v').value, 0);
    closeSheet();
    if(v) addWater(v);
  };
}
document.getElementById('wa250').onclick = () => addWater(250);
document.getElementById('wa500').onclick = () => addWater(500);
document.getElementById('waCus').onclick = askWater;
document.getElementById('waRst').onclick = () => {
  if(!day(cur).wa) return;
  day(cur).wa = 0; saveDay(); renderToday();
};

/* ---------- InBody ---------- */
document.getElementById('addIb').onclick = () => {
  openSheet(
    '<h3>新增 InBody</h3><div class="hint">量完填進來，追蹤骨骼肌的變化。</div>' +
    '<div class="field"><label for="ib-d">日期</label><input type="date" id="ib-d" value="' + today() + '"></div>' +
    '<div class="grid4">' +
      '<div class="field"><label for="ib-w">體重 kg</label><input type="number" inputmode="decimal" id="ib-w"></div>' +
      '<div class="field"><label for="ib-s">骨骼肌重 kg</label><input type="number" inputmode="decimal" id="ib-s"></div>' +
      '<div class="field"><label for="ib-p">體脂率 %</label><input type="number" inputmode="decimal" id="ib-p"></div>' +
    '</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-go" id="x-go">儲存</button></div>'
  );
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    const dv = document.getElementById('ib-d').value || today();
    D.inbody.push({d: dv,
      w: num(document.getElementById('ib-w').value, 0),
      smm: num(document.getElementById('ib-s').value, 0),
      pbf: num(document.getElementById('ib-p').value, 0)});
    saveCfg(); closeSheet(); renderTrend();
  };
};

/* ---------- 常吃清單編輯 ---------- */
function editPreset(id){
  const pr = D.presets.find(x => x.id === id);
  if(!pr) return;
  foodForm('編輯常吃項目', '改完之後，之前已經記錄的不受影響。', pr,
    o => {
      Object.assign(pr, o);          // 保留 id，才不會弄丟使用次數
      saveCfg(); renderAll();
    },
    '', {okText:'儲存', onDelete: () => removePreset(id)});
}

function removePreset(id){
  const pr = D.presets.find(x => x.id === id);
  if(!pr) return;
  openSheet('<h3>刪除常吃項目</h3>' +
    '<div class="hint">要把「<b>' + esc(pr.n) + '</b>」從常吃清單移除嗎？<br>' +
    '已經記錄過的紀錄不會被動到。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-del" id="x-go">刪除</button></div>');
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    D.presets = D.presets.filter(x => x.id !== id);
    delete D.freq[id];
    saveCfg(); closeSheet(); renderAll();
    toast('已刪除「' + pr.n + '」');
  };
}

document.getElementById('preReset').onclick = () => {
  openSheet('<h3>還原預設常吃清單</h3>' +
    '<div class="hint">把清單換回出廠的 12 筆，你新增或改過的會不見。<br>' +
    '已經記錄的歷史資料不受影響。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-del" id="x-go">還原</button></div>');
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    D.presets = clone(DEFAULT_PRESETS); D.freq = {};
    saveCfg(); closeSheet(); renderAll();
    toast('已還原預設清單');
  };
};

/* ---------- 保健品組合編輯 ---------- */
function renderSuppEditor(){
  const box = document.getElementById('suppedit');
  if(!box) return;
  box.innerHTML = '';
  D.supps.forEach(s => {
    const el = document.createElement('button');
    el.className = 'fitem' + (s.off ? ' dim' : '');
    el.style.width = '100%';
    el.innerHTML = '<div style="text-align:left"><div class="fn">' + esc(s.n) + (s.off ? '（已停用）' : '') + '</div>' +
      '<div class="fm">' + esc(s.t) + '　' + s.foods.length + ' 品項　' +
      r(s.foods.reduce((a,b) => a + b.k, 0)) + ' kcal</div></div>' +
      '<div class="fk" style="color:var(--soft);font-size:12px">編輯</div><span class="spacer"></span>';
    el.onclick = () => editSupp(s.id);
    box.appendChild(el);
  });
}

function editSupp(id){
  const s = D.supps.find(x => x.id === id);
  if(!s) return;
  const vitRows = VITS.map(v =>
    '<div class="field"><label for="mi-' + v[0] + '">' + v[1] + ' %</label>' +
    '<input type="number" inputmode="decimal" id="mi-' + v[0] + '" value="' +
    (s.mi[v[0]] ? esc(s.mi[v[0]]) : '') + '"></div>').join('');

  openSheet(
    '<h3>編輯保健品組</h3><div class="hint">改完按儲存。停用的組不會出現在「今天」那一頁。</div>' +
    '<div class="field"><label for="sp-t">時段</label><input id="sp-t" value="' + esc(s.t) + '" placeholder="例：早餐"></div>' +
    '<div class="field"><label for="sp-n">說明</label><input id="sp-n" value="' + esc(s.n) + '" placeholder="例：蛋白素 2 匙 ＋ 鈣 2 錠"></div>' +
    '<label class="chkrow"><input type="checkbox" id="sp-off"' + (s.off ? ' checked' : '') + '><span>停用這一組</span></label>' +
    '<div class="subhead">品項（打勾時會自動記進當天）</div>' +
    '<div id="sp-foods"></div>' +
    '<button class="minibtn" id="sp-add" style="margin-top:8px">＋ 新增品項</button>' +
    '<details style="margin-top:10px"><summary>維他命礦物質貢獻（%）</summary>' +
    '<div class="hint" style="margin:8px 0">照產品標示填每份提供的每日建議攝取量百分比，留空當 0。</div>' +
    '<div class="grid4">' + vitRows + '</div></details>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-go" id="x-go">儲存</button></div>'
  );

  // 品項在暫存陣列上編輯，按取消就整個丟掉
  let draft = clone(s.foods);
  function drawFoods(){
    const fb = document.getElementById('sp-foods');
    fb.innerHTML = '';
    if(!draft.length) fb.innerHTML = '<div class="empty" style="padding:14px">還沒有品項</div>';
    draft.forEach((fo, i) => {
      const row = document.createElement('div'); row.className = 'fitem';
      row.innerHTML = '<button class="finfo"><div class="fn">' + esc(fo.n) + '</div>' +
        '<div class="fm">蛋白 ' + r1(fo.p) + '　碳水 ' + r1(fo.c) + '　脂肪 ' + r1(fo.f) + '</div></button>' +
        '<div class="fk">' + r(fo.k) + '</div><button class="del" aria-label="刪除">✕</button>';
      row.querySelector('.finfo').onclick = () => {
        const keep = grabForm();
        foodForm('編輯品項', '這一項的營養值。', fo,
          o => { draft[i] = Object.assign({}, draft[i], o); reopen(keep, draft); },
          '', {okText:'儲存', onDelete: () => { draft.splice(i,1); reopen(keep, draft); }});
      };
      row.querySelector('.del').onclick = () => { draft.splice(i,1); drawFoods(); };
      fb.appendChild(row);
    });
  }
  function grabForm(){
    return {t: document.getElementById('sp-t').value,
            n: document.getElementById('sp-n').value,
            off: document.getElementById('sp-off').checked,
            mi: VITS.reduce((a,v) => {
              const x = num(document.getElementById('mi-' + v[0]).value, 0);
              if(x) a[v[0]] = x; return a; }, {})};
  }
  // 開子表單會蓋掉這張，所以先把欄位值存起來，回來時原樣重開
  function reopen(keep, foods){
    Object.assign(s, keep, {foods: foods});
    editSupp(id);
  }
  drawFoods();

  document.getElementById('sp-add').onclick = () => {
    const keep = grabForm();
    foodForm('新增品項', '照產品標示填。', {},
      o => { draft.push(o); reopen(keep, draft); });
  };
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    Object.assign(s, grabForm(), {foods: draft});
    D = normalize(D);
    saveCfg(); closeSheet(); renderAll();
    toast('已更新保健品組');
  };
}

document.getElementById('suppReset').onclick = () => {
  openSheet('<h3>還原預設保健品</h3>' +
    '<div class="hint">會把 5 組保健品換回出廠設定，你改過的內容會不見。<br>已經記錄的歷史資料不受影響。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-del" id="x-go">還原</button></div>');
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    D.supps = clone(DEFAULT_SUPPS);
    saveCfg(); closeSheet(); renderAll();
    toast('已還原預設');
  };
};

document.getElementById('copyPrev').onclick = copyPrevDay;

document.getElementById('chipq').oninput = e => {
  chipQuery = e.target.value;
  renderToday();
  const box = document.getElementById('chipq');
  box.value = chipQuery;          // renderToday 不動這個欄位，保險起見同步一次
  box.focus();
};

document.getElementById('addPre').onclick = () =>
  foodForm('新增常吃項目', '存起來之後一鍵記錄。', {}, o => {
    D.presets.push(Object.assign({id: 'u' + Date.now()}, o));
    saveCfg(); renderAll();
  });

/* ============================================================
   匯出 / 匯入
   ============================================================ */
function download(name, text, mime){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 手機上先叫原生分享選單（AirDrop、儲存到檔案、LINE 都在裡面），
 *  電腦或不支援的瀏覽器才退回一般下載。
 *  純用 a[download] 的話 iOS 只會存進「檔案 App → 下載項目」，
 *  要 AirDrop 還得自己去 Files 長按分享，多繞兩步。 */
async function exportFile(name, text, mime){
  try {
    if(navigator.share && navigator.canShare){
      const file = new File([text], name, {type: mime});
      if(navigator.canShare({files: [file]})){
        await navigator.share({files: [file], title: name});
        return 'shared';
      }
    }
  } catch(e){
    // 使用者在分享選單按取消也會拋錯，這時不要再彈一次下載，不然很莫名
    if(e && e.name === 'AbortError') return 'cancelled';
  }
  download(name, text, mime);
  return 'downloaded';
}

document.getElementById('expBtn').onclick = () => {
  const rows = ['日期,體重kg,喝水ml,熱量,蛋白質g,碳水g,脂肪g,飽和脂肪g,膽固醇mg,纖維g,糖g,鈉mg,鉀mg,鈣mg,鐵mg,保健品完成,品項'];
  Object.keys(D.days).sort().forEach(s => {
    const d = D.days[s];
    const S = kk => d.f.reduce((a,b) => a + (b[kk] || 0), 0);
    const sc = suppsFor(d).filter(x => d.s[x.id]).length;
    rows.push([s, d.w || '', r(d.wa || 0), r(S('k')), r1(S('p')), r1(S('c')), r1(S('f')), r1(S('sa')), r(S('ch')),
      r1(S('fi')), r1(S('su')), r(S('na')), r(S('po')), r(S('ca')), r1(S('fe')),
      sc + '/' + supps().length, '"' + d.f.map(x => x.n).join('、').replace(/"/g,'""') + '"'].join(','));
  });
  rows.push('', 'InBody日期,體重,骨骼肌重,體脂率');
  D.inbody.slice().sort((a,b) => a.d < b.d ? -1 : 1).forEach(x => rows.push([x.d,x.w,x.smm,x.pbf].join(',')));
  exportFile('營養紀錄_' + today() + '.csv', '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
};

document.getElementById('jsonExp').onclick = async () => {
  const payload = {_app:'nutri-tracker', _ver:APP_VER, _exported:new Date().toISOString(), data:D};
  const how = await exportFile('營養追蹤_備份_' + today() + '.json',
                              JSON.stringify(payload, null, 2), 'application/json');
  if(how === 'cancelled') return;
  toast(how === 'shared' ? '備份已送出' : '已匯出備份');
};

document.getElementById('jsonImp').onclick = () => document.getElementById('jsonFile').click();
document.getElementById('jsonFile').onchange = e => {
  const file = e.target.files[0];
  if(!file) return;
  e.target.value = '';
  const rd = new FileReader();
  rd.onload = () => {
    let incoming;
    try {
      const j = JSON.parse(rd.result);
      incoming = (j && j.data && typeof j.data === 'object') ? j.data : j;   // 也吃直接是 D 的檔案
      if(!incoming || typeof incoming !== 'object' || !incoming.days)
        throw new Error('看起來不是這個 App 的備份檔');
    } catch(err){
      openSheet('<h3>匯入失敗</h3><div class="err">' + esc(err.message) + '</div>' +
        '<div class="sheet-btns"><button class="b-no" id="x-no">關閉</button></div>');
      document.getElementById('x-no').onclick = closeSheet;
      return;
    }
    const nDays = Object.keys(incoming.days || {}).length;
    const curDays = Object.keys(D.days).length;
    openSheet(
      '<h3>確認匯入</h3>' +
      '<div class="hint">備份檔有 <b>' + nDays + '</b> 天的紀錄，目前手機上有 <b>' + curDays + '</b> 天。<br>' +
      '匯入會<b>整個覆蓋</b>現有資料，這個動作無法復原。</div>' +
      '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-go" id="x-go">覆蓋匯入</button></div>'
    );
    document.getElementById('x-no').onclick = closeSheet;
    document.getElementById('x-go').onclick = () => {
      D = normalize(deepMerge(DEFAULTS, incoming));
      doSave(); closeSheet(); cur = today(); renderAll();
      toast('已匯入 ' + nDays + ' 天的紀錄');
    };
  };
  rd.onerror = () => toast('讀不到這個檔案', 'fail');
  rd.readAsText(file);
};

/* ---------- 範例資料 / 清空 ---------- */
document.getElementById('seedBtn').onclick = () => {
  const k = today();
  openSheet('<h3>載入範例資料</h3><div class="hint">會把 <b>' + pretty(k) +
    '</b> 覆蓋成一天的示範紀錄，只是用來看畫面長怎樣。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-go" id="x-go">載入</button></div>');
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    const mk = (o, meal, tag) => Object.assign(
      {n:'', k:0, p:0, c:0, f:0, fi:0, su:0, na:0, sa:0, ch:0, po:0, ca:0, fe:0, va:0, vc:0},
      o, {m: meal, tag: tag || ''});
    D.days[k] = {
      w: 55, wa: 1500, s: {s1:true}, sn: {},
      f: [
        mk({n:'綜合維他命 1 錠'}, 'sup', 'sup:s1'),
        mk({n:'燕麥片 40g', k:150, p:5.3, c:27, f:3.2, fi:4, su:.5, na:4, ca:20, fe:1.7}, 'b'),
        mk({n:'無糖豆漿 400ml', k:128, p:12, c:6, f:6.4, fi:1.2, na:40, ca:40, po:340}, 'b'),
        mk({n:'香蕉 1 根', k:105, p:1.3, c:27, f:.4, fi:3.1, su:14, na:1, po:420}, 'b'),
        mk({n:'雞胸肉 100g（去皮）', k:110, p:23, f:1.5, na:45, ch:70, po:300}, 'l'),
        mk({n:'白飯 1 碗', k:280, p:5.2, c:62, f:.6, fi:.6, na:2}, 'l'),
        mk({n:'無糖優格 100g', k:60, p:5.5, c:5, f:2, su:5, na:40, ca:150}, 'sn')
      ]
    };
    D = normalize(D);
    saveDay(k); closeSheet(); cur = k; renderAll();
    toast('已載入範例資料');
  };
};

document.getElementById('wipeBtn').onclick = () => {
  openSheet('<h3>清空所有資料</h3>' +
    '<div class="err">所有紀錄、常吃清單、InBody 都會消失，無法復原。</div>' +
    '<div class="hint">建議先匯出 JSON 備份再清空。</div>' +
    '<div class="sheet-btns"><button class="b-no" id="x-no">取消</button><button class="b-del" id="x-go">確定清空</button></div>');
  document.getElementById('x-no').onclick = closeSheet;
  document.getElementById('x-go').onclick = () => {
    const api = clone(D.api);          // 代理設定留著，不然還要再填一次
    D = normalize(clone(DEFAULTS)); D.api = api;
    doSave(); closeSheet(); cur = today(); renderAll();
    toast('已清空');
  };
};

/* ---------- AI 設定 ---------- */
document.getElementById('a-key').onchange = e => {
  D.api.key = e.target.value.trim(); save(); renderSet();
};
document.getElementById('apiClear').onclick = () => {
  D.api = {key:''}; save(); renderSet(); toast('已清除金鑰');
};
document.getElementById('apiTest').onclick = async () => {
  D.api.key = document.getElementById('a-key').value.trim();
  save();
  if(!D.api.key){ toast('請先填入金鑰', 'fail'); return; }
  toast('測試中⋯', 'info');
  try {
    const j = await askProxy({mode:'text', text:'水煮蛋 1 顆'});
    toast('連線成功：' + (j.name || '有回應') + ' ' + r(num(j.kcal,0)) + ' kcal');
  } catch(e){ toast(e.message, 'fail'); }
  renderSet();
};

/* 加到主畫面後 App 常駐記憶體，隔天再打開如果不重新判斷，
   會停在昨天的日期上。回到前景時檢查一次。 */
let lastKnownDay = today();
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  const t = today();
  if(t !== lastKnownDay){
    if(cur === lastKnownDay) cur = t;      // 本來停在「今天」才自動跟著跳
    lastKnownDay = t;
    renderAll();
  }
});

/* ============================================================
   Service Worker
   ============================================================ */
if('serviceWorker' in navigator){
  // 這次載入之前就已經有 SW 在管，才算「更新」。
  // 第一次安裝時 clients.claim() 也會觸發 controllerchange，
  // 沒這個判斷會白白重整一次，畫面閃一下。
  const hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update();          // 每次開 App 主動問一次有沒有新版
    }).catch(() => {});      // file:// 或不支援時安靜略過
  });

  // 新版 SW 現在會自己接手（sw.js 的 install 直接 skipWaiting），
  // 這裡收到通知就重整，讓畫面換成新版的 CSS/JS，不用使用者點任何東西。
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

/* 請瀏覽器把這份資料標記為「持久儲存」，降低長時間沒開 App 時
   被系統自動清掉的機率（iOS Safari 對久未使用的網站有較激進的清理）。
   不保證一定有效，只是能免費多一層保障，失敗就算了。 */
if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- 啟動 ---------- */
load();
renderAll();
