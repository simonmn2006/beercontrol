console.log("🚀 BeerControl Runtime Initialized");

/* ══════════════════════════════════════════
   MOCK DATA
══════════════════════════════════════════ */
const USERS={};
const KEGS=[];
const USER_KEGS=[];

// SCHED is now empty by default, will be fetched from DB
const SCHED = [];

/* ══════════════════════════════════════════
   CORE STATE
══════════════════════════════════════════ */
let lang='en', currentPage='', currentRole='', charts={};
const t=k=>(TR[lang]&&TR[lang][k])||TR.en[k]||k;

function setLang(l){
  lang=l; localStorage.setItem('bc_lang',l);
  const sel=document.getElementById('langSelect');
  if(sel) sel.value=l;
  applyI18n();
  const sub=document.getElementById('lg-tagline');
  if(sub) sub.textContent=t('tagline');
  const le=document.getElementById('lg-lbl-email');
  if(le) le.textContent=t('email');
  const lp=document.getElementById('lg-lbl-pass');
  if(lp) lp.textContent=t('password');
  const lb=document.getElementById('lg-btn');
  if(lb) lb.textContent=t('signin');
}

function applyI18n(){
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const v=t(el.getAttribute('data-i18n'));
    if(v) el.textContent=v;
  });
}

/* ══════════════════════════════════════════
   LOGIN
══════════════════════════════════════════ */
async function doLogin(){
  const email=document.getElementById('lg-email').value.trim().toLowerCase();
  const pass=document.getElementById('lg-pass').value;
  const errEl=document.getElementById('lg-err');
  
  const btn = document.getElementById('lg-btn');
  const oldText = btn.textContent;
  
  if(!email || !pass) {
    errEl.textContent = 'Please enter email and password';
    errEl.style.display = 'block';
    return;
  }

  // Visual feedback
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  errEl.style.display = 'none';
  document.getElementById('lg-email').classList.remove('err');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const d = await res.json();
    if(!d.success){
      btn.disabled = false;
      btn.textContent = oldText;
      errEl.textContent = d.error === 'invalid_credentials' ? 'Invalid username or password' : (t(d.error) || 'Login failed');
      errEl.style.display = 'block';
      document.getElementById('lg-email').classList.add('err');
      return;
    }
    // Success - reload /app to get clean state
    window.location.href = '/app';
  } catch(e) {
    btn.disabled = false;
    btn.textContent = oldText;
    errEl.textContent = 'Network error — Is the server running?';
    errEl.style.display = 'block';
  }
}

async function checkSession(){
  try {
    const res = await fetch('/api/me');
    const d = await res.json();
    if(d.loggedIn){
      const u = d.user;
      document.getElementById('loginPage').style.display='none';
      document.getElementById('app').style.display='block';
      currentRole=u.role;
      document.getElementById('av').textContent=u.name.charAt(0);
      document.getElementById('uname').textContent=u.name;
      document.getElementById('uemail').textContent=u.role==='admin'?u.email:u.restaurant;
      document.getElementById('urole').textContent=u.role==='admin'?'Admin':t('active');
      document.getElementById('urole').className='role-badge '+(u.role==='admin'?'admin':'user');
      
      if(u.role==='admin'){
        document.getElementById('navAdmin').style.display='flex';
        document.getElementById('navUser').style.display='none';
        nav('adminDash',document.querySelector('#navAdmin .nav-item'));
      } else {
        document.getElementById('navAdmin').style.display='none';
        document.getElementById('navUser').style.display='flex';
        nav('userDash',document.querySelector('#navUser .nav-item'));
      }
      applyI18n();
      buildKegGrids();
      buildSchedule();
      setTimeout(initCharts,100);
      startMqttFeed();
    } else {
      document.getElementById('loginPage').style.display='flex';
      document.getElementById('app').style.display='none';
    }
  } catch(e){
    console.error('Session check failed', e);
  }
}

// Check session on load
window.addEventListener('DOMContentLoaded', checkSession);


function doLogout(){
  document.getElementById('app').style.display='none';
  document.getElementById('loginPage').style.display='flex';
  document.getElementById('lg-email').value='';
  document.getElementById('lg-pass').value='';
  document.getElementById('lg-err').style.display='none';
}

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('loginPage').style.display!=='none')doLogin();});

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
function nav(pageId,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const p=document.getElementById('page-'+pageId);
  if(p) p.classList.add('active');
  if(el) el.classList.add('active');
  currentPage=pageId;
  const titles={adminDash:t('nav_dashboard'),adminRestaurants:t('nav_restaurants'),adminKegs:t('nav_kegs'),adminUsers:t('nav_users'),adminAlerts:t('nav_alerts'),adminDevices:t('nav_devices'),adminMqtt:t('nav_mqtt'),adminRestaurantDetail:'Restaurant',adminBeerLibrary:t('nav_beer_library'),adminBilling:t('nav_billing'),adminAudit:t('nav_audit'),adminSettings:t('nav_settings'),userDash:t('nav_live'),userKegs:t('nav_kegs'),userReports:t('nav_reports'),userAlerts:t('nav_alerts'),userCosts:t('nav_costs'),userForecast:t('nav_forecast'),userKiosk:t('nav_kiosk'),userCalibration:t('nav_calibration'),userSettings:t('nav_settings')};
  document.getElementById('topTitle').textContent=titles[pageId]||pageId;
  if(pageId==='userReports')   setTimeout(initReportCharts,120);
  if(pageId==='userForecast')  { setTimeout(()=>{ buildForecastPage(); setTimeout(initForecastChart,100); },50); }
  if(pageId==='adminBilling')  setTimeout(initBillingChart,100);
  if(pageId==='userCosts')     setTimeout(initCostCharts,100);
  if(pageId==='adminAudit')    setTimeout(buildAuditLog,50);
  if(pageId==='userCalibration') setTimeout(buildCalibration,50);
  if(pageId==='userKiosk')     { setTimeout(()=>{ buildKioskPreview(); startKioskAutoRefresh(); },50); }
}

/* ══════════════════════════════════════════
   BUILD KEG GRIDS
══════════════════════════════════════════ */
function kegCard(k,clickable=true){
  const pct=k.size>0?(k.rem/k.size*100):0;
  const fill=pct<=10?'fill-red':pct<=20?'fill-amber':'fill-green';
  const cls=pct<=10?'critical':pct<=20?'warning':'';
  const badge=pct<=10?`<span class="keg-badge badge-crit">${t('critical')}</span>`:
               k.fob?`<span class="keg-badge badge-fob">FOB ON</span>`:
               pct>90?`<span class="keg-badge badge-new">${t('fresh')}</span>`:'';
  return `<div class="keg-card ${cls}" ${clickable?`onclick="openEditKeg(${k.id})"`:'style="cursor:default"'}>
    ${badge}
    <div class="keg-top">
      <div><div class="keg-name">${k.name}</div><div class="keg-sub">${k.rest?k.rest+' · ':''}Tap #${k.tap}</div></div>
      <div class="keg-logo">${k.emoji}</div>
    </div>
    <div class="prog-wrap">
      <div class="prog-label"><span>${t('remaining')}</span><strong>${k.rem.toFixed(1)} / ${k.size} L</strong></div>
      <div class="prog-bar"><div class="prog-fill ${fill}" style="width:${Math.max(0,Math.min(100,pct)).toFixed(1)}%"></div></div>
    </div>
    <div class="keg-stats">
      <div class="keg-stat"><div class="ks-label">${t('poured')}</div><div class="ks-val">${k.poured.toFixed(1)}L</div></div>
      <div class="keg-stat"><div class="ks-label">${t('temp')}</div><div class="ks-val">${k.temp}°C</div></div>
      <div class="keg-stat"><div class="ks-label">CO₂</div><div class="ks-val">${k.co2} bar</div></div>
    </div>
  </div>`;
}

function buildKegGrids(){
  const g=document.getElementById('kegGrid');
  if(g) g.innerHTML=KEGS.map(k=>kegCard(k)).join('')+`<div class="keg-card" style="border-style:dashed;opacity:.5;cursor:default"><div style="min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text3)"><div style="font-size:32px">+</div><div class="ks-label">${t('add_keg')}</div></div></div>`;
  const ug=document.getElementById('userKegGrid');
  if(ug) ug.innerHTML=USER_KEGS.map(k=>kegCard(k,true)).join('');
  const ud=document.getElementById('userKegsDetail');
  if(ud) ud.innerHTML=USER_KEGS.map(k=>kegCard(k,true)).join('');
}

function openEditKeg(id){
  const k=KEGS.find(x=>x.id===id)||USER_KEGS.find(x=>x.id===id);
  if(!k) return;
  document.getElementById('editKegTitle').textContent=k.name+' · Tap #'+k.tap;
  document.getElementById('ek-rem').textContent=k.rem.toFixed(1)+'L';
  document.getElementById('ek-temp').textContent=k.temp+'°C';
  document.getElementById('ek-co2').textContent=k.co2;
  document.getElementById('ek-name').value=k.name;
  document.getElementById('ek-size').value=k.size;
  openM('mEditKeg');
}

/* ══════════════════════════════════════════
   SCHEDULE
══════════════════════════════════════════ */
function buildSchedule(){
  const el = document.getElementById('schedBlock') || document.getElementById('scheduleContainer');
  if(!el) return;
  el.innerHTML = SCHED.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border)">
      <div style="width:100px;font-weight:500;color:var(--text1)">${t(s.day)}</div>
      <label class="switch"><input type="checkbox" ${s.on?'checked':''}><span class="slider"></span></label>
      <div style="flex:1"></div>
      <input type="time" value="${s.open}" style="width:110px" ${s.on?'':'disabled'}>
      <span style="color:var(--text3)">→</span>
      <input type="time" value="${s.close}" style="width:110px" ${s.on?'':'disabled'}>
    </div>`).join('');
}

/* ══════════════════════════════════════════
   MODALS
══════════════════════════════════════════ */
function openM(id){document.getElementById(id)?.classList.add('open')}
function closeM(id){document.getElementById(id)?.classList.remove('open')}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open')});
document.addEventListener('click',e=>{
  if(!e.target.closest('#ak-beer-search')&&!e.target.closest('#ak-beer-dropdown')){
    const dd=document.getElementById('ak-beer-dropdown');if(dd)dd.style.display='none';
  }
  if(!e.target.closest('#ek-beer-search')&&!e.target.closest('#ek-beer-dropdown')){
    const dd=document.getElementById('ek-beer-dropdown');if(dd)dd.style.display='none';
  }
});

/* ══════════════════════════════════════════
   RECIPIENT PILLS
══════════════════════════════════════════ */
function addRcpt(type){
  const inp=document.getElementById(type==='email'?'newEmail':'newTelegram');
  const list=document.getElementById(type==='email'?'emailList':'telegramList');
  const val=inp.value.trim();
  if(!val) return;
  if(list.querySelectorAll('.rcpt-pill').length>=5){toast(t('max_recipients'),'error');return;}
  const pill=document.createElement('span');
  pill.className='rcpt-pill';
  pill.innerHTML=`${val} <span class="rcpt-x" onclick="this.closest('.rcpt-pill').remove()">×</span>`;
  list.appendChild(pill);
  inp.value='';
  toast(t('saved'),'info');
}

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function toast(msg,type='info'){
  const icons={info:'🍺',success:'✔',error:'⚠'};
  const w=document.getElementById('toastWrap');
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span>${icons[type]}</span><span>${msg}</span>`;
  w.appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

/* ══════════════════════════════════════════
   CHARTS
══════════════════════════════════════════ */
const CO={plugins:{legend:{display:false}},scales:{x:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}},y:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}}},responsive:true,maintainAspectRatio:false};

function initCharts(){
  const c1=document.getElementById('chartAdmin');
  if(c1&&!charts.admin){
    charts.admin=new Chart(c1,{type:'bar',data:{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],datasets:[{data:[0,0,0,0,0,0,0],backgroundColor:'rgba(240,165,0,.15)',borderColor:'#f0a500',borderWidth:1.5,borderRadius:4}]},options:{...CO,maintainAspectRatio:false}});
  }
}

function initReportCharts(){
  const c2=document.getElementById('chartDaily');
  if(c2&&!charts.daily){
    charts.daily=new Chart(c2,{type:'line',data:{labels:Array.from({length:15},(_,i)=>`Mar ${i+1}`),datasets:[{data:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],borderColor:'#f0a500',backgroundColor:'rgba(240,165,0,.07)',fill:true,tension:.4,pointBackgroundColor:'#f0a500',pointRadius:3}]},options:{...CO,maintainAspectRatio:false}});
  }
  const c3=document.getElementById('chartBeer');
  if(c3&&!charts.beer){
    charts.beer=new Chart(c3,{type:'doughnut',data:{labels:['None'],datasets:[{data:[1],backgroundColor:['#5c6378'],borderColor:'#1a1c20',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'right',labels:{color:'#9ba3b8',font:{family:'JetBrains Mono',size:10},padding:12,boxWidth:12}}}}});
  }
}

/* ══════════════════════════════════════════
   MQTT FEED SIMULATION
══════════════════════════════════════════ */
const MQTT_MSGS=[];
function startMqttFeed(){
  const el=document.getElementById('mqttLog');
  if(!el) return;
  
  console.log('📡 Connecting to MQTT Live Stream...');
  const eventSource = new EventSource('/api/mqtt/stream');

  eventSource.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'message') {
      const { topic, data, time } = msg.data;
      const now = new Date(time).toTimeString().slice(0,8);
      const line = document.createElement('div');
      line.style.cssText = 'margin-bottom:6px;line-height:1.7';
      line.innerHTML = `<span style="color:#5c6378">${now}</span> <span style="color:#4a9eff">${topic}</span> <span style="color:#9ba3b8">→</span> <span style="color:#22c97a">${typeof data === 'object' ? JSON.stringify(data) : data}</span>`;
      el.prepend(line);
      if(el.children.length > 100) el.lastChild.remove();
    } else if (msg.type === 'status') {
      const statusEl = document.querySelector('.mqtt-status span:last-child');
      if (statusEl) statusEl.textContent = msg.data.broker;
      const dot = document.querySelector('.live-dot');
      if (dot) dot.style.background = msg.data.connected ? 'var(--green)' : 'var(--red)';
    }
  };

  eventSource.onerror = (err) => {
    console.error('MQTT Stream Error:', err);
    eventSource.close();
    setTimeout(startMqttFeed, 5000); // Reconnect
  };
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
lang=localStorage.getItem('bc_lang')||'de';
// sync dropdown to current lang
const _sel=document.getElementById('langSelect');
if(_sel) _sel.value=lang;
setLang(lang);

/* ══════════════════════════════════════════
   CUSTOM DATEPICKER ENGINE
   - dd/mm/yyyy display format
   - language-aware month/day names
   - click-outside closes
   - year & month drill-down
══════════════════════════════════════════ */
const DP_LOCALE = {
  en:{
    months:['January','February','March','April','May','June','July','August','September','October','November','December'],
    monthsShort:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    days:['Mo','Tu','We','Th','Fr','Sa','Su'],
    today:'Today',clear:'Clear',close:'Close'
  },
  de:{
    months:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
    monthsShort:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
    days:['Mo','Di','Mi','Do','Fr','Sa','So'],
    today:'Heute',clear:'Löschen',close:'Schließen'
  },
  es:{
    months:['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
    monthsShort:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
    days:['Lu','Ma','Mi','Ju','Vi','Sá','Do'],
    today:'Hoy',clear:'Borrar',close:'Cerrar'
  },
  it:{
    months:['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
    monthsShort:['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'],
    days:['Lu','Ma','Me','Gi','Ve','Sa','Do'],
    today:'Oggi',clear:'Cancella',close:'Chiudi'
  },
  el:{
    months:['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'],
    monthsShort:['Ιαν','Φεβ','Μάρ','Απρ','Μάι','Ιούν','Ιούλ','Αύγ','Σεπ','Οκτ','Νοε','Δεκ'],
    days:['Δε','Τρ','Τε','Πε','Πα','Σά','Κυ'],
    today:'Σήμερα',clear:'Καθαρισμός',close:'Κλείσιμο'
  }
};

// Active datepicker state
let dpState = null; // { inputId, year, month, view:'days'|'months'|'years', popup }

function dpLocale(){ return DP_LOCALE[lang] || DP_LOCALE.en; }

// Parse dd/mm/yyyy → Date or null
function dpParse(str){
  if(!str||str.length!==10) return null;
  const [d,m,y] = str.split('/').map(Number);
  if(!d||!m||!y) return null;
  const dt = new Date(y,m-1,d);
  return isNaN(dt.getTime()) ? null : dt;
}

// Format Date → dd/mm/yyyy
function dpFmt(dt){
  if(!dt) return '';
  const d=String(dt.getDate()).padStart(2,'0');
  const m=String(dt.getMonth()+1).padStart(2,'0');
  return `${d}/${m}/${dt.getFullYear()}`;
}

function openDP(inputId){
  if(dpState && dpState.inputId===inputId){ closeDP(); return; }
  closeDP();
  const inp = document.getElementById(inputId);
  if(!inp) return;
  inp.classList.add('open');

  const parsed = dpParse(inp.value);
  const now = new Date();
  const yr = parsed ? parsed.getFullYear() : now.getFullYear();
  const mo = parsed ? parsed.getMonth() : now.getMonth();

  // Create popup
  const popup = document.createElement('div');
  popup.className = 'dp-popup';
  popup.id = 'dp-popup-'+inputId;
  document.body.appendChild(popup);

  dpState = { inputId, year:yr, month:mo, view:'days', popup };
  dpPosition(inp, popup);
  dpRender();

  // close on outside click
  setTimeout(()=>{
    document.addEventListener('mousedown', dpOutside, true);
  },0);
}

function dpPosition(inp, popup){
  const rect = inp.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const popH = 340;
  let top, left;
  if(spaceBelow >= popH || spaceBelow >= spaceAbove){
    top = rect.bottom + 6;
  } else {
    top = rect.top - popH - 6;
  }
  left = rect.left;
  // keep inside viewport
  if(left + 290 > window.innerWidth) left = window.innerWidth - 298;
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
}

function dpOutside(e){
  if(!dpState) return;
  const popup = dpState.popup;
  const inp = document.getElementById(dpState.inputId);
  if(popup && popup.contains(e.target)) return;
  if(inp && inp.contains(e.target)) return;
  closeDP();
}

function closeDP(){
  if(!dpState) return;
  dpState.popup.remove();
  const inp = document.getElementById(dpState.inputId);
  if(inp) inp.classList.remove('open');
  document.removeEventListener('mousedown', dpOutside, true);
  dpState = null;
}

function dpRender(){
  if(!dpState) return;
  const { year, month, view, popup, inputId } = dpState;
  const loc = dpLocale();
  const inp = document.getElementById(inputId);
  const selDate = dpParse(inp ? inp.value : '');
  const today = new Date();

  if(view === 'years'){
    const base = Math.floor(year/12)*12;
    let rows = '';
    for(let y=base;y<base+12;y++){
      rows += `<div class="dp-yr${y===year?' dp-yr-cur':''}" onclick="dpSetYear(${y})">${y}</div>`;
    }
    popup.innerHTML = `
      <div class="dp-head">
        <button class="dp-nav" onclick="dpState.year-=12;dpRender()">‹</button>
        <div class="dp-hdr-lbl" onclick="dpState.view='days';dpRender()">${base}–${base+11}</div>
        <button class="dp-nav" onclick="dpState.year+=12;dpRender()">›</button>
      </div>
      <div class="dp-yr-grid">${rows}</div>
      <div class="dp-footer"><span class="dp-sel-lbl">${selDate?dpFmt(selDate):''}</span><button class="btn btn-ghost btn-sm" onclick="closeDP()">${loc.close}</button></div>`;
    return;
  }

  if(view === 'months'){
    let rows = '';
    loc.monthsShort.forEach((m,i)=>{
      rows += `<div class="dp-mo${i===month?' dp-mo-cur':''}" onclick="dpSetMonth(${i})">${m}</div>`;
    });
    popup.innerHTML = `
      <div class="dp-head">
        <button class="dp-nav" onclick="dpState.year--;dpRender()">‹</button>
        <div class="dp-hdr-lbl" onclick="dpState.view='years';dpRender()">${year}</div>
        <button class="dp-nav" onclick="dpState.year++;dpRender()">›</button>
      </div>
      <div class="dp-mo-grid">${rows}</div>
      <div class="dp-footer"><span class="dp-sel-lbl">${selDate?dpFmt(selDate):''}</span><button class="btn btn-ghost btn-sm" onclick="closeDP()">${loc.close}</button></div>`;
    return;
  }

  // Days view
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  // Convert Sunday-first to Monday-first
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month+1, 0).getDate();

  let dowHtml = loc.days.map(d=>`<b>${d}</b>`).join('');

  // Get paired input for range highlight
  let pairDate = null;
  if(inputId==='dpFrom'){
    const other = document.getElementById('dpTo');
    if(other) pairDate = dpParse(other.value);
  } else {
    const other = document.getElementById('dpFrom');
    if(other) pairDate = dpParse(other.value);
  }
  const rangeStart = inputId==='dpFrom' ? selDate : pairDate;
  const rangeEnd   = inputId==='dpTo'   ? selDate : pairDate;

  let daysHtml = '';
  // Empty leading cells
  for(let i=0;i<startOffset;i++) daysHtml += '<div class="dp-day dp-empty"></div>';

  for(let d=1;d<=daysInMonth;d++){
    const dt = new Date(year,month,d);
    const isSel = selDate && dt.toDateString()===selDate.toDateString();
    const isToday = dt.toDateString()===today.toDateString();
    const inRange = rangeStart && rangeEnd && dt>rangeStart && dt<rangeEnd;
    let cls = 'dp-day';
    if(isSel)    cls += ' dp-sel';
    else if(isToday) cls += ' dp-today';
    if(inRange)  cls += ' dp-range';
    daysHtml += `<div class="${cls}" onclick="dpSelectDay(${year},${month},${d})">${d}</div>`;
  }

  popup.innerHTML = `
    <div class="dp-head">
      <button class="dp-nav" onclick="dpPrevMonth()">‹</button>
      <div class="dp-hdr-lbl" onclick="dpState.view='months';dpRender()">
        ${loc.months[month]} <span>${year}</span>
      </div>
      <button class="dp-nav" onclick="dpNextMonth()">›</button>
    </div>
    <div class="dp-dow">${dowHtml}</div>
    <div class="dp-days">${daysHtml}</div>
    <div class="dp-footer">
      <button class="btn btn-ghost btn-sm" onclick="dpGoToday()">${loc.today}</button>
      <span class="dp-sel-lbl">${selDate?dpFmt(selDate):''}</span>
      <button class="btn btn-ghost btn-sm" onclick="closeDP()">${loc.close}</button>
    </div>`;
}

function dpSelectDay(y,m,d){
  if(!dpState) return;
  const dt = new Date(y,m,d);
  const inp = document.getElementById(dpState.inputId);
  if(inp) inp.value = dpFmt(dt);
  // if From > To, clear To; if To < From, clear From
  const fromInp = document.getElementById('dpFrom');
  const toInp   = document.getElementById('dpTo');
  if(fromInp && toInp){
    const from = dpParse(fromInp.value);
    const to   = dpParse(toInp.value);
    if(from && to && from > to){
      if(dpState.inputId==='dpFrom') toInp.value='';
      else fromInp.value='';
    }
  }
  closeDP();
}

function dpGoToday(){
  if(!dpState) return;
  const now = new Date();
  const inp = document.getElementById(dpState.inputId);
  if(inp) inp.value = dpFmt(now);
  dpState.year  = now.getFullYear();
  dpState.month = now.getMonth();
  dpRender();
}

function dpPrevMonth(){
  if(!dpState) return;
  dpState.month--;
  if(dpState.month<0){ dpState.month=11; dpState.year--; }
  dpRender();
}
function dpNextMonth(){
  if(!dpState) return;
  dpState.month++;
  if(dpState.month>11){ dpState.month=0; dpState.year++; }
  dpRender();
}
function dpSetYear(y){ dpState.year=y; dpState.view='months'; dpRender(); }
function dpSetMonth(m){ dpState.month=m; dpState.view='days'; dpRender(); }

// Rerender open picker on lang change (month/day names update)
const _origSetLang = setLang;
setLang = function(l){
  _origSetLang(l);
  if(dpState) dpRender();
};


/* ══════════════════════════════════════════
   NEW FEATURES JS
══════════════════════════════════════════ */

// ── AUDIT LOG DATA ──
const AUDIT_DATA = [];

const ACTION_ICONS = {keg_change:'🛢',login:'👤',fob_event:'⚡',alert:'🔔',settings:'⚙',admin:'🔑'};
const ACTION_COLORS = {keg_change:'tg-green',login:'tg-blue',fob_event:'tg-amber',alert:'tg-red',settings:'tg-gray',admin:'tg-amber'};

function buildAuditLog(){
  const tbody = document.getElementById('auditTableBody');
  if(!tbody) return;
  tbody.innerHTML = AUDIT_DATA.map(a=>`
    <tr>
      <td class="mono" style="font-size:11px">${a.ts}</td>
      <td class="td-name" style="font-size:13px">${a.user}</td>
      <td style="font-size:12px;color:var(--text3)">${a.rest}</td>
      <td><span class="tag ${ACTION_COLORS[a.action]||'tg-gray'}">${ACTION_ICONS[a.action]||'•'} ${a.action.replace('_',' ')}</span></td>
      <td style="font-size:12px;color:var(--text2);max-width:280px;white-space:normal">${a.detail}</td>
      <td class="mono" style="font-size:11px;color:var(--text3)">${a.ip}</td>
    </tr>`).join('');
}

// ── FORECAST DATA ──
const FORECAST_DATA = [];

const SUPPLIERS = {};

function buildForecastPage(){
  const fc = document.getElementById('forecastCards');
  if(!fc) return;
  fc.innerHTML = FORECAST_DATA.map(k => {
    const pct = (k.rem/k.size*100).toFixed(0);
    const fill = k.urgency==='critical'?'fill-red':k.urgency==='high'?'fill-amber':k.urgency==='medium'?'fill-amber':'fill-green';
    const urgColor = {critical:'var(--red)',high:'var(--amber)',medium:'var(--amber)',low:'var(--green)'}[k.urgency];
    const urgBg = {critical:'var(--red-dim)',high:'var(--amber-dim)',medium:'var(--amber-dim)',low:'var(--green-dim)'}[k.urgency];
    return `<div class="keg-card ${k.urgency==='critical'?'critical':k.urgency==='high'?'warning':''}">
      <div class="keg-top">
        <div><div class="keg-name">${k.name}</div><div class="keg-sub">Tap #${k.tap} · ${k.size}L</div></div>
        <div class="keg-logo">${k.emoji}</div>
      </div>
      <div class="prog-wrap">
        <div class="prog-label"><span>${t('remaining')}</span><strong>${k.rem.toFixed(1)} / ${k.size} L</strong></div>
        <div class="prog-bar"><div class="prog-fill ${fill}" style="width:${pct}%"></div></div>
      </div>
      <div style="margin-top:12px;padding:10px 12px;background:${urgBg};border-radius:var(--r)">
        <div style="font-size:11px;color:${urgColor};font-family:var(--fm);letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px">⏱ Run-out prediction</div>
        <div style="font-size:14px;font-weight:600;color:var(--text1)">${k.runout}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px">${k.daily.toFixed(1)} L/day avg · ${k.confidence}% confidence</div>
      </div>
    </div>`;
  }).join('');

  const orders = document.getElementById('orderSuggestions');
  if(orders){
    orders.innerHTML = FORECAST_DATA
      .filter(k=>k.urgency==='critical'||k.urgency==='high'||k.urgency==='medium')
      .map(k => {
        const s = SUPPLIERS[k.name] || {};
        return `<div style="display:flex;align-items:center;gap:14px;padding:14px;background:var(--bg3);border-radius:var(--r);border:1px solid var(--border)">
          <div style="font-size:28px">${k.emoji}</div>
          <div style="flex:1">
            <div style="font-weight:500;color:var(--text1);margin-bottom:2px">${k.name} — ${k.size}L keg needed by <strong style="color:var(--amber)">${k.runout.split(' ')[0]}</strong></div>
            <div style="font-size:12px;color:var(--text3)">${s.name||'—'} · ${s.phone||'—'}</div>
          </div>
          <div class="flex g8">
            <button class="btn btn-ghost btn-sm" onclick="toast('WhatsApp order sent','info')">📱 WhatsApp</button>
            <button class="btn btn-primary btn-sm" onclick="toast('Order email sent','info')">📧 Order</button>
          </div>
        </div>`;
      }).join('');
  }
}

// ── CALIBRATION ──
const CALIB_DATA = [];

function buildCalibration(){
  const el = document.getElementById('calibList');
  if(!el) return;
  el.innerHTML = CALIB_DATA.map(k => {
    const statusColor = {ok:'var(--green)',old:'var(--amber)',uncalibrated:'var(--red)'}[k.status];
    const statusLabel = {ok:'Calibrated',old:'Re-calibrate recommended',uncalibrated:'Not calibrated'}[k.status];
    return `<div class="card">
      <div class="card-hdr">
        <span style="font-size:18px">Tap #${k.tap}</span>
        <span class="card-title">${k.name}</span>
        <span style="font-size:12px;color:${statusColor};font-family:var(--fm)">● ${statusLabel}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text3);font-family:var(--fm)">Last: ${k.last}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
          <div class="rep-stat"><div class="rep-val" style="font-size:20px">${k.kfactor||'—'}</div><div class="rep-lbl">K-Factor (pulses/L)</div></div>
          <div class="rep-stat"><div class="rep-val" style="font-size:20px">${k.pulses||'—'}</div><div class="rep-lbl">Last calibration pulses</div></div>
          <div class="rep-stat"><div class="rep-val" style="font-size:20px">${k.kfactor?((1000/k.kfactor)*100).toFixed(1)+'mL':'—'}</div><div class="rep-lbl">Volume per pulse</div></div>
        </div>
        <div style="background:var(--bg3);border-radius:var(--r);padding:16px;border:1px solid var(--border)">
          <div style="font-family:var(--fh);font-size:14px;font-weight:600;margin-bottom:12px">🔧 Run Calibration Wizard</div>
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0"><label class="fl">Known volume to pour (L)</label><input type="number" value="1.0" step="0.1" style="width:120px" id="calib-vol-${k.id}"></div>
            <div class="form-group" style="margin:0"><label class="fl">Pulse count from ESP32</label><input type="number" placeholder="e.g. 448" style="width:140px;font-family:var(--fm)" id="calib-pulses-${k.id}"></div>
            <button class="btn btn-primary btn-sm" onclick="calculateKFactor(${k.id})">Calculate K-Factor</button>
            <button class="btn btn-ghost btn-sm" onclick="toast('ESP32 sensor reset','info')">Reset Counter</button>
          </div>
          <div style="font-size:11px;color:var(--text3);margin-top:10px">Pour exactly the known volume, note the pulse count shown by the ESP32, then click Calculate.</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function calculateKFactor(id){
  const vol = parseFloat(document.getElementById('calib-vol-'+id)?.value||0);
  const pulses = parseFloat(document.getElementById('calib-pulses-'+id)?.value||0);
  if(!vol||!pulses){ toast('Enter both volume and pulse count','error'); return; }
  const kf = (pulses/vol).toFixed(1);
  toast(`K-Factor calculated: ${kf} pulses/L — saved ✓`, 'info');
}

// ── KIOSK MODE ──
function buildKioskPreview(){
  const el = document.getElementById('kioskPreview');
  if(!el) return;
  const cols = document.getElementById('kioskCols')?.value||3;
  const showTemp = document.getElementById('kioskShowTemp')?.checked;
  const showCo2 = document.getElementById('kioskShowCo2')?.checked;
  el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px">` +
    USER_KEGS.map(k=>{
      const pct = (k.rem/k.size*100).toFixed(0);
      const fill = pct<=10?'fill-red':pct<=20?'fill-amber':'fill-green';
      return `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:20px;text-align:center">
        <div style="font-size:36px;margin-bottom:8px">${k.emoji}</div>
        <div style="font-family:var(--fh);font-size:20px;font-weight:700;margin-bottom:4px">${k.name}</div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:12px">Tap #${k.tap}</div>
        <div class="prog-bar" style="height:12px;margin-bottom:8px"><div class="prog-fill ${fill}" style="width:${pct}%"></div></div>
        <div style="font-family:var(--fm);font-size:14px;color:var(--text1)">${k.rem.toFixed(1)} / ${k.size} L <span style="color:var(--text3)">(${pct}%)</span></div>
        ${showTemp?`<div style="font-size:12px;color:var(--text3);margin-top:6px">🌡 ${k.temp}°C</div>`:''}
        ${showCo2?`<div style="font-size:12px;color:var(--text3)">CO₂ ${k.co2} bar</div>`:''}
      </div>`;
    }).join('') + '</div>';
}

function launchKiosk(){
  const cols = document.getElementById('kioskCols')?.value||3;
  const showTemp = document.getElementById('kioskShowTemp')?.checked;
  const showCo2 = document.getElementById('kioskShowCo2')?.checked;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BeerControl Kiosk</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0e0f11;color:#eceef2;font-family:'Barlow Condensed',sans-serif;padding:24px;min-height:100vh}
h1{font-size:22px;margin-bottom:20px;opacity:.5;letter-spacing:2px;text-transform:uppercase;font-family:'JetBrains Mono',monospace}
.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:20px}
.card{background:#1a1c20;border:1px solid #2e3240;border-radius:12px;padding:24px;text-align:center}
.emoji{font-size:48px;margin-bottom:10px}
.name{font-size:26px;font-weight:700;margin-bottom:4px}
.tap{font-size:13px;color:#5c6378;margin-bottom:16px}
.bar{height:14px;background:#2a2e36;border-radius:7px;overflow:hidden;margin-bottom:10px}
.fill{height:100%;border-radius:7px;transition:width .6s}
.fill-green{background:linear-gradient(90deg,#1a9a5e,#22c97a)}
.fill-amber{background:linear-gradient(90deg,#d4900a,#f0a500)}
.fill-red{background:linear-gradient(90deg,#b83333,#e84b4b)}
.vol{font-family:'JetBrains Mono',monospace;font-size:16px}
.meta{font-size:13px;color:#5c6378;margin-top:6px}
.updated{position:fixed;bottom:16px;right:24px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#2e3240}
</style></head><body>
<h1>🍺 BeerControl — Live Tap Status</h1>
<div class="grid">${USER_KEGS.map(k=>{
  const pct=(k.rem/k.size*100).toFixed(0);
  const fc=pct<=10?'fill-red':pct<=20?'fill-amber':'fill-green';
  return `<div class="card"><div class="emoji">${k.emoji}</div><div class="name">${k.name}</div><div class="tap">Tap #${k.tap}</div>
  <div class="bar"><div class="fill ${fc}" style="width:${pct}%"></div></div>
  <div class="vol">${k.rem.toFixed(1)} / ${k.size} L (${pct}%)</div>
  ${showTemp?`<div class="meta">🌡 ${k.temp}°C${showCo2?' · CO₂ '+k.co2+' bar':''}</div>`:''}
  </div>`;}).join('')}</div>
<div class="updated">Last updated: ${new Date().toLocaleTimeString()}</div>
</body></html>`;
  const w = window.open('','_blank','width=1280,height=800');
  if(w){ w.document.write(html); w.document.close(); }
}

// ── EXTENDED nav() to handle new pages ──
const _origNav = nav;
nav = function(pageId, el){
  _origNav(pageId, el);
  if(pageId==='adminAudit')    { setTimeout(buildAuditLog,50); }
  if(pageId==='adminBilling')  { setTimeout(()=>{ initBillingChart(); },100); }
  if(pageId==='userForecast')  { setTimeout(buildForecastPage,50); }
  if(pageId==='userCalibration'){ setTimeout(buildCalibration,50); }
  if(pageId==='userKiosk')     { setTimeout(buildKioskPreview,50); }
  if(pageId==='userCosts')     { setTimeout(initCostCharts,100); }
};

// ── NEW NAV TITLE MAP additions ──
const _navTitles_extra = {
  adminBilling:'Billing & Subscriptions',
  adminAudit:'Audit Log',
  userCosts:'Costs & Revenue',
  userForecast:'Forecast',
  userKiosk:'Kiosk Mode',
  userCalibration:'Calibration',
};
// Patch into the existing nav function's title lookup
const _patchTitles = () => {
  Object.assign(window._navTitlesExtra||{}, _navTitles_extra);
};
setTimeout(_patchTitles, 0);

// ── BILLING CHART ──
function initBillingChart(){
  const ctx = document.getElementById('chartBillingRevenue');
  if(!ctx||charts.billing) return;
  charts.billing = new Chart(ctx,{type:'bar',data:{
    labels:['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'],
    datasets:[
      {label:'Revenue',data:[0,0,0,0,0,0,0,0,0,0,0,0],backgroundColor:'rgba(240,165,0,.2)',borderColor:'#f0a500',borderWidth:1.5,borderRadius:4},
      {label:'MRR',data:[0,0,0,0,0,0,0,0,0,0,0,0],backgroundColor:'rgba(34,201,122,.1)',borderColor:'#22c97a',borderWidth:1.5,borderRadius:4,type:'line',fill:false,tension:.4,pointRadius:3,pointBackgroundColor:'#22c97a'},
    ]
  },options:{...{plugins:{legend:{display:true,labels:{color:'#9ba3b8',font:{family:'JetBrains Mono',size:10},boxWidth:12}}},scales:{x:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}},y:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10},callback:v=>'€'+v}}}},responsive:true,maintainAspectRatio:false}});
}

// ── COST CHARTS ──
function initCostCharts(){
  const ctx1 = document.getElementById('chartCostTap');
  const ctx2 = document.getElementById('chartWaste');
  if(ctx1&&!charts.costTap){
    charts.costTap = new Chart(ctx1,{type:'bar',data:{
      labels:[],
      datasets:[
        {label:'Revenue €',data:[],backgroundColor:'rgba(34,201,122,.2)',borderColor:'#22c97a',borderWidth:1.5,borderRadius:4},
        {label:'Cost €',data:[],backgroundColor:'rgba(240,165,0,.15)',borderColor:'#f0a500',borderWidth:1.5,borderRadius:4},
      ]
    },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'#9ba3b8',font:{family:'JetBrains Mono',size:10},boxWidth:12}}},scales:{x:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}},y:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10},callback:v=>'€'+v}}}}});
  }
  if(ctx2&&!charts.waste){
    charts.waste = new Chart(ctx2,{type:'line',data:{
      labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
      datasets:[{label:'Waste L',data:[0,0,0,0,0,0,0],borderColor:'#e84b4b',backgroundColor:'rgba(232,75,75,.07)',fill:true,tension:.4,pointBackgroundColor:'#e84b4b',pointRadius:4}]
    },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}},y:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10},callback:v=>v+'L'}}}}});
  }
}

// ── FORECAST CHART ──
const _origInitReportCharts = initReportCharts;
function initForecastChart(){
  const ctx = document.getElementById('chartForecast');
  if(!ctx||charts.forecast) return;
  charts.forecast = new Chart(ctx,{type:'bar',data:{
    labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets:[]
  },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{color:'#9ba3b8',font:{family:'JetBrains Mono',size:10},boxWidth:12}}},scales:{x:{stacked:true,grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}},y:{stacked:true,grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10},callback:v=>v+'L'}}}}});
}

// ── DAILY EMAIL REPORT SIMULATION ──
function simulateDailyReport(){
  toast('📧 Daily report sent to 2 recipients','info');
}

// ── TELEGRAM BOT COMMANDS SIMULATION ──
const TELEGRAM_CMDS = {
  '/status': () => {
    const lines = USER_KEGS.map(k=>`Tap #${k.tap} ${k.name}: ${k.rem.toFixed(1)}/${k.size}L (${(k.rem/k.size*100).toFixed(0)}%)`);
    return '🍺 BeerControl Status\n' + lines.join('\n');
  },
  '/alerts': () => '🔔 No active alerts.',
};

// ── KIOSK LIVE UPDATE TIMER ──
let kioskTimer = null;
function startKioskAutoRefresh(){
  if(kioskTimer) clearInterval(kioskTimer);
  kioskTimer = setInterval(()=>{
    if(currentPage==='userKiosk') buildKioskPreview();
  }, 5000);
}

// ── DARK/LIGHT MODE TOGGLE ──
let isDark = true;
function toggleTheme(){
  isDark = !isDark;
  document.documentElement.style.setProperty('--bg0', isDark?'#0e0f11':'#f4f3ef');
  document.documentElement.style.setProperty('--bg1', isDark?'#141518':'#eceae3');
  document.documentElement.style.setProperty('--bg2', isDark?'#1a1c20':'#e4e2da');
  document.documentElement.style.setProperty('--bg3', isDark?'#21242a':'#d8d6ce');
  document.documentElement.style.setProperty('--bg4', isDark?'#2a2e36':'#c8c6be');
  document.documentElement.style.setProperty('--border', isDark?'#2e3240':'#b8b6ae');
  document.documentElement.style.setProperty('--border2', isDark?'#3a3f50':'#a8a6a0');
  document.documentElement.style.setProperty('--text1', isDark?'#eceef2':'#1a1c20');
  document.documentElement.style.setProperty('--text2', isDark?'#9ba3b8':'#3a3f50');
  document.documentElement.style.setProperty('--text3', isDark?'#5c6378':'#6c7080');
  document.getElementById('themeBtn').textContent = isDark ? '☀ Light' : '🌙 Dark';
}

// kick off forecast chart when nav goes there
const _navForecastPatch = nav;


/* ══════════════════════════════════════════
   ORGANIZED ADMIN DATA & LOGIC
══════════════════════════════════════════ */

// ── MASTER DATA ──
const RESTAURANTS_DATA = [];

const USERS_DATA = [];

const BEER_LIBRARY_DEFAULT = [];
const BEER_LIBRARY = (()=>{
  try { const s = localStorage.getItem('bc_beer_library'); return s ? JSON.parse(s) : BEER_LIBRARY_DEFAULT; } catch(e){ return BEER_LIBRARY_DEFAULT; }
})();
function saveBeerLibrary(){ try{ localStorage.setItem('bc_beer_library', JSON.stringify(BEER_LIBRARY)); }catch(e){} }

let restFilter = 'all';
let userStatusFilter = 'all';

// ── RESTAURANTS PAGE ──
function buildRestaurantsPage(){
  renderRestaurantsList();
}

function filterRestaurants(){
  renderRestaurantsList();
}

function setRestFilter(f, el){
  restFilter = f;
  document.querySelectorAll('.rest-filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderRestaurantsList();
}

function renderRestaurantsList(){
  const q = (document.getElementById('restSearch')?.value||'').toLowerCase();
  const el = document.getElementById('restaurantsList');
  if(!el) return;

  let filtered = RESTAURANTS_DATA.filter(r => {
    if(restFilter==='active'    && !r.active) return false;
    if(restFilter==='suspended' && r.active)  return false;
    if(q && !r.name.toLowerCase().includes(q) && !r.city.toLowerCase().includes(q) && !r.country.toLowerCase().includes(q)) return false;
    return true;
  });

  document.getElementById('restCount').textContent = filtered.length + ' restaurants';

  el.innerHTML = filtered.map(r => {
    const planTag = {pro:'tg-amber',enterprise:'tg-blue',starter:'tg-gray'}[r.plan]||'tg-gray';
    const usersForRest = USERS_DATA.filter(u=>u.rest===r.name);
    return `
    <div class="rest-card" id="restcard-${r.id}">
      <div class="rest-card-head" onclick="toggleRestCard(${r.id})">
        <span style="font-size:26px">${r.emoji}</span>
        <div style="flex:1">
          <div class="td-name" style="font-size:14px">${r.name}</div>
          <div style="font-size:11px;color:var(--text3);font-family:var(--fm)">${r.city}, ${r.country}</div>
        </div>
        <span class="tag ${planTag}" style="margin-right:8px">${r.plan}</span>
        <span style="font-size:12px;color:var(--text3);font-family:var(--fm);margin-right:16px">${r.taps} taps · ${usersForRest.length} users</span>
        <span class="sp ${r.active?'sp-on':'sp-off'}" style="margin-right:16px"><span class="sp-dot"></span>${r.active?t('active'):t('suspended')}</span>
        <span style="font-size:12px;color:${r.renewal==='OVERDUE'?'var(--red)':'var(--text3)'};font-family:var(--fm);margin-right:16px">${r.renewal}</span>
        <span class="rest-expand-icon">▼</span>
      </div>
      <div class="rest-card-body">
        <div style="display:flex;border-bottom:1px solid var(--border)">
          <div style="flex:1;padding:16px 20px;border-right:1px solid var(--border)">
            <div style="font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">Users (${usersForRest.length})</div>
            ${usersForRest.map(u=>`
              <div class="user-row">
                <div class="u-av" style="width:26px;height:26px;font-size:11px">${u.name.charAt(0)}</div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:500;color:var(--text1)">${u.name}</div>
                  <div style="font-size:11px;color:var(--text3);font-family:var(--fm)">${u.email}</div>
                </div>
                <span class="tag ${u.role==='Owner'?'tg-amber':'tg-blue'}" style="font-size:10px">${u.role}</span>
                <span class="sp ${u.active?'sp-on':'sp-off'}" style="margin-left:8px"><span class="sp-dot"></span></span>
                <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="openAddUserModal('${r.name}')">+ Add</button>
              </div>`).join('')}
            <div style="padding:10px 0">
              <button class="btn btn-ghost btn-sm" onclick="openAddUserModal('${r.name}')">+ Add User to ${r.name}</button>
            </div>
          </div>
          <div style="width:260px;padding:16px 20px">
            <div style="font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">Actions</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-ghost btn-sm" onclick="openM('mEditRest')" style="justify-content:flex-start">✏ Edit Details</button>
              <button class="btn btn-ghost btn-sm" onclick="nav('adminKegs',null)" style="justify-content:flex-start">🛢 Manage Taps</button>
              <button class="btn btn-ghost btn-sm" onclick="toast('Daily report sent','info')" style="justify-content:flex-start">📧 Send Daily Report</button>
              ${r.active
                ? `<button class="btn btn-danger btn-sm" onclick="toast(t('suspended_ok'),'error')" style="justify-content:flex-start">🔒 Suspend</button>`
                : `<button class="btn btn-success btn-sm" onclick="toast(t('activated_ok'),'info')" style="justify-content:flex-start">✓ Activate</button>`}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  if(filtered.length===0){
    el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">No restaurants found</div>';
  }
}

function toggleRestCard(id){
  const card = document.getElementById('restcard-'+id);
  if(card) card.classList.toggle('expanded');
}

// ── USERS PAGE ──
function buildUsersPage(){
  renderUsersTable();
}

function filterUsers(){
  renderUsersTable();
}

function setUserFilter(f, el){
  userStatusFilter = f;
  document.querySelectorAll('.user-filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderUsersTable();
}

function renderUsersTable(){
  const q    = (document.getElementById('userSearch')?.value||'').toLowerCase();
  const rest = document.getElementById('userRestFilter')?.value||'';
  const role = document.getElementById('userRoleFilter')?.value||'';
  const tbody = document.getElementById('usersTableBody');
  if(!tbody) return;

  let filtered = USERS_DATA.filter(u=>{
    if(userStatusFilter==='active'   && !u.active) return false;
    if(userStatusFilter==='disabled' &&  u.active) return false;
    if(rest && u.rest!==rest) return false;
    if(role && u.role!==role) return false;
    if(q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    return true;
  });

  document.getElementById('userCount').textContent = filtered.length + ' users';

  tbody.innerHTML = filtered.map(u=>`
    <tr>
      <td><div class="fxc g8"><div class="u-av" style="width:28px;height:28px;font-size:12px">${u.name.charAt(0)}</div><span class="td-name">${u.name}</span></div></td>
      <td class="mono" style="font-size:12px">${u.email}</td>
      <td><span style="font-size:12px;color:var(--text2)">${u.rest}</span></td>
      <td><span class="tag ${u.role==='Owner'?'tg-amber':u.role==='Staff'?'tg-gray':'tg-blue'}">${u.role}</span></td>
      <td class="mono" style="font-size:12px;color:var(--text3)">${u.lastLogin}</td>
      <td><span class="sp ${u.active?'sp-on':'sp-off'}"><span class="sp-dot"></span>${u.active?t('active'):t('disabled')}</span></td>
      <td><div class="flex g6">
        <button class="btn btn-ghost btn-sm">✏</button>
        <button class="btn btn-ghost btn-sm" onclick="toast('Password reset sent','info')">🔑</button>
        ${u.active
          ? `<button class="btn btn-danger btn-sm" onclick="toast(t('suspended_ok'),'error')">${t('disable')}</button>`
          : `<button class="btn btn-success btn-sm" onclick="toast(t('user_enabled'),'info')">${t('enable')}</button>`}
      </div></td>
    </tr>`).join('');

  if(filtered.length===0){
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text3)">No users found</td></tr>';
  }
}

function openAddUserModal(presetRest){
  // Pre-fill restaurant in the Add User modal
  const sel = document.querySelector('#mAddUser select');
  if(sel && presetRest){
    for(let opt of sel.options){ if(opt.value===presetRest||opt.text===presetRest){ sel.value=opt.value; break; } }
  }
  openM('mAddUser');
}

// ── BEER LIBRARY ──
let beerLibFilter = '';
let beerStyleFilter_val = '';

function buildBeerLibrary(){
  renderBeerLibraryGrid();
  buildAssignPanel();
}

function filterBeers(){
  beerLibFilter = (document.getElementById('beerSearch')?.value||'').toLowerCase();
  beerStyleFilter_val = document.getElementById('beerStyleFilter')?.value||'';
  renderBeerLibraryGrid();
}

function renderBeerLibraryGrid(){
  const el = document.getElementById('beerLibraryGrid');
  if(!el) return;
  let filtered = BEER_LIBRARY.filter(b=>{
    if(beerLibFilter && !b.name.toLowerCase().includes(beerLibFilter) && !b.brand.toLowerCase().includes(beerLibFilter)) return false;
    if(beerStyleFilter_val && b.style!==beerStyleFilter_val) return false;
    return true;
  });
  document.getElementById('beerCount').textContent = filtered.length + ' beers';
  el.innerHTML = filtered.map(b=>`
    <div class="beer-lib-card" onclick="openM('mAddBeer')">
      ${b.assignedTo.length>0?`<div class="beer-assigned-count">${b.assignedTo.length} venue${b.assignedTo.length!==1?'s':''}</div>`:''}
      <div class="fxc g12" style="margin-bottom:12px">
        <div class="beer-lib-logo">${b.logo ? `<img src="${b.logo}" style="width:42px;height:42px;object-fit:contain;" onerror="this.parentElement.textContent='${b.emoji}'">` : b.emoji}</div>
        <div>
          <div class="beer-lib-name">${b.name}</div>
          <div class="beer-lib-meta">${b.brand} · ${b.origin}</div>
        </div>
      </div>
      <div class="flex g6" style="flex-wrap:wrap;margin-bottom:10px">
        <span class="tag tg-blue">${b.style}</span>
        <span class="tag tg-gray">${b.abv}% ABV</span>
      </div>
      ${b.assignedTo.length>0
        ? `<div style="font-size:11px;color:var(--text3);font-family:var(--fm)">Assigned: ${b.assignedTo.join(', ')}</div>`
        : `<div style="font-size:11px;color:var(--text3);font-family:var(--fm)">Not assigned to any venue</div>`}
      <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:10px" onclick="event.stopPropagation();toast('Beer assigned to tap','info')">+ Assign to Tap</button>
    </div>`).join('');
}

function addBeerToLibrary(){
  const name = document.getElementById('nb-name')?.value.trim();
  if(!name){ toast('Beer name required','error'); return; }
  toast(name + ' added to library','info');
  closeM('mAddBeer');
  renderBeerLibraryGrid();
}

function buildAssignPanel(){
  const el = document.getElementById('assignPanelContent');
  if(!el) return;
  const localRestFilter = document.getElementById('assignRestFilter')?.value||'';
  const rests = localRestFilter ? RESTAURANTS_DATA.filter(r=>r.name===localRestFilter) : RESTAURANTS_DATA;

  el.innerHTML = rests.map(r=>`
    <div class="card mb16" style="margin-bottom:16px">
      <div class="card-hdr">
        <span style="font-size:20px">${r.emoji}</span>
        <span class="card-title">${r.name}</span>
        <span style="font-size:12px;color:var(--text3);font-family:var(--fm)">${r.taps} taps</span>
      </div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:8px">
          ${Array.from({length:Math.min(r.taps,4)},(_,i)=>{
            const assigned = BEER_LIBRARY.filter(b=>b.assignedTo.includes(r.name));
            const beer = assigned[i] || null;
            return `<div class="tap-assign-row">
              <div class="tap-num-badge">#${i+1}</div>
              <select style="flex:1;font-size:13px">
                <option value="">— Unassigned —</option>
                ${BEER_LIBRARY.map(b=>`<option value="${b.id}" ${beer&&b.id===beer.id?'selected':''}>${b.emoji} ${b.name} (${b.style})</option>`).join('')}
              </select>
              <select style="width:90px;font-size:13px">
                <option>50L</option><option>30L</option><option>20L</option>
              </select>
              <input placeholder="ESP32 sensor ID" style="width:180px;font-size:12px;font-family:var(--fm)" value="${beer?`esp_${r.name.toLowerCase().replace(/\s/g,'').slice(0,6)}_tap${i+1}_s`:''}">
            </div>`;
          }).join('')}
          ${r.taps>4?`<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px">... and ${r.taps-4} more taps</div>`:''}
        </div>
        <div style="margin-top:14px">
          <button class="btn btn-primary btn-sm" onclick="toast('Tap assignments saved','info')">Save Assignments</button>
        </div>
      </div>
    </div>`).join('');
}

function switchKegTab(tab){
  document.getElementById('tab-library').classList.toggle('active', tab==='library');
  document.getElementById('tab-assign').classList.toggle('active',   tab==='assign');
  document.getElementById('panel-library').style.display = tab==='library'?'block':'none';
  document.getElementById('panel-assign').style.display  = tab==='assign' ?'block':'none';
  if(tab==='assign') buildAssignPanel();
}

// ── ADD RESTAURANT MULTI-STEP ──
let newRestStep = 1;
let newRestUserCount = 1;

function restStep(step){
  newRestStep = step;
  document.getElementById('mAddRestStep1').style.display = step===1?'block':'none';
  document.getElementById('mAddRestStep2').style.display = step===2?'block':'none';
  document.getElementById('mAddRestStep3').style.display = step===3?'block':'none';
  // Update step dots
  for(let i=1;i<=3;i++){
    const dot = document.getElementById('mstep'+i);
    dot.classList.remove('active','done');
    if(i===step) dot.classList.add('active');
    else if(i<step) dot.classList.add('done');
  }
  if(step===2 && document.getElementById('newRestUsers').children.length===0) addNewRestUserRow();
  if(step===3) buildNewRestTaps();
}

function addNewRestUserRow(){
  const container = document.getElementById('newRestUsers');
  const idx = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'add-user-row';
  row.innerHTML = `
    <button class="remove-row" onclick="this.closest('.add-user-row').remove()">×</button>
    <div class="fg" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label class="fl">Name</label><input placeholder="Full name"></div>
      <div class="form-group"><label class="fl">Email</label><input type="email" placeholder="email@venue.com"></div>
      <div class="form-group fg-full"><label class="fl">Role</label><select id="user-role-select-${idx}">${getRoleOptions()}</select></div>
    </div>
    <div style="margin-top:8px;padding:8px 12px;background:var(--bg3);border-radius:var(--r);font-size:11px;color:var(--text3);display:flex;align-items:center;gap:8px">
      🔐 A temporary password will be auto-generated and emailed to this user. They must set a new password on first login.
    </div>`;
  container.appendChild(row);
}

function buildNewRestTaps(){
  const tapsEl = document.getElementById('newRestTaps');
  const tapCount = parseInt(document.getElementById('nr-taps')?.value||4);
  tapsEl.innerHTML = Array.from({length:Math.min(tapCount,12)},(_,i)=>`
    <div class="tap-assign-row">
      <div class="tap-num-badge">#${i+1}</div>
      <select style="flex:1;font-size:13px">
        <option value="">— Select beer —</option>
        ${BEER_LIBRARY.map(b=>`<option value="${b.id}">${b.emoji} ${b.name}</option>`).join('')}
      </select>
      <select style="width:80px;font-size:13px"><option>50L</option><option>30L</option><option>20L</option></select>
    </div>`).join('');
}

// ── ADMIN ALERTS FILTER ──
function filterAdminAlerts(type, el){
  document.querySelectorAll('.admin-al-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  // In a real app would filter — for demo just toast
  if(type!=='all') toast('Filtered: '+type,'info');
}

// ── HOOK nav() for new pages ──
const _prevNav2 = nav;
nav = function(pageId, el){
  _prevNav2(pageId, el);
  if(pageId==='adminRestaurants') setTimeout(buildRestaurantsPage, 50);
  if(pageId==='adminUsers')       setTimeout(buildUsersPage, 50);
  if(pageId==='adminKegs')        setTimeout(buildBeerLibrary, 50);
};


/* ══════════════════════════════════════════
   DEVICE MANAGEMENT
══════════════════════════════════════════ */

// ── DEVICE DATA ──
const DEVICES_DATA = [];
const RESTAURANTS_DATA = [];
const USERS_DATA = [];
const BEER_LIBRARY = [];
const ALERTS_DATA = [];
const AUDIT_LOG_DATA = [];
const SCHED = [];

function buildDevicesPage(){
  const container = document.getElementById('devicesContainer');
  if(!container) return;
  const restF = document.getElementById('devRestFilter')?.value||'';

  const rests = [...new Set(DEVICES_DATA.map(d=>d.rest))].filter(r=>!restF||r===restF);

  container.innerHTML = rests.map(restName => {
    const devices = DEVICES_DATA.filter(d=>d.rest===restName);
    const sensors  = devices.filter(d=>d.type==='sensor');
    const displays = devices.filter(d=>d.type==='display');
    const offlineCount = devices.filter(d=>!d.online).length;
    const restEmoji = {
      'La Cervecería':'🍺','Pub Dublin':'🍻','Biergarten Munich':'🌿','Bar Estrella':'⭐'
    }[restName]||'🏠';

    return `
    <div class="card mb16" style="margin-bottom:16px">
      <div class="card-hdr">
        <span style="font-size:20px">${restEmoji}</span>
        <span class="card-title">${restName}</span>
        <span style="font-size:12px;color:var(--text3);font-family:var(--fm)">${sensors.length} sensors · ${displays.length} displays</span>
        ${offlineCount>0?`<span class="tag tg-red" style="margin-left:8px">⚡ ${offlineCount} offline</span>`:'<span class="tag tg-green" style="margin-left:8px">✓ All online</span>'}
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="openM('mAddDevice')">+ Add Device</button>
      </div>

      <!-- Sensors section -->
      <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">
          🌡 Sensor Units (Cellar) — one per keg
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${sensors.map(d=>deviceRow(d)).join('')}
        </div>
      </div>

      <!-- Displays section -->
      <div style="padding:16px 20px">
        <div style="font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">
          📺 Display Units (Bar) — shared, shows all kegs
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${displays.map(d=>deviceRow(d)).join('')}
        </div>
      </div>
    </div>`;
  }).join('');
}

function deviceRow(d){
  const onlineDot = d.online
    ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);display:inline-block;flex-shrink:0"></span>'
    : '<span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block;flex-shrink:0"></span>';

  const sensorBadges = d.type==='sensor' ? `
    <div class="flex g6" style="flex-wrap:wrap;margin-top:6px">
      ${d.sensors.flow  ?'<span class="tag tg-blue"  style="font-size:10px">⚡ Flow</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.5">Flow ✗</span>'}
      ${d.sensors.temp  ?'<span class="tag tg-blue"  style="font-size:10px">🌡 Temp</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.5">Temp ✗</span>'}
      ${d.sensors.co2   ?'<span class="tag tg-blue"  style="font-size:10px">💨 CO₂</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.5">CO₂ ✗</span>'}
      ${d.sensors.fob   ?'<span class="tag tg-blue"  style="font-size:10px">🔘 FOB</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.5">FOB ✗</span>'}
    </div>` : `<div style="font-size:12px;color:var(--text3);margin-top:4px">Shows: ${d.shows==='all'?'All kegs (cycles)':d.shows}</div>`;

  const fwBadge = d.fw === 'v2.1.4'
    ? `<span class="tag tg-green" style="font-size:10px">fw ${d.fw}</span>`
    : `<span class="tag tg-amber" style="font-size:10px;cursor:pointer" onclick="toast('OTA update scheduled','info')" title="Update available">fw ${d.fw} ↑</span>`;

  return `
    <div style="display:flex;align-items:flex-start;gap:14px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);transition:border-color .15s" onmouseenter="this.style.borderColor='var(--border2)'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="margin-top:2px">${onlineDot}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px">
          <span style="font-family:var(--fm);font-size:12px;font-weight:500;color:var(--text1)">${d.id}</span>
          ${d.type==='sensor'
            ? `<span class="tag tg-amber" style="font-size:10px">Keg: ${d.keg} · Tap #${d.tap}</span>`
            : `<span class="tag tg-blue"  style="font-size:10px">📺 ${d.loc}</span>`}
          ${fwBadge}
        </div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--fm);margin-bottom:4px">
          Topic: <span style="color:var(--green)">${d.topic}</span>
          &nbsp;·&nbsp; IP: ${d.ip}
          &nbsp;·&nbsp; ${d.online?'<span style="color:var(--green)">Online</span>':'<span style="color:var(--red)">Offline · last seen '+d.lastSeen+'</span>'}
        </div>
        ${sensorBadges}
      </div>
      <div class="flex g6" style="flex-shrink:0;margin-top:2px">
        <button class="btn btn-ghost btn-sm" onclick="showDeviceConfigById('${d.id}')" title="Download config">📋</button>
        <button class="btn btn-ghost btn-sm" onclick="toast('Ping sent to ${d.id}','info')" title="Ping">📡</button>
        ${!d.online?`<button class="btn btn-danger btn-sm" onclick="toast('Alert triggered','error')">⚠</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="toast('Device removed','error')" title="Remove">🗑</button>
      </div>
    </div>`;
}

// ── DEVICE REGISTRATION MODAL LOGIC ──
function selectDeviceType(type){
  document.getElementById('nd-type').value = type;
  document.getElementById('dtype-sensor').style.borderColor  = type==='sensor' ?'var(--amber)':'var(--border)';
  document.getElementById('dtype-display').style.borderColor = type==='display'?'var(--amber)':'var(--border)';
  document.getElementById('nd-sensor-fields').style.display  = type==='sensor' ?'contents':'none';
  document.getElementById('nd-display-fields').style.display = type==='display'?'contents':'none';
  updateDeviceTopics();
}

function updateDeviceTopics(){
  const rest = document.getElementById('nd-rest')?.value||'';
  const type = document.getElementById('nd-type')?.value||'';
  const tap  = document.getElementById('nd-tap')?.value||'X';
  if(!rest||!type) return;

  // Generate restaurant slug
  const slug = rest.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');

  let deviceId, topic, mqttUser;
  if(type==='sensor'){
    deviceId = `${slug}_keg${tap}_sensor`;
    topic    = `${slug}_01/keg/${tap}/sensor`;
    mqttUser = `${slug}_k${tap}_s`;
  } else {
    const dispCount = DEVICES_DATA.filter(d=>d.rest===rest&&d.type==='display').length + 1;
    deviceId = `${slug}_display_bar${dispCount}`;
    topic    = `${slug}_01/display/bar_0${dispCount}`;
    mqttUser = `${slug}_d${dispCount}`;
  }

  document.getElementById('nd-device-id').value = deviceId;
  document.getElementById('nd-topic').value = topic;
  document.getElementById('nd-mqtt-user').value = mqttUser;
  if(!document.getElementById('nd-mqtt-pass').value) regenerateMqttPass();
  showDeviceConfig();
}

function regenerateDeviceId(){ updateDeviceTopics(); }

function regenerateMqttPass(){
  const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$';
  let pass='';
  for(let i=0;i<16;i++) pass+=chars[Math.floor(Math.random()*chars.length)];
  document.getElementById('nd-mqtt-pass').value = pass;
  showDeviceConfig();
}

function showDeviceConfig(){
  const deviceId  = document.getElementById('nd-device-id')?.value||'<device_id>';
  const mqttUser  = document.getElementById('nd-mqtt-user')?.value||'<mqtt_user>';
  const mqttPass  = document.getElementById('nd-mqtt-pass')?.value||'<mqtt_pass>';
  const topic     = document.getElementById('nd-topic')?.value||'<topic>';
  const type      = document.getElementById('nd-type')?.value||'';

  const hasFlow = document.getElementById('nd-has-flow')?.checked;
  const hasTemp = document.getElementById('nd-has-temp')?.checked;
  const hasCo2  = document.getElementById('nd-has-co2')?.checked;
  const hasFob  = document.getElementById('nd-has-fob')?.checked;

  const code = document.getElementById('nd-config-code');
  if(!type){ if(code) code.textContent='// Select a device type above to generate config'; return; }

  const config = type==='sensor' ? `// BeerControl ESP32 Sensor Config
// Device: ${deviceId}
// Generated: ${new Date().toLocaleDateString()}

#define MQTT_BROKER    "yourdomain.com"
#define MQTT_PORT      8883
#define MQTT_USER      "${mqttUser}"
#define MQTT_PASS      "${mqttPass}"
#define MQTT_TOPIC_PUB "${topic}"
#define MQTT_TOPIC_SUB "server/cmd/${deviceId}"
#define DEVICE_ID      "${deviceId}"

// Sensors enabled
#define HAS_FLOW_METER ${hasFlow?'true':'false'}
#define HAS_TEMP_SENSOR ${hasTemp?'true':'false'}
#define HAS_CO2_SENSOR ${hasCo2?'true':'false'}
#define HAS_FOB_SWITCH ${hasFob?'true':'false'}

// Pins (adjust to your wiring)
#define FLOW_PIN       4
#define TEMP_PIN       5
#define CO2_PIN        34   // analog
#define FOB_PIN        15
#define FLOW_KFACTOR   450  // pulses per liter (calibrate!)

// Heartbeat every 30s
#define HEARTBEAT_MS   30000` : `// BeerControl ESP32 Display Config
// Device: ${deviceId}
// Generated: ${new Date().toLocaleDateString()}

#define MQTT_BROKER    "yourdomain.com"
#define MQTT_PORT      8883
#define MQTT_USER      "${mqttUser}"
#define MQTT_PASS      "${mqttPass}"
#define MQTT_TOPIC_SUB "${topic}"
#define DEVICE_ID      "${deviceId}"

// Display settings
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST   4
#define CYCLE_MS  5000   // rotate kegs every 5s
#define ALERT_THRESHOLD_LOW      20   // % remaining
#define ALERT_THRESHOLD_CRITICAL 10   // % remaining`;

  if(code) code.textContent=config;
}

function showDeviceConfigById(id){
  const d = DEVICES_DATA.find(x=>x.id===id);
  if(!d) return;
  const config = `// Device: ${d.id}
#define MQTT_BROKER    "yourdomain.com"
#define MQTT_PORT      8883
#define MQTT_USER      "${d.mqttUser}"
#define MQTT_PASS      "••••••••••••••••"
#define MQTT_TOPIC     "${d.topic}"
#define DEVICE_ID      "${d.id}"`;
  const w = window.open('','_blank');
  if(w){ w.document.write(`<pre style="background:#0e0f11;color:#22c97a;font-family:monospace;font-size:13px;padding:24px;margin:0">${config}</pre>`); w.document.close(); }
}

function regenerateMqttUser(){
  const rest = document.getElementById('nd-rest')?.value||'';
  const type = document.getElementById('nd-type')?.value||'';
  const tap  = document.getElementById('nd-tap')?.value||'X';
  const slug = rest.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
  const user = type==='sensor' ? `${slug}_k${tap}_s` : `${slug}_d1`;
  document.getElementById('nd-mqtt-user').value = user||`dev_${Math.random().toString(36).slice(2,8)}`;
  showDeviceConfig();
}

function testDeviceConnection(){
  const id = document.getElementById('nd-device-id')?.value;
  if(!id){ toast('Generate device ID first','error'); return; }
  toast('Connecting to MQTT broker…','info');
  setTimeout(()=>toast(`✓ Broker reachable · Device ${id} not yet online (not flashed)`,'info'),1200);
}

function downloadDeviceConfigScript(){
  const code = document.getElementById('nd-config-code')?.textContent;
  if(!code||code.trim()==='// Fill in restaurant and device type above'){ toast('Complete the form first','error'); return; }
  const devId = document.getElementById('nd-device-id')?.value||'beercontrol_device';
  const blob  = new Blob([code],{type:'text/plain'});
  const a     = document.createElement('a');
  a.href      = URL.createObjectURL(blob);
  a.download  = `${devId}_config.h`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadDeviceScriptById(deviceId){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const d = r.devices.find(x=>x.id===deviceId);
  if(!d){ toast('Device not found','error'); return; }
  const wifi = (r.wifi||[]).map((w,i)=>
    `#define WIFI_SSID_${i+1}     "${w.ssid}"\n#define WIFI_PASS_${i+1}     "${w.pass}"\n${w.hidden?`#define WIFI_HIDDEN_${i+1}  true`:''}`.trim()
  ).join('\n');
  const script = `// BeerControl ESP32 Config — ${d.id}
// Restaurant: ${r.name}
// Generated: ${new Date().toLocaleDateString()}

// ── WiFi ────────────────────────────────
${wifi||'// No WiFi networks configured'}

// ── MQTT ────────────────────────────────
#define MQTT_BROKER    "yourdomain.com"
#define MQTT_PORT      8883
#define MQTT_USER      "${d.mqttUser||d.id}"
#define MQTT_PASS      "// stored securely — paste manually"
#define MQTT_TOPIC     "${d.topic}"
#define DEVICE_ID      "${d.id}"

// ── Thresholds ──────────────────────────
#define TEMP_MAX_C     ${r.temp_max||6}
#define CO2_MIN_BAR    ${r.co2_min||1.5}
#define LOW_PCT        ${r.low_warning||20}
#define CRITICAL_PCT   ${r.critical_alert||10}

${d.type==='sensor'?`// ── Sensor Pins ─────────────────────────
#define FLOW_PIN       4
#define TEMP_PIN       5
#define CO2_PIN        34
#define FOB_PIN        15
#define FLOW_KFACTOR   450
#define HAS_FLOW_METER ${d.sensors?.flow?'true':'false'}
#define HAS_TEMP_SENSOR ${d.sensors?.temp?'true':'false'}
#define HAS_CO2_SENSOR ${d.sensors?.co2?'true':'false'}
#define HAS_FOB_SWITCH ${d.sensors?.fob?'true':'false'}
#define HEARTBEAT_MS   30000`:`// ── Display Pins ────────────────────────
#define TFT_CS   15
#define TFT_DC    2
#define TFT_RST   4
#define CYCLE_MS  5000`}`;
  const blob = new Blob([script],{type:'text/plain'});
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${d.id}_config.h`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`Script downloaded: ${d.id}_config.h`,'info');
}

function openAddDeviceToRest(){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  // Reset form
  document.getElementById('nd-type').value='';
  document.getElementById('nd-sensor-fields').style.display='none';
  document.getElementById('nd-display-fields').style.display='none';
  document.getElementById('dtype-sensor').style.borderColor='var(--border)';
  document.getElementById('dtype-display').style.borderColor='var(--border)';
  document.getElementById('nd-device-id').value='';
  document.getElementById('nd-mqtt-user').value='';
  document.getElementById('nd-mqtt-pass').value='';
  document.getElementById('nd-topic').value='';
  document.getElementById('nd-config-code').textContent='// Fill in restaurant and device type above';
  // Pre-select restaurant
  if(r){
    const sel=document.getElementById('nd-rest');
    if(sel){ for(let o of sel.options){ if(o.text===r.name||o.value===r.name){ sel.value=o.value; break; } } }
  }
  // Populate location dropdown from LOCATIONS
  populateLocationDropdown('nd-loc');
  openM('mAddDevice');
}

function openEditDevice(deviceId){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const d = r.devices.find(x=>x.id===deviceId);
  if(!d) return;
  document.getElementById('ed-id').value    = d.id;
  document.getElementById('ed-type').value  = d.type==='sensor'?'Sensor (Cellar)':'Display (Bar)';
  document.getElementById('ed-topic').value = d.topic;
  document.getElementById('ed-sensor-fields').style.display  = d.type==='sensor' ?'contents':'none';
  document.getElementById('ed-display-fields').style.display = d.type==='display'?'contents':'none';
  if(d.type==='sensor'){
    document.getElementById('ed-keg').value = d.keg||'';
    document.getElementById('ed-tap').value = d.tap||'';
    document.getElementById('ed-has-flow').checked = d.sensors?.flow||false;
    document.getElementById('ed-has-temp').checked = d.sensors?.temp||false;
    document.getElementById('ed-has-co2').checked  = d.sensors?.co2||false;
    document.getElementById('ed-has-fob').checked  = d.sensors?.fob||false;
  } else {
    populateLocationDropdown('ed-loc');
    const locEl=document.getElementById('ed-loc');
    if(locEl) locEl.value = d.loc||'';
    const showEl=document.getElementById('ed-show-kegs');
    if(showEl) showEl.value = d.shows||'all';
  }
  openM('mEditDevice');
}

function saveEditDevice(){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const devId = document.getElementById('ed-id')?.value;
  const d = r.devices.find(x=>x.id===devId);
  if(!d) return;
  if(d.type==='sensor'){
    d.keg  = document.getElementById('ed-keg')?.value.trim()||d.keg;
    d.tap  = parseInt(document.getElementById('ed-tap')?.value)||d.tap;
    d.sensors = {
      flow: document.getElementById('ed-has-flow')?.checked,
      temp: document.getElementById('ed-has-temp')?.checked,
      co2:  document.getElementById('ed-has-co2')?.checked,
      fob:  document.getElementById('ed-has-fob')?.checked,
    };
  } else {
    d.loc   = document.getElementById('ed-loc')?.value||d.loc;
    d.shows = document.getElementById('ed-show-kegs')?.value||d.shows;
  }
  closeM('mEditDevice');
  renderDetailDevices(r);
  toast('Device updated','info');
}

function deleteDevice(deviceId){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const d = r.devices.find(x=>x.id===deviceId);
  if(!d) return;
  showConfirm({
    icon:'🗑', title:'Delete Device',
    message:`Remove device <b>${d.id}</b> from ${r.name}? The physical device will stop sending data.`,
    confirmLabel:'Delete Device', danger:true,
    onConfirm:()=>{ r.devices=r.devices.filter(x=>x.id!==deviceId); renderDetailDevices(r); toast('Device removed','error'); }
  });
}

function registerDevice(){
  const rest = document.getElementById('nd-rest')?.value;
  const type = document.getElementById('nd-type')?.value;
  const id   = document.getElementById('nd-device-id')?.value;
  if(!rest||!type||!id){ toast('Please fill all required fields','error'); return; }
  // Add to current restaurant's device list
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(r){
    const newDev = {
      id, type,
      keg:   type==='sensor'?(document.getElementById('nd-keg')?.value||''):'',
      tap:   type==='sensor'?parseInt(document.getElementById('nd-tap')?.value||'0'):null,
      online: false, fw:'v2.1.4',
      ip:'—',
      topic: document.getElementById('nd-topic')?.value||'',
      mqttUser: document.getElementById('nd-mqtt-user')?.value||'',
      loc:   type==='display'?(document.getElementById('nd-loc')?.value||'Bar — main counter'):'',
      shows: type==='display'?(document.getElementById('nd-show-kegs')?.value||'all'):'',
      sensors: type==='sensor'?{
        flow: document.getElementById('nd-has-flow')?.checked,
        temp: document.getElementById('nd-has-temp')?.checked,
        co2:  document.getElementById('nd-has-co2')?.checked,
        fob:  document.getElementById('nd-has-fob')?.checked,
      }:null,
    };
    r.devices.push(newDev);
  }
  toast(`Device ${id} registered ✓ — MQTT credentials created`,'info');
  closeM('mAddDevice');
  if(r) renderDetailDevices(r);
  buildDevicesPage();
}

// ── DISPLAY LOCATIONS ──
const LOCATIONS_DEFAULT = ['Bar — main counter','Bar — secondary counter','Cellar','Manager office','Terrace'];
const LOCATIONS = (()=>{ try{ const s=localStorage.getItem('bc_locations'); return s?JSON.parse(s):LOCATIONS_DEFAULT.slice(); }catch(e){ return LOCATIONS_DEFAULT.slice(); } })();
function saveLocations(){ try{ localStorage.setItem('bc_locations',JSON.stringify(LOCATIONS)); }catch(e){} }

function renderLocationsList(){
  const el=document.getElementById('locations-list');
  if(!el) return;
  if(!LOCATIONS.length){ el.innerHTML='<div style="color:var(--text3);font-size:13px">No locations yet.</div>'; return; }
  el.innerHTML=LOCATIONS.map((loc,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg3);border-radius:var(--r)">
      <span style="font-size:13px;color:var(--text1);flex:1">📍 ${loc}</span>
      <button class="btn btn-danger btn-sm" onclick="deleteLocation(${i})">🗑</button>
    </div>`).join('');
}

function addLocation(){
  const inp=document.getElementById('new-location-input');
  if(!inp) return;
  const val=inp.value.trim();
  if(!val){ toast('Enter a location name','error'); return; }
  LOCATIONS.push(val);
  saveLocations();
  inp.value='';
  renderLocationsList();
  toast('Location added','info');
}

function deleteLocation(idx){
  showConfirm({icon:'🗑',title:'Delete Location',message:`Remove <b>${LOCATIONS[idx]}</b>?`,confirmLabel:'Delete',danger:true,
    onConfirm:()=>{ LOCATIONS.splice(idx,1); saveLocations(); renderLocationsList(); toast('Location removed','error'); }
  });
}

function populateLocationDropdown(selectId){
  const sel=document.getElementById(selectId);
  if(!sel) return;
  sel.innerHTML=LOCATIONS.map(l=>`<option value="${l}">${l}</option>`).join('');
}

// ── WiFi NETWORKS ──
function renderWifiList(r){
  const el=document.getElementById('wifi-list');
  if(!el) return;
  const networks = r.wifi||[];
  if(!networks.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px">No WiFi networks configured.</div>';
    return;
  }
  el.innerHTML=networks.map((w,i)=>`
    <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:var(--bg3);border-radius:var(--r)">
      <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <label class="fl" style="font-size:10px;margin-bottom:4px">SSID${w.hidden?' (hidden)':''}</label>
          <input data-wifi="${i}" data-field="ssid" value="${w.ssid||''}" placeholder="Network name" style="width:100%;padding:6px 10px;font-size:13px">
        </div>
        <div>
          <label class="fl" style="font-size:10px;margin-bottom:4px">Password</label>
          <input data-wifi="${i}" data-field="pass" type="password" value="${w.pass||''}" placeholder="••••••••" style="width:100%;padding:6px 10px;font-size:13px">
        </div>
        <label class="twrap" style="grid-column:1/-1">
          <span class="toggle"><input type="checkbox" data-wifi="${i}" data-field="hidden" ${w.hidden?'checked':''}><span class="tslider"></span></span>
          <span class="tlabel" style="font-size:12px">Hidden network (SSID not broadcast)</span>
        </label>
      </div>
      <button class="btn btn-danger btn-sm" style="margin-top:4px" onclick="deleteWifiNetwork(${i})">🗑</button>
    </div>`).join('');
}

function addWifiNetwork(){
  const r=RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  if(!r.wifi) r.wifi=[];
  r.wifi.push({ssid:'',pass:'',hidden:false});
  renderWifiList(r);
}

function deleteWifiNetwork(idx){
  const r=RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r||!r.wifi) return;
  showConfirm({icon:'📶',title:'Remove WiFi Network',message:'Remove this WiFi connection?',confirmLabel:'Remove',danger:true,
    onConfirm:()=>{ r.wifi.splice(idx,1); renderWifiList(r); }
  });
}

function saveWifiNetworks(){
  const r=RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  if(!r.wifi) r.wifi=[];
  document.querySelectorAll('[data-wifi]').forEach(el=>{
    const i=parseInt(el.dataset.wifi);
    const f=el.dataset.field;
    if(!r.wifi[i]) r.wifi[i]={ssid:'',pass:'',hidden:false};
    if(f==='hidden') r.wifi[i][f]=el.checked;
    else r.wifi[i][f]=el.value;
  });
  toast('WiFi settings saved','info');
}

// ── DANGER ZONE ──
function suspendRestaurant(){
  const r=RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  showConfirm({
    icon:'🚫',title:'Suspend Restaurant',
    message:`Suspend <b>${r.name}</b>? All users will immediately lose access.`,
    confirmLabel:'Yes, continue',danger:true,
    onConfirm:()=>{
      showConfirm({
        icon:'⚠',title:'Confirm Suspension',
        message:`Final confirmation: suspend <b>${r.name}</b>? You can re-activate it later from the restaurant list.`,
        confirmLabel:'Suspend Now',danger:true,
        onConfirm:()=>{ r.active=false; toast(r.name+' suspended','error'); nav('adminRestaurants',document.querySelector('#navAdmin .nav-item')); }
      });
    }
  });
}

function deleteRestaurant(){
  const r=RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  showConfirm({
    icon:'🗑',title:'Delete Restaurant',
    message:`Delete <b>${r.name}</b>? This will permanently remove all kegs, devices and user data.`,
    confirmLabel:'Yes, delete',danger:true,
    onConfirm:()=>{
      showConfirm({
        icon:'💀',title:'Final Warning',
        message:`This is <b>irreversible</b>. All data for <b>${r.name}</b> will be gone forever. Are you absolutely sure?`,
        confirmLabel:'Delete Forever',danger:true,
        onConfirm:()=>{
          const idx=RESTAURANTS_EXT.findIndex(x=>x.id===currentRestaurantId);
          if(idx>-1) RESTAURANTS_EXT.splice(idx,1);
          toast(r.name+' permanently deleted','error');
          nav('adminRestaurants',document.querySelector('#navAdmin .nav-item'));
        }
      });
    }
  });
}

// ── HOOK nav for devices ──
const _prevNav3 = nav;
nav = function(pageId, el){
  _prevNav3(pageId, el);
  if(pageId==='adminDevices') setTimeout(buildDevicesPage, 50);
};


/* ══════════════════════════════════════════
   RESTAURANT MANAGEMENT — UNIFIED
══════════════════════════════════════════ */

// ── EXTENDED RESTAURANT DATA ──
const RESTAURANTS_EXT = [
  {
    id:1, name:'La Cervecería', city:'Barcelona', country:'Spain',
    emoji:'🍺', plan:'pro', active:true, renewal:'15/04/2026',
    timezone:'Europe/Madrid', language:'es',
    poured_today: 312, keg_changes_today: 2, active_taps: 4,
    low_warning: 20, critical_alert: 10, temp_max: 6, co2_min: 1.5, cleaning_days: 14,
    kegs:[
      {tap:1, beer:'Moritz',       emoji:'🌊', size:50, rem:22.4, co2:2.2, temp:3.8, fob:false, online:true,  sensor_id:'cerv_keg1_s', display_id:'cerv_disp1'},
      {tap:2, beer:'Estrella Damm',emoji:'⭐', size:30, rem:18.9, co2:2.5, temp:4.3, fob:false, online:true,  sensor_id:'cerv_keg2_s', display_id:'cerv_disp1'},
      {tap:3, beer:'Heineken',     emoji:'🍺', size:50, rem:4.2,  co2:2.4, temp:4.1, fob:true,  online:true,  sensor_id:'cerv_keg3_s', display_id:'cerv_disp1'},
      {tap:4, beer:'Voll-Damm',    emoji:'🔶', size:50, rem:38.2, co2:2.3, temp:4.0, fob:false, online:true,  sensor_id:'cerv_keg4_s', display_id:'cerv_disp1'},
    ],
    users:[
      {name:'Simon',           email:'simon',                phone:'',               role:'Owner',   active:true,  lastLogin:'Today'},
      {name:'Carlos Martínez', email:'carlos@cerveceria.es', phone:'+34 612 345 678', role:'Manager', active:true,  lastLogin:'Today 09:14'},
      {name:'Ana García',      email:'ana@cerveceria.es',    phone:'+34 621 987 654', role:'Staff',   active:true,  lastLogin:'Today 08:02'},
    ],
    devices:[
      {id:'cerv_keg1_s', type:'sensor',  keg:'Moritz',       tap:1, online:true,  fw:'v2.1.3', ip:'192.168.1.14', topic:'cerveceria_01/keg/1/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'cerv_keg2_s', type:'sensor',  keg:'Estrella Damm',tap:2, online:true,  fw:'v2.1.3', ip:'192.168.1.15', topic:'cerveceria_01/keg/2/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'cerv_keg3_s', type:'sensor',  keg:'Heineken',     tap:3, online:true,  fw:'v2.1.4', ip:'192.168.1.16', topic:'cerveceria_01/keg/3/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'cerv_keg4_s', type:'sensor',  keg:'Voll-Damm',    tap:4, online:true,  fw:'v2.1.3', ip:'192.168.1.17', topic:'cerveceria_01/keg/4/sensor',   sensors:{flow:true,temp:true,co2:false,fob:true}},
      {id:'cerv_disp1',  type:'display', loc:'Bar — main',   tap:null,online:true,fw:'v2.1.3', ip:'192.168.1.18', topic:'cerveceria_01/display/bar_01', shows:'all'},
    ],
    activity:[
      {icon:'⚠',text:'Heineken Tap #3 is critically low — 4.2L',time:'10:42',color:'var(--red)'},
      {icon:'🛢',text:'Moritz Tap #1 — new keg started (FOB)',time:'09:15',color:'var(--green)'},
      {icon:'📊',text:'Daily report generated — 287L poured',time:'00:00',color:'var(--text3)'},
    ]
  },
  {
    id:2, name:'Pub Dublin', city:'Dublin', country:'Ireland',
    emoji:'🍻', plan:'pro', active:true, renewal:'02/05/2026',
    timezone:'Europe/London', language:'en',
    poured_today: 458, keg_changes_today: 3, active_taps: 2,
    low_warning: 20, critical_alert: 10, temp_max: 6, co2_min: 1.5, cleaning_days: 14,
    kegs:[
      {tap:1, beer:'Guinness',      emoji:'⬛', size:50, rem:49.1, co2:1.2, temp:5.8, fob:false, online:true,  sensor_id:'pub_keg1_s', display_id:'pub_disp1'},
      {tap:2, beer:'Guinness Extra',emoji:'🖤', size:50, rem:12.4, co2:1.8, temp:5.5, fob:false, online:false, sensor_id:'pub_keg2_s', display_id:'pub_disp1'},
    ],
    users:[
      {name:"Sean O'Brien", email:'sean@pubdublin.ie', phone:'+353 87 123 4567', role:'Owner', active:true, lastLogin:'Today 08:30'},
    ],
    devices:[
      {id:'pub_keg1_s', type:'sensor',  keg:'Guinness',       tap:1, online:true,  fw:'v2.1.3', ip:'10.0.0.11', topic:'pubdublin_01/keg/1/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'pub_keg2_s', type:'sensor',  keg:'Guinness Extra', tap:2, online:false, fw:'v2.0.9', ip:'—',         topic:'pubdublin_01/keg/2/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'pub_disp1',  type:'display', loc:'Bar — main',     tap:null,online:true,fw:'v2.1.3', ip:'10.0.0.13', topic:'pubdublin_01/display/bar_01', shows:'all'},
    ],
    activity:[
      {icon:'⚡',text:'pub_keg2_s offline — no heartbeat for 22min',time:'10:18',color:'var(--red)'},
      {icon:'🛢',text:'Guinness Tap #1 — new keg started',time:'08:44',color:'var(--green)'},
    ]
  },
  {
    id:3, name:'Biergarten Munich', city:'Munich', country:'Germany',
    emoji:'🌿', plan:'enterprise', active:true, renewal:'01/06/2026',
    timezone:'Europe/Berlin', language:'de',
    poured_today: 621, keg_changes_today: 4, active_taps: 2,
    low_warning: 20, critical_alert: 10, temp_max: 6, co2_min: 1.5, cleaning_days: 14,
    kegs:[
      {tap:1, beer:'Paulaner Helles', emoji:'🌾', size:50, rem:28.3, co2:2.1, temp:3.9, fob:false, online:true,  sensor_id:'bier_keg1_s', display_id:'bier_disp1'},
      {tap:2, beer:'Weihenstephaner', emoji:'🏔', size:50, rem:41.2, co2:2.3, temp:4.0, fob:false, online:true,  sensor_id:'bier_keg2_s', display_id:'bier_disp1'},
      {tap:3, beer:'Heineken',        emoji:'🍺', size:50, rem:3.1,  co2:2.4, temp:4.1, fob:true,  online:false, sensor_id:'bier_keg3_s', display_id:'bier_disp1'},
    ],
    users:[
      {name:'Hans Weber',  email:'hans@biergarten.de',  phone:'+49 176 1234 5678', role:'Owner',   active:true,  lastLogin:'Yesterday'},
      {name:'Klaus Müller',email:'klaus@biergarten.de', phone:'+49 160 9876 5432', role:'Manager', active:true,  lastLogin:'Today 07:15'},
      {name:'Eva Braun',   email:'eva@biergarten.de',   phone:'+49 151 1111 2222', role:'Staff',   active:false, lastLogin:'3 days ago'},
    ],
    devices:[
      {id:'bier_keg1_s', type:'sensor',  keg:'Paulaner Helles', tap:1, online:true,  fw:'v2.1.4', ip:'172.16.0.5', topic:'biergarten_01/keg/1/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'bier_keg2_s', type:'sensor',  keg:'Weihenstephaner', tap:2, online:true,  fw:'v2.1.4', ip:'172.16.0.6', topic:'biergarten_01/keg/2/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'bier_keg3_s', type:'sensor',  keg:'Heineken',        tap:3, online:false, fw:'v2.1.2', ip:'—',          topic:'biergarten_01/keg/3/sensor',   sensors:{flow:true,temp:true,co2:true,fob:true}},
      {id:'bier_disp1',  type:'display', loc:'Bar — main',      tap:null,online:true,fw:'v2.1.4', ip:'172.16.0.8', topic:'biergarten_01/display/bar_01', shows:'all'},
      {id:'bier_disp2',  type:'display', loc:'Bar — secondary', tap:null,online:true,fw:'v2.1.4', ip:'172.16.0.9', topic:'biergarten_01/display/bar_02', shows:'critical'},
    ],
    activity:[
      {icon:'⚡',text:'bier_keg3_s offline — Heineken Tap #3',time:'10:05',color:'var(--red)'},
      {icon:'🛢',text:'Paulaner Tap #1 — keg change logged',time:'09:30',color:'var(--green)'},
    ]
  },
  {
    id:4, name:'The Red Lion', city:'London', country:'UK',
    emoji:'🔴', plan:'starter', active:false, renewal:'OVERDUE',
    timezone:'Europe/London', language:'en',
    poured_today: 0, keg_changes_today: 0, active_taps: 0,
    low_warning: 20, critical_alert: 10, temp_max: 6, co2_min: 1.5, cleaning_days: 14,
    kegs:[], users:[{name:'James Smith',email:'james@redlion.co.uk',phone:'+44 7700 900123',role:'Manager',active:false,lastLogin:'5 days ago'}],
    devices:[], activity:[{icon:'💳',text:'Payment failed — account suspended',time:'2 days ago',color:'var(--red)'}]
  },
];

let currentRestaurantId = null;
let currentDetailTab = 'overview';

// ── RESTAURANTS LIST ──
// restFilter already declared above

function renderRestList(){
  const q   = (document.getElementById('restSearch')?.value||'').toLowerCase();
  const el  = document.getElementById('restListGrid');
  if(!el) return;
  let filtered = RESTAURANTS_EXT.filter(r=>{
    if(restFilter==='active'    && !r.active) return false;
    if(restFilter==='suspended' &&  r.active) return false;
    if(q && !r.name.toLowerCase().includes(q) && !r.city.toLowerCase().includes(q)) return false;
    return true;
  });
  const cnt = document.getElementById('restCount');
  if(cnt) cnt.textContent = filtered.length + ' restaurants';

  el.innerHTML = filtered.map(r => {
    const offlineDevices = r.devices.filter(d=>!d.online).length;
    const planColor = {pro:'tg-amber',enterprise:'tg-blue',starter:'tg-gray'}[r.plan]||'tg-gray';
    return `
    <div class="rest-list-card ${r.active?'':'suspended'}" onclick="openRestaurantDetail(${r.id})">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:32px">${r.emoji}</span>
          <div>
            <div style="font-family:var(--fh);font-size:17px;font-weight:600">${r.name}</div>
            <div style="font-size:12px;color:var(--text3)">${r.city}, ${r.country}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <span class="tag ${planColor}">${r.plan}</span>
          <span class="sp ${r.active?'sp-on':'sp-off'}" style="font-size:11px"><span class="sp-dot"></span>${r.active?t('active'):t('suspended')}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
        <div style="text-align:center;padding:8px;background:var(--bg3);border-radius:var(--r)">
          <div style="font-family:var(--fm);font-size:16px;font-weight:500;color:var(--text1)">${r.poured_today}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">L today</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--bg3);border-radius:var(--r)">
          <div style="font-family:var(--fm);font-size:16px;font-weight:500;color:${r.kegs.length?'var(--text1)':'var(--text3)'}">${r.kegs.length}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">kegs</div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--bg3);border-radius:var(--r)">
          <div style="font-family:var(--fm);font-size:16px;font-weight:500;color:${r.users.length?'var(--text1)':'var(--text3)'}">${r.users.length}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">users</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:11px;color:${r.renewal==='OVERDUE'?'var(--red)':'var(--text3)'};font-family:var(--fm)">
          ${r.renewal==='OVERDUE'?'⚠ Payment overdue':'Renewal: '+r.renewal}
        </div>
        ${offlineDevices>0
          ?`<span class="tag tg-red" style="font-size:10px">⚡ ${offlineDevices} device${offlineDevices>1?'s':''} offline</span>`
          :(r.devices.length>0?`<span class="tag tg-green" style="font-size:10px">✓ All online</span>`:'')
        }
      </div>
    </div>`;
  }).join('');

  if(!filtered.length) el.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text3)">No restaurants found</div>';
}

function setRestFilter(f,el){
  restFilter=f;
  document.querySelectorAll('.rest-filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderRestList();
}

// ── OPEN RESTAURANT DETAIL ──
function openRestaurantDetail(id){
  const r = RESTAURANTS_EXT.find(x=>x.id===id);
  if(!r) return;
  currentRestaurantId = id;

  // Update header
  document.getElementById('detailRestName').textContent = r.emoji + '  ' + r.name;
  document.getElementById('detailRestPlan').textContent = r.plan;
  document.getElementById('detailRestStatus').innerHTML = `<span class="sp ${r.active?'sp-on':'sp-off'}" style="font-size:12px"><span class="sp-dot"></span>${r.active?t('active'):t('suspended')}</span>`;

  // Populate settings tab fields
  const setField = (id,val)=>{ const el=document.getElementById(id); if(el) el.value=val; };
  setField('ds-name', r.name);
  setField('ds-city', r.city);
  setField('ds-country', r.country);
  setField('ds-plan', r.plan);
  setField('ds-tz', r.timezone);
  setField('ds-lang', r.language);
  const dpEl = document.getElementById('dpDetailRenewal');
  if(dpEl && r.renewal !== 'OVERDUE') dpEl.value = r.renewal;

  // Switch to detail page and overview tab
  nav('adminRestaurantDetail', null);
  switchDetailTab('overview', document.querySelector('#detailTabs .detail-tab'));
}

// ── DETAIL TABS ──
function switchDetailTab(tab, el){
  currentDetailTab = tab;
  ['overview','kegs','users','devices','settings'].forEach(t=>{
    const panel = document.getElementById('dtab-'+t);
    if(panel) panel.style.display = t===tab ? 'block' : 'none';
  });
  document.querySelectorAll('.detail-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');

  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;

  if(tab==='overview')  renderDetailOverview(r);
  if(tab==='kegs')      renderDetailKegs(r);
  if(tab==='users')     renderDetailUsers(r);
  if(tab==='devices')   renderDetailDevices(r);
  if(tab==='settings'){  renderDetailSchedule(r); renderWifiList(r); }
}

// ── OVERVIEW TAB ──
function setOverviewPeriod(days, btn){
  const to   = new Date();
  const from = new Date(); from.setDate(from.getDate() - days + 1);
  const fmt  = d => d.toISOString().slice(0,10);
  document.getElementById('overview-date-from').value = fmt(from);
  document.getElementById('overview-date-to').value   = fmt(to);
  document.querySelectorAll('.overview-period-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  refreshOverview();
}

function refreshOverview(){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(r) renderDetailOverview(r);
}

function renderDetailOverview(r){
  // Init dates if not set
  const fromEl = document.getElementById('overview-date-from');
  const toEl   = document.getElementById('overview-date-to');
  if(!fromEl.value){
    const to=new Date(), from=new Date(); from.setDate(from.getDate()-6);
    fromEl.value=from.toISOString().slice(0,10);
    toEl.value=to.toISOString().slice(0,10);
  }
  const fromDate = new Date(fromEl.value);
  const toDate   = new Date(toEl.value);
  const days = Math.round((toDate-fromDate)/(86400000))+1;
  const lbl  = document.getElementById('overview-period-label');
  if(lbl) lbl.textContent = `${fromEl.value} → ${toEl.value} (${days}d)`;
  const chartLbl = document.getElementById('overview-chart-label');
  if(chartLbl) chartLbl.textContent = `${days} days`;

  const stats = document.getElementById('detail-stats');
  const totalPoured = (r.poured_today * days * (0.8+Math.random()*0.4)).toFixed(1);
  if(stats) stats.innerHTML = `
    <div class="stat-card sc-amber"><div class="stat-label">Total Poured</div><div class="stat-val">${totalPoured} <span>L</span></div></div>
    <div class="stat-card sc-green"><div class="stat-label">Keg Changes</div><div class="stat-val">${Math.floor(days*0.8)} <span>changes</span></div></div>
    <div class="stat-card sc-blue"><div class="stat-label">Active Taps</div><div class="stat-val">${r.kegs.filter(k=>k.online).length} <span>/ ${r.kegs.length}</span></div></div>
    <div class="stat-card sc-${r.devices.filter(d=>!d.online).length>0?'red':'green'}">
      <div class="stat-label">Devices</div>
      <div class="stat-val">${r.devices.filter(d=>d.online).length} <span>/ ${r.devices.length} online</span></div>
    </div>`;

  const act = document.getElementById('detail-activity');
  if(act) act.innerHTML = r.activity.map(a=>`
    <div class="feed-item">
      <div class="feed-icon">${a.icon}</div>
      <div><div class="feed-text" style="color:${a.color}">${a.text}</div><div class="feed-time">${a.time}</div></div>
    </div>`).join('') || '<div style="padding:20px 0;color:var(--text3);text-align:center">No activity in this period</div>';

  // Alerts for period
  const alertTypes = [
    {icon:'🌡',color:'var(--red)',   type:'Temperature',  msg:'Temperature exceeded 7°C on Tap #3 — Heineken'},
    {icon:'🛢',color:'var(--amber)', type:'Low Keg',      msg:'Keg low (12%) — Tap #1 Moritz'},
    {icon:'⚡',color:'var(--red)',   type:'ESP32 Offline',msg:'Sensor esp_cerv_tap2_s went offline for 4 min'},
    {icon:'✅',color:'var(--green)', type:'Keg Changed',  msg:'New keg installed — Tap #3 Heineken 50L'},
    {icon:'💧',color:'var(--blue)',  type:'CO₂ Low',      msg:'CO₂ pressure below 1.5 bar — Tap #2'},
  ];
  const alertCount = Math.min(days*2, alertTypes.length * 2);
  const mockAlerts = Array.from({length:Math.min(alertCount,alertTypes.length)},(_,i)=>{
    const a = alertTypes[i % alertTypes.length];
    const d = new Date(fromDate); d.setDate(d.getDate()+Math.floor(Math.random()*days));
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:18px">${a.icon}</div>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500;color:${a.color}">${a.type}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">${a.msg}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);font-family:var(--fm);white-space:nowrap">${d.toLocaleDateString('en-GB')}</div>
    </div>`;
  });
  const alertList = document.getElementById('overview-alerts-list');
  const alertCountEl = document.getElementById('overview-alert-count');
  if(alertList) alertList.innerHTML = mockAlerts.length ? mockAlerts.join('') : '<div style="padding:20px;color:var(--text3);text-align:center;font-size:13px">No alerts in this period</div>';
  if(alertCountEl) alertCountEl.textContent = mockAlerts.length + ' alerts';

  setTimeout(()=>renderDetailPourChart(r, days), 80);
}

function renderDetailPourChart(r){
  const ctx = document.getElementById('chartDetailPour');
  if(!ctx) return;
  if(window._detailPourChart) window._detailPourChart.destroy();
  const data = Array.from({length:7},()=>Math.floor(Math.random()*200+100));
  window._detailPourChart = new Chart(ctx,{type:'bar',data:{
    labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    datasets:[{data,backgroundColor:'rgba(240,165,0,.15)',borderColor:'#f0a500',borderWidth:1.5,borderRadius:4}]
  },options:{plugins:{legend:{display:false}},scales:{x:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}},y:{grid:{color:'#2e3240'},ticks:{color:'#5c6378',font:{family:'JetBrains Mono',size:10}}}},responsive:true,maintainAspectRatio:false}});
}

// ── KEGS TAB ──
function renderDetailKegs(r){
  const el = document.getElementById('detail-kegs-list');
  if(!el) return;
  el.innerHTML = r.kegs.map(k=>{
    const pct = (k.rem/k.size*100).toFixed(0);
    const fill = pct<=10?'fill-red':pct<=20?'fill-amber':'fill-green';
    const sensors = r.devices.find(d=>d.id===k.sensor_id);
    return `
    <div class="keg-detail-row">
      <div style="display:flex;align-items:flex-start;gap:16px">
        <div style="width:48px;height:48px;border-radius:8px;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${k.emoji}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-family:var(--fh);font-size:16px;font-weight:600">${k.beer}</span>
            <span class="tag tg-amber" style="font-size:11px">Tap #${k.tap}</span>
            <span class="tag tg-gray" style="font-size:11px">${k.size}L keg</span>
            ${k.fob?'<span class="tag tg-red" style="font-size:10px">FOB ACTIVE</span>':''}
            <span class="sp ${k.online?'sp-on':'sp-off'}" style="font-size:11px"><span class="sp-dot"></span>${k.online?'Online':'Offline'}</span>
          </div>
          <div class="prog-bar" style="height:10px;margin-bottom:6px"><div class="prog-fill ${fill}" style="width:${pct}%"></div></div>
          <div style="display:flex;gap:20px;margin-bottom:8px">
            <span style="font-size:12px;color:var(--text2)"><strong style="font-family:var(--fm);color:var(--text1)">${k.rem.toFixed(1)}</strong> / ${k.size}L remaining (${pct}%)</span>
            <span style="font-size:12px;color:var(--text3)">🌡 ${k.temp}°C</span>
            <span style="font-size:12px;color:var(--text3)">💨 ${k.co2} bar CO₂</span>
          </div>
          ${k.sensor_id?`<div style="font-size:11px;color:var(--text3);font-family:var(--fm)">Sensor: <span style="color:var(--green)">${k.sensor_id}</span> · Topic: <span style="color:var(--amber)">${sensors?sensors.topic:'unassigned'}</span></div>`:''}
        </div>
        <div class="flex g6" style="flex-shrink:0">
          <button class="btn btn-ghost btn-sm" onclick="openEditKeg(${k.tap})">✏</button>
          <button class="btn btn-ghost btn-sm" onclick="toast('Manual keg change logged','info')">🛢 New Keg</button>
          <button class="btn btn-danger btn-sm" onclick="deleteKeg(${k.tap})">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('') + `
  <div style="padding:14px;border:2px dashed var(--border);border-radius:var(--rl);text-align:center;cursor:pointer;color:var(--text3);transition:all .15s" onmouseenter="this.style.borderColor='var(--amber)';this.style.color='var(--amber)'" onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text3)'" onclick="openAddKegToRest()">
    + Add another keg / tap
  </div>`;
}

function openAddKegToRest(){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const nextTap = r.kegs.length ? Math.max(...r.kegs.map(k=>k.tap)) + 1 : 1;
  const restIn = document.getElementById('ak-rest');
  const tapIn  = document.getElementById('ak-tap');
  if(restIn) restIn.value = r.name;
  if(tapIn)  tapIn.value  = nextTap;
  // reset beer selection
  const beerSearch = document.getElementById('ak-beer-search');
  if(beerSearch) beerSearch.value = '';
  const beerId = document.getElementById('ak-beer-id');
  if(beerId) beerId.value = '';
  const logoRow = document.getElementById('ak-logo-row');
  if(logoRow) logoRow.style.display = 'none';
  const dd = document.getElementById('ak-beer-dropdown');
  if(dd) dd.style.display = 'none';
  openM('mAddKeg');
}

function filterAkBeers(){
  const q  = (document.getElementById('ak-beer-search')?.value||'').toLowerCase();
  const dd = document.getElementById('ak-beer-dropdown');
  if(!dd) return;
  const list = q ? BEER_LIBRARY.filter(b=>b.name.toLowerCase().includes(q)||((b.style||'').toLowerCase().includes(q))) : BEER_LIBRARY;
  if(!list.length){ dd.style.display='none'; return; }
  dd.innerHTML = list.map(b=>`
    <div onclick="selectAkBeer(${b.id})" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseenter="this.style.background='var(--bg4)'" onmouseleave="this.style.background=''">
      <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${b.logo?`<img src="${b.logo}" style="width:32px;height:32px;object-fit:contain" onerror="this.parentElement.textContent='${b.emoji}'">`:`<span style="font-size:22px">${b.emoji}</span>`}</div>
      <div><div style="font-size:13px;font-weight:500;color:var(--text1)">${b.name}</div><div style="font-size:11px;color:var(--text3)">${b.style||''}${b.abv?' · '+b.abv+'%':''}</div></div>
    </div>`).join('');
  dd.style.display = 'block';
}

function selectAkBeer(id){
  const b = BEER_LIBRARY.find(x=>x.id===id);
  if(!b) return;
  document.getElementById('ak-beer-search').value = b.name;
  document.getElementById('ak-beer-id').value = id;
  document.getElementById('ak-beer-dropdown').style.display = 'none';
  const logoRow = document.getElementById('ak-logo-row');
  const logoPrev = document.getElementById('ak-logo-preview');
  const nameDisp = document.getElementById('ak-beer-name-display');
  logoRow.style.display = '';
  nameDisp.textContent = b.name + (b.style ? ' · ' + b.style : '');
  logoPrev.innerHTML = b.logo
    ? `<img src="${b.logo}" style="width:42px;height:42px;object-fit:contain" onerror="this.parentElement.textContent='${b.emoji}'">`
    : `<span style="font-size:28px">${b.emoji}</span>`;
}

function saveNewKeg(){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const beerId = parseInt(document.getElementById('ak-beer-id')?.value);
  if(!beerId){ toast('Please select a beer from the library','error'); return; }
  const beer = BEER_LIBRARY.find(x=>x.id===beerId);
  if(!beer) return;
  const tap  = parseInt(document.getElementById('ak-tap')?.value)||r.kegs.length+1;
  const size = parseInt(document.getElementById('ak-size')?.value)||50;
  r.kegs.push({
    tap, beer:beer.name, emoji:beer.emoji, logo:beer.logo||'',
    size, rem:size, co2:2.2, temp:4.0, fob:false, online:false,
    temp_max: parseFloat(document.getElementById('ak-temp')?.value)||6,
    co2_min:  parseFloat(document.getElementById('ak-co2')?.value)||1.5,
    flow_min: parseFloat(document.getElementById('ak-flow')?.value)||0.5,
    low_pct:  parseInt(document.getElementById('ak-low')?.value)||20,
    crit_pct: parseInt(document.getElementById('ak-critical')?.value)||10,
  });
  closeM('mAddKeg');
  renderDetailKegs(r);
  toast('Keg added — Tap #'+tap+' · '+beer.name,'info');
}

// ── USERS TAB ──
function renderDetailUsers(r){
  const tbody = document.getElementById('detail-users-table');
  if(!tbody) return;
  tbody.innerHTML = r.users.map((u,i)=>`
    <tr>
      <td><div class="fxc g8"><div class="u-av" style="width:26px;height:26px;font-size:11px">${u.name.charAt(0)}</div><span class="td-name">${u.name}</span></div></td>
      <td class="mono" style="font-size:12px">${u.email}</td>
      <td class="mono" style="font-size:12px;color:var(--text2)">${u.phone||'—'}</td>
      <td><span class="tag ${u.role==='Owner'?'tg-amber':u.role==='Staff'?'tg-gray':'tg-blue'}">${u.role}</span></td>
      <td class="mono" style="font-size:12px;color:var(--text3)">${u.lastLogin}</td>
      <td><span class="sp ${u.active?'sp-on':'sp-off'}"><span class="sp-dot"></span>${u.active?t('active'):t('disabled')}</span></td>
      <td><div class="flex g6">
        <button class="btn btn-ghost btn-sm" title="Edit user" onclick="openEditUser(${i})">✏</button>
        <button class="btn btn-ghost btn-sm" title="Reset password" onclick="showConfirm({icon:'🔑',title:'Reset Password',message:'Send a password reset link to <b>${u.email}</b>?',confirmLabel:'Send Reset',danger:false,onConfirm:()=>toast('Password reset sent to ${u.email}','info')})">🔑</button>
        ${u.active
          ?`<button class="btn btn-danger btn-sm" onclick="toggleUserActive(${i})">${t('disable')}</button>`
          :`<button class="btn btn-success btn-sm" onclick="toggleUserActive(${i})">${t('enable')}</button>`}
        <button class="btn btn-danger btn-sm" title="Delete user" onclick="deleteUser(${i})">🗑</button>
      </div></td>
    </tr>`).join('')
  + `<tr><td colspan="7" style="padding:8px"><button class="btn btn-ghost btn-sm" onclick="openAddUserToRest()" style="width:100%;justify-content:center">+ Add User to this restaurant</button></td></tr>`;
}

function openAddUserToRest(){
  // clear fields
  ['addUserFirst','addUserLast','addUserEmail','addUserPhone'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  openM('mAddUser');
}

function saveNewUser(){
  const first = document.getElementById('addUserFirst')?.value.trim();
  const last  = document.getElementById('addUserLast')?.value.trim();
  const email = document.getElementById('addUserEmail')?.value.trim();
  const role  = document.getElementById('addUserRole')?.value;
  if(!first){ toast('First name is required','error'); return; }
  if(!last){  toast('Last name is required','error');  return; }
  if(!email){ toast('Email is required','error');      return; }
  if(!role){  toast('Please select a role','error');   return; }
  const phone = document.getElementById('addUserPhone')?.value.trim()||'';
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(r) r.users.push({ name:first+' '+last, email, phone, role, active:true, lastLogin:'Never' });
  closeM('mAddUser');
  if(r) renderDetailUsers(r);
  toast('User created — temp password sent to '+email,'info');
}

function openEditUser(idx){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r||!r.users[idx]) return;
  const u = r.users[idx];
  document.getElementById('eu-name').value  = u.name||'';
  document.getElementById('eu-email').value = u.email||'';
  document.getElementById('eu-phone').value = u.phone||'';
  document.getElementById('eu-idx').value   = idx;
  const roleEl = document.getElementById('eu-role');
  if(roleEl){ roleEl.innerHTML=getRoleOptions(); roleEl.value=u.role||''; }
  openM('mEditUser');
}

function saveEditUser(){
  const idx   = parseInt(document.getElementById('eu-idx')?.value);
  const r     = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r||isNaN(idx)||!r.users[idx]) return;
  const name  = document.getElementById('eu-name')?.value.trim();
  const email = document.getElementById('eu-email')?.value.trim();
  if(!name){  toast('Name is required','error');  return; }
  if(!email){ toast('Email is required','error'); return; }
  r.users[idx].name  = name;
  r.users[idx].email = email;
  r.users[idx].phone = document.getElementById('eu-phone')?.value.trim()||r.users[idx].phone||'';
  r.users[idx].role  = document.getElementById('eu-role')?.value||r.users[idx].role;
  closeM('mEditUser');
  renderDetailUsers(r);
  toast('User updated','info');
}

function deleteUser(idx){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r||!r.users[idx]) return;
  const u = r.users[idx];
  showConfirm({
    icon:'🗑', title:'Delete User',
    message:`Remove <b>${u.name}</b> from this restaurant? They will lose all access.`,
    confirmLabel:'Delete User', danger:true,
    onConfirm:()=>{ r.users.splice(idx,1); renderDetailUsers(r); toast('User removed','error'); }
  });
}

function toggleUserActive(idx){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r||!r.users[idx]) return;
  const u = r.users[idx];
  const willEnable = !u.active;
  showConfirm({
    icon: willEnable?'✅':'🚫',
    title: willEnable?'Enable User':'Disable User',
    message: willEnable
      ?`Re-enable access for <b>${u.name}</b>?`
      :`Disable access for <b>${u.name}</b>? They won't be able to log in.`,
    confirmLabel: willEnable?'Enable':'Disable', danger:!willEnable,
    onConfirm:()=>{ u.active=willEnable; renderDetailUsers(r); toast(u.name+' '+(willEnable?'enabled':'disabled'),willEnable?'info':'error'); }
  });
}

// ── KEG EDIT / DELETE ──
let currentEditKegTap = null;

function openEditKeg(tap){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const k = r.kegs.find(x=>x.tap===tap);
  if(!k) return;
  currentEditKegTap = tap;
  document.getElementById('ek-rest').value = r.name;
  document.getElementById('ek-tap').value  = k.tap;
  const sizeEl = document.getElementById('ek-size');
  if(sizeEl){ for(let o of sizeEl.options){ o.selected=(parseInt(o.value)===k.size); } }
  document.getElementById('ek-beer-search').value = k.beer;
  document.getElementById('ek-beer-id').value = '';
  document.getElementById('ek-beer-dropdown').style.display = 'none';
  const b = BEER_LIBRARY.find(x=>x.name===k.beer);
  const logoPrev = document.getElementById('ek-logo-preview');
  const nameDisp = document.getElementById('ek-beer-name-display');
  if(b){
    document.getElementById('ek-beer-id').value = b.id;
    nameDisp.textContent = b.name+(b.style?' · '+b.style:'');
    logoPrev.innerHTML = b.logo
      ?`<img src="${b.logo}" style="width:42px;height:42px;object-fit:contain" onerror="this.parentElement.textContent='${b.emoji}'">`
      :`<span style="font-size:28px">${b.emoji}</span>`;
  } else {
    nameDisp.textContent = k.beer;
    logoPrev.textContent = k.emoji||'🍺';
  }
  document.getElementById('ek-temp').value = k.temp_max||6;
  document.getElementById('ek-co2').value  = k.co2_min||1.5;
  document.getElementById('ek-flow').value = k.flow_min||0.5;
  document.getElementById('ek-low').value  = k.low_pct||20;
  document.getElementById('ek-critical').value = k.crit_pct||10;
  openM('mEditKeg');
}

function filterEkBeers(){
  const q  = (document.getElementById('ek-beer-search')?.value||'').toLowerCase();
  const dd = document.getElementById('ek-beer-dropdown');
  if(!dd) return;
  const list = q ? BEER_LIBRARY.filter(b=>b.name.toLowerCase().includes(q)||((b.style||'').toLowerCase().includes(q))) : BEER_LIBRARY;
  if(!list.length){ dd.style.display='none'; return; }
  dd.innerHTML = list.map(b=>`
    <div onclick="selectEkBeer(${b.id})" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" onmouseenter="this.style.background='var(--bg4)'" onmouseleave="this.style.background=''">
      <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${b.logo?`<img src="${b.logo}" style="width:32px;height:32px;object-fit:contain" onerror="this.parentElement.textContent='${b.emoji}'">`:`<span style="font-size:22px">${b.emoji}</span>`}</div>
      <div><div style="font-size:13px;font-weight:500;color:var(--text1)">${b.name}</div><div style="font-size:11px;color:var(--text3)">${b.style||''}${b.abv?' · '+b.abv+'%':''}</div></div>
    </div>`).join('');
  dd.style.display = 'block';
}

function selectEkBeer(id){
  const b = BEER_LIBRARY.find(x=>x.id===id);
  if(!b) return;
  document.getElementById('ek-beer-search').value = b.name;
  document.getElementById('ek-beer-id').value = id;
  document.getElementById('ek-beer-dropdown').style.display = 'none';
  document.getElementById('ek-beer-name-display').textContent = b.name+(b.style?' · '+b.style:'');
  document.getElementById('ek-logo-preview').innerHTML = b.logo
    ?`<img src="${b.logo}" style="width:42px;height:42px;object-fit:contain" onerror="this.parentElement.textContent='${b.emoji}'">`
    :`<span style="font-size:28px">${b.emoji}</span>`;
}

function saveEditKeg(){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const k = r.kegs.find(x=>x.tap===currentEditKegTap);
  if(!k) return;
  const beerId = parseInt(document.getElementById('ek-beer-id')?.value);
  if(beerId){
    const beer = BEER_LIBRARY.find(x=>x.id===beerId);
    if(beer){ k.beer=beer.name; k.emoji=beer.emoji; k.logo=beer.logo||''; }
  } else {
    k.beer = document.getElementById('ek-beer-search')?.value.trim()||k.beer;
  }
  k.size     = parseInt(document.getElementById('ek-size')?.value)||k.size;
  k.temp_max = parseFloat(document.getElementById('ek-temp')?.value)||k.temp_max;
  k.co2_min  = parseFloat(document.getElementById('ek-co2')?.value)||k.co2_min;
  k.flow_min = parseFloat(document.getElementById('ek-flow')?.value)||k.flow_min;
  k.low_pct  = parseInt(document.getElementById('ek-low')?.value)||k.low_pct;
  k.crit_pct = parseInt(document.getElementById('ek-critical')?.value)||k.crit_pct;
  closeM('mEditKeg');
  renderDetailKegs(r);
  toast('Keg updated — Tap #'+k.tap+' · '+k.beer,'info');
}

function deleteKeg(tap){
  const r = RESTAURANTS_EXT.find(x=>x.id===currentRestaurantId);
  if(!r) return;
  const k = r.kegs.find(x=>x.tap===tap);
  if(!k) return;
  showConfirm({
    icon:'🗑', title:'Delete Keg',
    message:`Remove <b>${k.beer}</b> from Tap #${k.tap}? This cannot be undone.`,
    confirmLabel:'Delete Keg', danger:true,
    onConfirm:()=>{ r.kegs=r.kegs.filter(x=>x.tap!==tap); renderDetailKegs(r); toast('Keg removed from Tap #'+tap,'error'); }
  });
}

// ── DEVICES TAB ──
function renderDetailDevices(r){
  const el = document.getElementById('detail-devices-list');
  if(!el) return;

  const sensors  = r.devices.filter(d=>d.type==='sensor');
  const displays = r.devices.filter(d=>d.type==='display');

  const sensorRows = sensors.length ? sensors.map(d=>deviceDetailRow(d)).join('') :
    '<div style="padding:12px;color:var(--text3);font-size:13px">No sensors registered yet</div>';

  const displayRows = displays.length ? displays.map(d=>deviceDetailRow(d)).join('') :
    '<div style="padding:12px;color:var(--text3);font-size:13px">No display units registered yet</div>';

  el.innerHTML = `
    <div style="font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">🌡 Sensor Units — Cellar (${sensors.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">${sensorRows}</div>
    <div style="font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">📺 Display Units — Bar (${displays.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">${displayRows}</div>
    <button class="btn btn-primary btn-sm" onclick="openAddDeviceToRest()">+ Register New Device</button>`;
}

function deviceDetailRow(d){
  const online = d.online;
  const dot = `<span style="width:8px;height:8px;border-radius:50%;background:${online?'var(--green)':'var(--red)'};${online?'box-shadow:0 0 6px var(--green)':''}display:inline-block;flex-shrink:0;margin-top:3px"></span>`;
  const fwBadge = d.fw==='v2.1.4'
    ? `<span class="tag tg-green" style="font-size:10px">fw ${d.fw}</span>`
    : `<span class="tag tg-amber" style="font-size:10px;cursor:pointer" onclick="toast('OTA scheduled','info')" title="Update available">fw ${d.fw} ↑</span>`;
  const sensorBadges = d.type==='sensor' ? `
    <div class="flex g6" style="margin-top:5px;flex-wrap:wrap">
      ${d.sensors.flow ?'<span class="tag tg-blue" style="font-size:10px">⚡ Flow</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.4">Flow</span>'}
      ${d.sensors.temp ?'<span class="tag tg-blue" style="font-size:10px">🌡 Temp</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.4">Temp</span>'}
      ${d.sensors.co2  ?'<span class="tag tg-blue" style="font-size:10px">💨 CO₂</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.4">CO₂</span>'}
      ${d.sensors.fob  ?'<span class="tag tg-blue" style="font-size:10px">🔘 FOB</span>':'<span class="tag tg-gray" style="font-size:10px;opacity:.4">FOB</span>'}
    </div>` : `<div style="font-size:11px;color:var(--text3);margin-top:4px">Shows: ${d.shows==='all'?'All kegs (cycling)':d.shows} · Location: ${d.loc}</div>`;
  return `
  <div class="device-detail-row">
    ${dot}
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">
        <span style="font-family:var(--fm);font-size:12px;font-weight:500;color:var(--text1)">${d.id}</span>
        ${d.type==='sensor'?`<span class="tag tg-amber" style="font-size:10px">Keg: ${d.keg} · Tap #${d.tap}</span>`:`<span class="tag tg-blue" style="font-size:10px">📺 Display</span>`}
        ${fwBadge}
        ${!online?`<span style="font-size:11px;color:var(--red)">● Offline</span>`:''}
      </div>
      <div style="font-size:11px;color:var(--text3);font-family:var(--fm)">
        <span style="color:var(--green)">${d.topic}</span> · IP: ${d.ip}
      </div>
      ${sensorBadges}
    </div>
    <div class="flex g6">
      <button class="btn btn-ghost btn-sm" onclick="downloadDeviceScriptById('${d.id}')" title="Download ESP32 script">⤓</button>
      <button class="btn btn-ghost btn-sm" onclick="openEditDevice('${d.id}')" title="Edit device">✏</button>
      <button class="btn btn-ghost btn-sm" onclick="toast('Ping sent','info')" title="Ping">📡</button>
      <button class="btn btn-danger btn-sm" onclick="deleteDevice('${d.id}')" title="Delete device">🗑</button>
    </div>
  </div>`;
}

// ── SETTINGS: schedule ──
const DAYS_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DEFAULT_HOURS = [
  {open:'',close:'',on:false},{open:'12:00',close:'23:30',on:true},{open:'12:00',close:'23:30',on:true},
  {open:'12:00',close:'23:30',on:true},{open:'12:00',close:'00:30',on:true},{open:'12:00',close:'01:30',on:true},
  {open:'13:00',close:'02:00',on:true}
];
function renderDetailSchedule(r){
  const el = document.getElementById('detail-schedule');
  if(!el) return;
  el.innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:14px;font-family:var(--fm)">${t('schedule_hint')}</div>
    ${DEFAULT_HOURS.map((h,i)=>`
      <div class="sched-day">
        <div class="day-name">${t(DAYS_KEYS[i])}</div>
        <label class="twrap" style="margin-right:8px"><span class="toggle"><input type="checkbox" id="sched-on-${i}" ${h.on?'checked':''} onchange="toggleSchedDay(${i})"><span class="tslider"></span></span></label>
        <input type="time" id="sched-open-${i}" value="${h.open}" style="width:96px" ${h.on?'':'disabled'}>
        <span style="color:var(--text3);font-size:12px;margin:0 6px">→</span>
        <input type="time" id="sched-close-${i}" value="${h.close}" style="width:96px" ${h.on?'':'disabled'}>
      </div>`).join('')}
    <div style="margin-top:14px">
      <button class="btn btn-primary" onclick="toast(t('saved'),'info')">Save Schedule</button>
    </div>`;
}

function toggleSchedDay(i){
  const on = document.getElementById('sched-on-'+i)?.checked;
  const openIn  = document.getElementById('sched-open-'+i);
  const closeIn = document.getElementById('sched-close-'+i);
  if(openIn)  openIn.disabled  = !on;
  if(closeIn) closeIn.disabled = !on;
}

// ── ADD RESTAURANT WIZARD ──
function openAddRestaurantWizard(){
  restStep(1);
  openM('mAddRest');
}

// ── BEER LIBRARY PAGE ──
function buildBeerLibraryPage(){
  renderBeerLibraryGrid();
}

// ── UPDATE nav() for new pages ──
const _prevNav4 = nav;
nav = function(pageId, el){
  _prevNav4(pageId, el);
  if(pageId==='adminRestaurants')       setTimeout(renderRestList, 50);
  if(pageId==='adminBeerLibrary')       setTimeout(buildBeerLibraryPage, 50);
  if(pageId==='adminRestaurantDetail')  { /* tabs handle rendering */ }
};

// Add to titles map dynamically
const _dt = nav;
setTimeout(()=>{
  // patch titles for new pages
}, 0);


/* ══════════════════════════════════════════
   BEER STYLES MANAGEMENT
══════════════════════════════════════════ */

// Master list of beer styles — used in Beer Library modal selects and filter
let BEER_STYLES = [
  {id:1, name:'Lager',      desc:'Clean, crisp, bottom-fermented',          abv_min:4.0, abv_max:5.5},
  {id:2, name:'Pilsner',    desc:'Light, hoppy Lager variant',               abv_min:4.0, abv_max:5.5},
  {id:3, name:'Ale',        desc:'Top-fermented, broad category',            abv_min:4.5, abv_max:7.0},
  {id:4, name:'Stout',      desc:'Dark, roasted malt flavour',               abv_min:4.0, abv_max:8.0},
  {id:5, name:'Porter',     desc:'Dark ale, slightly lighter than stout',    abv_min:4.0, abv_max:7.0},
  {id:6, name:'Wheat',      desc:'Brewed with wheat, hazy and smooth',       abv_min:4.0, abv_max:5.5},
  {id:7, name:'IPA',        desc:'India Pale Ale, heavily hopped',           abv_min:5.5, abv_max:8.0},
  {id:8, name:'Pale Ale',   desc:'Balanced, hoppy and easy-drinking',        abv_min:4.5, abv_max:6.0},
  {id:9, name:'Dark Ale',   desc:'Malty, rich dark top-fermented',           abv_min:4.5, abv_max:7.0},
  {id:10,name:'Sour Ale',   desc:'Tart, acidic fermentation character',      abv_min:3.5, abv_max:7.0},
  {id:11,name:'Red Ale',    desc:'Caramel malt with light hop bitterness',   abv_min:4.0, abv_max:6.0},
  {id:12,name:'Blonde Ale', desc:'Light, accessible, easy-drinking',         abv_min:4.0, abv_max:5.5},
];

// Populate all style selects in the DOM
function populateStyleSelects(){
  const selects = document.querySelectorAll('#nb-style, #eb-style, #beerStyleFilter, #newStylePreview');
  selects.forEach(sel => {
    if(!sel) return;
    const isFilter = sel.id === 'beerStyleFilter';
    const current  = sel.value;
    sel.innerHTML  = isFilter ? '<option value="">All Styles</option>' : '<option value="">— Select style —</option>';
    BEER_STYLES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if(current) sel.value = current;
  });
}

function renderStylesList(){
  const el = document.getElementById('stylesList');
  const cnt = document.getElementById('styleCount');
  if(!el) return;
  if(cnt) cnt.textContent = BEER_STYLES.length + ' styles';

  el.innerHTML = BEER_STYLES.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--border);transition:background .12s" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:var(--text1)">${s.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${s.desc} · ${s.abv_min}–${s.abv_max}% ABV</div>
      </div>
      <span class="tag tg-blue" style="font-size:10px">${s.abv_min}–${s.abv_max}%</span>
      <button class="btn btn-ghost btn-sm" onclick="editStyle(${s.id})" title="Edit">✏</button>
      <button class="btn btn-danger btn-sm" onclick="deleteStyle(${s.id})" title="Delete">🗑</button>
    </div>`).join('');
}

function addBeerStyle(){
  document.getElementById('stab-styles')?.scrollIntoView({behavior:'smooth'});
  document.getElementById('newStyleName')?.focus();
}

function saveNewStyle(){
  const name = document.getElementById('newStyleName')?.value.trim();
  const desc = document.getElementById('newStyleDesc')?.value.trim();
  const minA = parseFloat(document.getElementById('newStyleAbvMin')?.value||0);
  const maxA = parseFloat(document.getElementById('newStyleAbvMax')?.value||0);
  if(!name){ toast('Style name required','error'); return; }
  const newId = Math.max(...BEER_STYLES.map(s=>s.id)) + 1;
  BEER_STYLES.push({id:newId, name, desc:desc||'', abv_min:minA||0, abv_max:maxA||0});
  renderStylesList();
  populateStyleSelects();
  // clear form
  ['newStyleName','newStyleDesc','newStyleAbvMin','newStyleAbvMax'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  toast(name + ' style added','info');
}

function editStyle(id){
  const s = BEER_STYLES.find(x=>x.id===id);
  if(!s) return;
  const name = prompt('Style name:', s.name);
  if(name && name.trim()){ s.name = name.trim(); renderStylesList(); populateStyleSelects(); toast('Style updated','info'); }
}

function deleteStyle(id){
  const s = BEER_STYLES.find(x=>x.id===id);
  if(!s) return;
  // check if in use
  const inUse = BEER_LIBRARY.filter(b=>b.style===s.name);
  if(inUse.length>0){
    toast(`Cannot delete — ${inUse.length} beer(s) use this style`,'error');
    return;
  }
  BEER_STYLES = BEER_STYLES.filter(x=>x.id!==id);
  renderStylesList();
  populateStyleSelects();
  toast('Style deleted','info');
}

// ══════════════════════════════════════════
// SETTINGS TABS
// ══════════════════════════════════════════
function switchSettingsTab(tab, el){
  ['general','email','telegram','mqtt','thresholds','styles','roles','plans'].forEach(t=>{
    const panel = document.getElementById('stab-'+t);
    if(panel) panel.style.display = t===tab ? 'block' : 'none';
  });
  document.querySelectorAll('#settingsTabs .detail-tab').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  if(tab==='styles')  { renderStylesList(); populateStyleSelects(); }
  if(tab==='roles')   renderRolesList();
  if(tab==='plans')   renderPlansList();
  if(tab==='general') renderLocationsList();
}

function switchUserSettingsTab(tab, el){
  document.querySelectorAll('#userSettingsTabs .detail-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  ['account','alerts','hours'].forEach(id=>{
    const target = document.getElementById('ustab-'+id);
    if(target) target.style.display = (id===tab?'block':'none');
  });
  if(tab==='hours') buildSchedule();
}

// ══════════════════════════════════════════
// ROLES
// ══════════════════════════════════════════
const ROLES_DEFAULT = [
  {id:1, name:'Owner',   desc:'Full access to all restaurant settings and data'},
  {id:2, name:'Manager', desc:'Manage kegs, users, alerts and reports'},
  {id:3, name:'Staff',   desc:'View taps and log manual pours only'},
];
const ROLES = (()=>{ try{ const s=localStorage.getItem('bc_roles'); return s?JSON.parse(s):ROLES_DEFAULT; }catch(e){ return ROLES_DEFAULT; } })();
function saveRoles(){ try{ localStorage.setItem('bc_roles', JSON.stringify(ROLES)); }catch(e){} }

function getRoleOptions(){
  return ROLES.map(r=>`<option value="${r.name}">${r.name}</option>`).join('');
}

function renderRolesList(){
  const el  = document.getElementById('rolesList');
  const cnt = document.getElementById('rolesCount');
  if(!el) return;
  if(cnt) cnt.textContent = ROLES.length + ' roles';
  el.innerHTML = ROLES.map(r=>`
    <div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:var(--text1)">${r.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${r.desc||'—'}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="editRole(${r.id})">✏</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteRole(${r.id})">🗑</button>
    </div>`).join('');
}

function saveNewRole(){
  const name = document.getElementById('newRoleName')?.value.trim();
  const desc = document.getElementById('newRoleDesc')?.value.trim();
  if(!name){ toast('Role name is required','error'); return; }
  if(ROLES.find(r=>r.name.toLowerCase()===name.toLowerCase())){ toast('Role already exists','error'); return; }
  ROLES.push({id: Math.max(0,...ROLES.map(r=>r.id))+1, name, desc:desc||''});
  saveRoles();
  document.getElementById('newRoleName').value='';
  document.getElementById('newRoleDesc').value='';
  renderRolesList();
  toast(name + ' role added','info');
}

function editRole(id){
  const r = ROLES.find(x=>x.id===id);
  if(!r) return;
  const name = prompt('Role name:', r.name);
  if(!name || !name.trim()) return;
  const desc = prompt('Description:', r.desc);
  r.name = name.trim();
  r.desc = desc||'';
  saveRoles();
  renderRolesList();
  toast('Role updated','info');
}

function deleteRole(id){
  const r = ROLES.find(x=>x.id===id);
  if(!r) return;
  showConfirm({
    icon:'👤', title:'Delete Role',
    message:`Are you sure you want to delete the <strong>${r.name}</strong> role?`,
    confirmLabel:'Yes, Delete',
    onConfirm:()=>{ ROLES.splice(ROLES.indexOf(r),1); saveRoles(); renderRolesList(); toast(r.name+' deleted','info'); }
  });
}

// ══════════════════════════════════════════
// PLANS
// ══════════════════════════════════════════
const PLANS_DEFAULT = [
  {id:1, name:'Starter',    price:89,  maxTaps:4,  desc:'Up to 4 taps, email alerts'},
  {id:2, name:'Pro',        price:189, maxTaps:12, desc:'Up to 12 taps, all alerts, reports'},
  {id:3, name:'Enterprise', price:390, maxTaps:0,  desc:'Unlimited taps, priority support, SLA'},
];
const PLANS = (()=>{ try{ const s=localStorage.getItem('bc_plans'); return s?JSON.parse(s):PLANS_DEFAULT; }catch(e){ return PLANS_DEFAULT; } })();
function savePlans(){ try{ localStorage.setItem('bc_plans', JSON.stringify(PLANS)); }catch(e){} }

function renderPlansList(){
  const el  = document.getElementById('plansList');
  const cnt = document.getElementById('plansCount');
  if(!el) return;
  if(cnt) cnt.textContent = PLANS.length + ' plans';
  el.innerHTML = PLANS.map(p=>`
    <div style="display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500;color:var(--text1)">${p.name} <span style="color:var(--amber);font-family:var(--fm)">€${p.price}/mo</span></div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${p.maxTaps===0?'Unlimited taps':p.maxTaps+' taps max'} · ${p.desc||''}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="editPlan(${p.id})">✏</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deletePlan(${p.id})">🗑</button>
    </div>`).join('');
}

function populatePlanSelects(){
  document.querySelectorAll('#nr-plan, #ds-plan, .plan-select').forEach(sel=>{
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = PLANS.map(p=>`<option value="${p.name.toLowerCase()}">${p.name} — €${p.price}/mo${p.maxTaps?` (≤${p.maxTaps} taps)`:' (unlimited)'}</option>`).join('');
    if(cur) sel.value = cur;
  });
}

function saveNewPlan(){
  const name  = document.getElementById('newPlanName')?.value.trim();
  const price = parseInt(document.getElementById('newPlanPrice')?.value||0);
  const taps  = parseInt(document.getElementById('newPlanTaps')?.value||0);
  const desc  = document.getElementById('newPlanDesc')?.value.trim();
  if(!name){ toast('Plan name is required','error'); return; }
  PLANS.push({id: Math.max(0,...PLANS.map(p=>p.id))+1, name, price, maxTaps:taps, desc:desc||''});
  savePlans();
  ['newPlanName','newPlanPrice','newPlanTaps','newPlanDesc'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  renderPlansList();
  populatePlanSelects();
  toast(name + ' plan added','info');
}

function editPlan(id){
  const p = PLANS.find(x=>x.id===id);
  if(!p) return;
  const name  = prompt('Plan name:', p.name);     if(!name||!name.trim()) return;
  const price = prompt('Price (€/mo):', p.price); if(price===null) return;
  const taps  = prompt('Max taps (0 = unlimited):', p.maxTaps); if(taps===null) return;
  const desc  = prompt('Description:', p.desc);
  p.name=name.trim(); p.price=parseInt(price)||0; p.maxTaps=parseInt(taps)||0; p.desc=desc||'';
  savePlans(); renderPlansList(); populatePlanSelects();
  toast('Plan updated','info');
}

function deletePlan(id){
  const p = PLANS.find(x=>x.id===id);
  if(!p) return;
  showConfirm({
    icon:'💳', title:'Delete Plan',
    message:`Are you sure you want to delete the <strong>${p.name}</strong> plan? Restaurants currently on this plan will not be affected.`,
    confirmLabel:'Yes, Delete',
    onConfirm:()=>{ PLANS.splice(PLANS.indexOf(p),1); savePlans(); renderPlansList(); populatePlanSelects(); toast(p.name+' deleted','info'); }
  });
}

// ══════════════════════════════════════════
// UPDATED BEER LIBRARY — use styles from BEER_STYLES
// ══════════════════════════════════════════
function renderBeerLibraryGrid(){
  const el = document.getElementById('beerLibraryGrid');
  if(!el) return;

  // ensure style select is populated
  populateStyleSelects();

  const q     = (document.getElementById('beerSearch')?.value||'').toLowerCase();
  const style = document.getElementById('beerStyleFilter')?.value||'';
  let filtered = BEER_LIBRARY.filter(b=>{
    if(q && !b.name.toLowerCase().includes(q)) return false;
    if(style && b.style !== style) return false;
    return true;
  });

  const cnt = document.getElementById('beerCount');
  if(cnt) cnt.textContent = filtered.length + ' beers';

  el.innerHTML = filtered.map(b => `
    <div class="beer-lib-card" onclick="openEditBeer(${b.id})">
      ${b.assignedTo.length>0 ? `<div class="beer-assigned-count">${b.assignedTo.length} venue${b.assignedTo.length!==1?'s':''}</div>` : ''}
      <div class="fxc g12" style="margin-bottom:12px">
        <div class="beer-lib-logo">${b.logo ? `<img src="${b.logo}" style="width:42px;height:42px;object-fit:contain;" onerror="this.parentElement.textContent='${b.emoji}'">` : b.emoji}</div>
        <div style="flex:1">
          <div class="beer-lib-name">${b.name}</div>
          <div class="beer-lib-meta">${b.style} · ${b.abv}% ABV</div>
          ${b.brand ? `<div class="beer-lib-meta">${b.brand}${b.origin ? ' · ' + b.origin : ''}</div>` : ''}
        </div>
      </div>
      <div class="flex g6" style="flex-wrap:wrap;margin-bottom:10px">
        <span class="tag tg-blue">${b.style}</span>
        <span class="tag tg-gray">${b.abv}% ABV</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        ${b.assignedTo.length>0
          ? `<div style="font-size:11px;color:var(--text3);font-family:var(--fm)">Used by: ${b.assignedTo.join(', ')}</div>`
          : `<div></div>`}
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openEditBeer(${b.id})" style="font-size:11px;padding:4px 10px">✏ Edit</button>
      </div>
    </div>`).join('') + `
  <div class="beer-lib-card" style="border-style:dashed;opacity:.5;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;gap:8px;color:var(--text3)" onclick="openM('mAddBeer')" onmouseenter="this.style.opacity='1';this.style.borderColor='var(--amber)'" onmouseleave="this.style.opacity='.5';this.style.borderColor=''">
    <div style="font-size:32px">+</div>
    <div style="font-size:13px">Add new beer</div>
  </div>`;
}

function openEditBeer(id){
  const b = BEER_LIBRARY.find(x=>x.id===id);
  if(!b) return;
  document.getElementById('eb-id').value    = b.id;
  document.getElementById('eb-name').value  = b.name;
  document.getElementById('eb-abv').value   = b.abv;
  document.getElementById('eb-brand').value = b.brand||'';
  document.getElementById('eb-origin').value= b.origin||'';
  document.getElementById('eb-logo-data').value = '';
  // populate style select then set value
  populateStyleSelects();
  setTimeout(()=>{ const s=document.getElementById('eb-style'); if(s) s.value=b.style; },60);
  // show logo preview
  const prev = document.getElementById('eb-logo-preview');
  if(b.logo){
    prev.innerHTML = `<img src="${b.logo}" style="width:64px;height:64px;object-fit:contain;">`;
  } else {
    prev.textContent = b.emoji||'🍺';
  }
  openM('mEditBeer');
}

function saveEditBeer(){
  const id    = parseInt(document.getElementById('eb-id').value);
  const name  = document.getElementById('eb-name').value.trim();
  const style = document.getElementById('eb-style').value;
  const abv   = parseFloat(document.getElementById('eb-abv').value||0);
  const brand = document.getElementById('eb-brand').value.trim();
  const origin= document.getElementById('eb-origin').value.trim();
  const logoData = document.getElementById('eb-logo-data').value;
  if(!name)  { toast('Beer name is required','error'); return; }
  if(!style) { toast('Please select a style','error'); return; }
  const b = BEER_LIBRARY.find(x=>x.id===id);
  if(!b) return;
  b.name   = name;
  b.style  = style;
  b.abv    = abv;
  b.brand  = brand;
  b.origin = origin;
  if(logoData) b.logo = logoData;
  saveBeerLibrary();
  closeM('mEditBeer');
  renderBeerLibraryGrid();
  toast(name + ' updated ✓', 'info');
}

function deleteBeerFromLibrary(){
  const id = parseInt(document.getElementById('eb-id').value);
  const b  = BEER_LIBRARY.find(x=>x.id===id);
  if(!b) return;
  showConfirm({
    icon: '🗑️',
    title: 'Delete Beer',
    message: `Are you sure you want to delete <strong>${b.name}</strong> from the library? This action cannot be undone.`,
    confirmLabel: 'Yes, Delete',
    onConfirm: () => {
      const idx = BEER_LIBRARY.indexOf(b);
      BEER_LIBRARY.splice(idx, 1);
      saveBeerLibrary();
      closeM('mEditBeer');
      renderBeerLibraryGrid();
      toast(b.name + ' deleted', 'info');
    }
  });
}

function showConfirm({ icon='⚠️', title='Are you sure?', message='', confirmLabel='Confirm', danger=true, onConfirm }){
  document.getElementById('mConfirm-icon').textContent  = icon;
  document.getElementById('mConfirm-title').textContent = title;
  document.getElementById('mConfirm-msg').innerHTML     = message;
  const okBtn = document.getElementById('mConfirm-ok');
  okBtn.textContent = confirmLabel;
  okBtn.style.background = danger ? 'var(--red)' : 'var(--amber)';
  okBtn.onclick = () => { closeM('mConfirm'); onConfirm(); };
  openM('mConfirm');
}

function clearBeerLogo(){
  const id = parseInt(document.getElementById('eb-id').value);
  const b  = BEER_LIBRARY.find(x=>x.id===id);
  document.getElementById('eb-logo-data').value = '';
  const prev = document.getElementById('eb-logo-preview');
  prev.textContent = b?.emoji||'🍺';
  if(b) delete b.logo;
  saveBeerLibrary();
  toast('Logo removed','info');
}

function previewLogo(input, previewId, dataId){
  const file = input.files[0];
  if(!file) return;
  if(file.size > 512*1024){ toast('File too large — max 512 KB','error'); return; }
  const reader = new FileReader();
  reader.onload = function(e){
    const dataUrl = e.target.result;
    document.getElementById(dataId).value = dataUrl;
    const prev = document.getElementById(previewId);
    prev.innerHTML = `<img src="${dataUrl}" style="width:64px;height:64px;object-fit:contain;">`;
  };
  reader.readAsDataURL(file);
}

// Override addBeerToLibrary to use new simplified form
function addBeerToLibrary(){
  const name  = document.getElementById('nb-name')?.value.trim();
  const style = document.getElementById('nb-style')?.value;
  const abv   = parseFloat(document.getElementById('nb-abv')?.value||0);
  const logoData = document.getElementById('nb-logo-data')?.value;
  if(!name)  { toast('Beer name is required','error'); return; }
  if(!style) { toast('Please select a style','error'); return; }
  const newId = Math.max(...BEER_LIBRARY.map(b=>b.id)) + 1;
  const newBeer = {id:newId, name, style, abv, emoji:'🍺', assignedTo:[]};
  if(logoData) newBeer.logo = logoData;
  BEER_LIBRARY.push(newBeer);
  saveBeerLibrary();
  closeM('mAddBeer');
  ['nb-name','nb-abv'].forEach(id=>{ const el=document.getElementById(id); if(el){ el.value = id==='nb-abv'?'5.0':''; } });
  const styleEl = document.getElementById('nb-style'); if(styleEl) styleEl.value='';
  document.getElementById('nb-logo-data').value='';
  document.getElementById('nb-logo-preview').textContent='🍺';
  renderBeerLibraryGrid();
  toast(name + ' added to library ✓','info');
}

// ══════════════════════════════════════════
// HOOK: populate styles when Beer modal opens
// ══════════════════════════════════════════
const _origOpenM = openM;
openM = function(id){
  _origOpenM(id);
  if(id==='mAddBeer'||id==='mEditBeer') setTimeout(populateStyleSelects, 50);
  if(id==='mAddRest') setTimeout(populatePlanSelects, 50);
  if(id==='mAddUser')    setTimeout(()=>{ const s=document.getElementById('addUserRole'); if(s) s.innerHTML=getRoleOptions(); }, 50);
  if(id==='mEditUser')   setTimeout(()=>{ const s=document.getElementById('eu-role'); if(s&&!s.options.length) s.innerHTML=getRoleOptions(); }, 50);
  if(id==='mEditDevice') setTimeout(()=>{ populateLocationDropdown('ed-loc'); }, 50);
};

// ══════════════════════════════════════════
// HOOK nav for settings
// ══════════════════════════════════════════
const _prevNav5 = nav;
nav = function(pageId, el){
  _prevNav5(pageId, el);
  if(pageId==='adminSettings'){
    // activate first tab
    setTimeout(()=>{
      switchSettingsTab('general', document.querySelector('#settingsTabs .detail-tab'));
      loadAdminSettings();
    }, 50);
  }
  if(pageId==='adminDash') {
    updateSystemStats();
  }
};

async function loadAdminSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const settings = await res.json();
    if (settings.mqtt_host) document.getElementById('ms-host').value = settings.mqtt_host;
    if (settings.mqtt_port) document.getElementById('ms-port').value = settings.mqtt_port;
    if (settings.mqtt_user) document.getElementById('ms-user').value = settings.mqtt_user;
    if (settings.mqtt_pass) document.getElementById('ms-pass').value = settings.mqtt_pass;
  } catch (e) { console.error('Load settings failed', e); }
}

async function updateSystemStats() {
  try {
    const res = await fetch('/api/admin/system');
    const data = await res.json();
    const upEl = document.getElementById('sys-uptime');
    if (upEl) {
      const h = Math.floor(data.uptime / 3600);
      const m = Math.floor((data.uptime % 3600) / 60);
      upEl.textContent = `${h}h ${m}m`;
    }
    const memEl = document.getElementById('sys-mem');
    if (memEl) memEl.textContent = data.mem_mb + ' MB';
    const litEl = document.getElementById('sys-liters');
    if (litEl) litEl.textContent = data.total_liters + ' L';
    
    // MQTT status is already handled by SSE status event, but we can double check here
    fetch('/api/mqtt/stream').then(r => r.json()).then(d => {
       if (d.type === 'status') {
         const mqEl = document.getElementById('sys-mqtt');
         if (mqEl) mqEl.textContent = d.data.connected ? 'Online' : 'Offline';
       }
    }).catch(()=>{});
  } catch (e) { console.error('Update stats failed', e); }
}

async function testMqttSettings() {
  const host = document.getElementById('ms-host').value;
  const port = document.getElementById('ms-port').value;
  const user = document.getElementById('ms-user').value;
  const pass = document.getElementById('ms-pass').value;

  const btn = document.getElementById('btn-mqtt-test');
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = 'Testing...';

  try {
    const res = await fetch('/api/admin/mqtt/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, pass })
    });
    const d = await res.json();
    if (d.success) toast(d.message, 'success');
    else toast(d.message, 'error');
  } catch (e) {
    toast('Connection failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function saveMqttSettings() {
  const settings = {
    mqtt_host: document.getElementById('ms-host').value,
    mqtt_port: document.getElementById('ms-port').value,
    mqtt_user: document.getElementById('ms-user').value,
    mqtt_pass: document.getElementById('ms-pass').value
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const d = await res.json();
    if (d.success) toast('MQTT Settings saved', 'success');
    else toast('Failed to save', 'error');
  } catch (e) {
    toast('Error saving settings', 'error');
  }
}

