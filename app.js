/* Крестики — офлайн учёт (2025–2026)
   Данные: localStorage, отсутствующие дни считаются как 0 при расчётах.

   Режимы:
   - Календарь
   - График
   - Split-view (iPad landscape, по желанию)

   Список месяцев — выдвижной (bottom sheet).
*/
(() => {
  "use strict";

  const YEARS = [2025, 2026];
  const MONTHS_RU = [
    "Январь","Февраль","Март","Апрель","Май","Июнь",
    "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"
  ];

  const STORAGE_KEY = "stitch_pwa_v1";
  const PREF_KEY = "stitch_pwa_prefs_v1";
  const nf = new Intl.NumberFormat("ru-RU");

  /** @type {{version:number, days: Record<string, number>}} */
  let store = { version: 1, days: {} };

  /** @type {{year:number, month:number, mode:"calendar"|"chart"}} */
  let view = { year: 2025, month: 0, mode: "calendar" };

  /** @type {{dateKey:string|null}} */
  let editor = { dateKey: null };

  /** @type {{splitPreferred:boolean}} */
  let prefs = { splitPreferred: false };

  // Elements
  const appRoot = document.querySelector(".app");
  const monthTitle = document.getElementById("monthTitle");
  const calGrid = document.getElementById("calendarGrid");
  const monthTotalEl = document.getElementById("monthTotal");
  const yearTotalEl = document.getElementById("yearTotal");
  const yearAvgEl = document.getElementById("yearAvg");
  const stat1Label = document.getElementById("stat1Label");

  const prevMonthBtn = document.getElementById("prevMonth");
  const nextMonthBtn = document.getElementById("nextMonth");
  const clearYearBtn = document.getElementById("clearYearBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importFile = document.getElementById("importFile");

  const monthRow = document.getElementById("monthRow");
  const yearRow = document.getElementById("yearRow");
  const yearTitle = document.getElementById("yearTitle");

  const calendarCard = document.getElementById("calendarCard");
  const chartCard = document.getElementById("chartCard");
  const monthChart = document.getElementById("monthChart");
  const chartYearLabel = document.getElementById("chartYearLabel");

  // Chart controls
  const openMonthsBtn = document.getElementById("openMonths");

  // Months sheet
  const monthsSheet = document.getElementById("monthsSheet");
  const monthsBackdrop = document.getElementById("monthsBackdrop");
  const closeMonthsBtn = document.getElementById("closeMonths");
  const monthsTitle = document.getElementById("monthsTitle");
  const monthList = document.getElementById("monthList");

  // Split toggle
  const splitToggleRow = document.getElementById("splitToggleRow");
  const splitToggle = document.getElementById("splitToggle");

  // Sheet (day editor)
  const sheet = document.getElementById("editSheet");
  const sheetBackdrop = document.getElementById("sheetBackdrop");
  const sheetDateTitle = document.getElementById("sheetDateTitle");
  const closeSheetBtn = document.getElementById("closeSheet");
  const dayInput = document.getElementById("dayInput");
  const saveDayBtn = document.getElementById("saveDay");
  const clearDayBtn = document.getElementById("clearDay");

  // PWA install prompt (mostly Android/Chromium)
  const installBtn = document.getElementById("installBtn");
  let deferredPrompt = null;

  // Media queries for split availability: iPad landscape / wide screens only
  const mqSplit = window.matchMedia("(min-width: 1024px) and (orientation: landscape)");
  const mqWide = window.matchMedia("(min-width: 820px)");

  // ---------- Helpers ----------
  function pad2(n){ return String(n).padStart(2, "0"); }
  function dateKey(year, month, day){ return `${year}-${pad2(month+1)}-${pad2(day)}`; }

  function isLeapYear(y){
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }
  function daysInYear(y){ return isLeapYear(y) ? 366 : 365; }
  function daysInMonth(y, m){ return new Date(y, m + 1, 0).getDate(); }
  // Monday-first index: Mon=0..Sun=6
  function weekdayMonIndex(d){
    const js = d.getDay(); // Sun=0..Sat=6
    return (js + 6) % 7;
  }

  function formatInt(x){
    if (!Number.isFinite(x)) return "0";
    return nf.format(Math.round(x));
  }
  function formatAvg(x){
    if (!Number.isFinite(x)) return "0";
    const rounded = Math.round(x * 10) / 10;
    return (Math.abs(rounded - Math.round(rounded)) < 1e-9) ? nf.format(Math.round(rounded)) : nf.format(rounded);
  }

  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#0a84ff";
  }

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(parsed && typeof parsed === "object" && parsed.days && typeof parsed.days === "object"){
          store = { version: 1, days: parsed.days };
        }
      }
    }catch(_e){
      store = { version: 1, days: {} };
    }
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function loadPrefs(){
    try{
      const raw = localStorage.getItem(PREF_KEY);
      if(raw){
        const p = JSON.parse(raw);
        if(p && typeof p === "object"){
          prefs.splitPreferred = !!p.splitPreferred;
        }
      }
    }catch(_e){}
  }

  function savePrefs(){
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  }

  function getValue(key){
    const v = store.days[key];
    return Number.isFinite(v) ? v : 0;
  }

  function setValue(key, val){
    const n = Math.max(0, Math.floor(Number(val || 0)));
    if(n === 0){
      delete store.days[key]; // missing = 0
    }else{
      store.days[key] = n;
    }
    save();
  }

  function sumMonth(year, month){
    const dim = daysInMonth(year, month);
    let s = 0;
    for(let d=1; d<=dim; d++){
      s += getValue(dateKey(year, month, d));
    }
    return s;
  }

  function monthTotals(year){
    const arr = [];
    for(let m=0; m<12; m++) arr.push(sumMonth(year, m));
    return arr;
  }

  function sumYear(year){
    return monthTotals(year).reduce((a,b)=>a+b, 0);
  }

  function todayKeyIfVisible(year, month){
    const now = new Date();
    if(now.getFullYear() !== year) return null;
    if(now.getMonth() !== month) return null;
    return dateKey(year, month, now.getDate());
  }

  function splitAvailable(){
    return mqSplit.matches;
  }

  function splitEnabled(){
    return splitAvailable() && prefs.splitPreferred;
  }

  // ---------- Months sheet ----------
  function openMonths(){
    if(!monthsSheet) return;
    if(monthsTitle) monthsTitle.textContent = `Месяцы • ${view.year}`;
    renderMonthList();
    monthsSheet.hidden = false;
  }
  function closeMonths(){
    if(!monthsSheet) return;
    monthsSheet.hidden = true;
  }

  // ---------- Rendering ----------
  function updateYearButtons(){
    document.querySelectorAll(".seg-btn").forEach(btn => {
      const y = Number(btn.getAttribute("data-year"));
      btn.setAttribute("aria-selected", String(y === view.year));
    });
  }

  function updateModeButtons(){
    document.querySelectorAll(".tab-btn").forEach(btn => {
      const m = btn.getAttribute("data-mode");
      btn.setAttribute("aria-selected", String(m === view.mode));
    });
  }

  function updateSplitUI(){
    // show toggle only on wide/tablet screens (won't appear on iPhone)
    const showRow = mqWide.matches;
    if(splitToggleRow) splitToggleRow.hidden = !showRow;

    if(splitToggle) splitToggle.checked = !!prefs.splitPreferred;

    if(appRoot){
      appRoot.classList.toggle("split-mode", splitEnabled());
    }
  }

  function render(){
    updateSplitUI();
    updateYearButtons();
    updateModeButtons();

    const yt = sumYear(view.year);
    const avg = yt / daysInYear(view.year);

    yearTotalEl.textContent = formatInt(yt);
    yearAvgEl.textContent = formatAvg(avg);
    if(chartYearLabel) chartYearLabel.textContent = String(view.year);

    // Split: calendar + chart side-by-side (iPad landscape only)
    if(splitEnabled()){
      monthTitle.textContent = `${MONTHS_RU[view.month]} ${view.year}`;
      monthRow.hidden = false;
      yearRow.hidden = true;

      stat1Label.textContent = "За месяц";
      monthTotalEl.textContent = formatInt(sumMonth(view.year, view.month));

      calendarCard.hidden = false;
      chartCard.hidden = false;

      renderCalendar();
      renderChart();
      return;
    }

    // Normal modes
    if(view.mode === "calendar"){
      monthTitle.textContent = `${MONTHS_RU[view.month]} ${view.year}`;
      monthRow.hidden = false;
      yearRow.hidden = true;

      stat1Label.textContent = "За месяц";
      monthTotalEl.textContent = formatInt(sumMonth(view.year, view.month));

      calendarCard.hidden = false;
      chartCard.hidden = true;

      renderCalendar();
    }else{
      monthRow.hidden = true;
      yearRow.hidden = false;
      yearTitle.textContent = `График: ${view.year}`;

      stat1Label.textContent = "Среднее/месяц";
      monthTotalEl.textContent = formatAvg(yt / 12);

      calendarCard.hidden = true;
      chartCard.hidden = false;

      renderChart();
    }
  }

  function renderCalendar(){
    calGrid.innerHTML = "";

    const first = new Date(view.year, view.month, 1);
    const lead = weekdayMonIndex(first);
    const dim = daysInMonth(view.year, view.month);

    const todayKey = todayKeyIfVisible(view.year, view.month);

    for(let i=0; i<lead; i++){
      const div = document.createElement("div");
      div.className = "day empty";
      calGrid.appendChild(div);
    }

    for(let day=1; day<=dim; day++){
      const key = dateKey(view.year, view.month, day);
      const val = getValue(key);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day" + (val > 0 ? " has-entry" : "") + (todayKey === key ? " today" : "");
      btn.setAttribute("data-date", key);

      const dnum = document.createElement("div");
      dnum.className = "dnum";
      dnum.textContent = String(day);

      const dval = document.createElement("div");
      dval.className = "dval";
      if(val > 0){
        dval.textContent = formatInt(val);
      }else{
        dval.innerHTML = `<span class="zero">0</span>`;
      }

      btn.appendChild(dnum);
      btn.appendChild(dval);
      btn.addEventListener("click", () => openEditor(key));

      calGrid.appendChild(btn);
    }
  }

  // ---------- Chart ----------
  function renderChart(){
    const ctx = monthChart.getContext("2d");
    if(!ctx) return;

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const cssW = monthChart.clientWidth || 720;
    const cssH = monthChart.clientHeight || 260;
    monthChart.width = Math.floor(cssW * dpr);
    monthChart.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW, h = cssH;
    ctx.clearRect(0, 0, w, h);

    const totals = monthTotals(view.year);
    const maxV = Math.max(1, ...totals);

    const pad = 16;
    const topPad = 18;
    const bottomPad = 32;
    const chartW = w - pad*2;
    const chartH = h - topPad - bottomPad;

    const gap = 10;
    const barW = Math.max(10, Math.floor((chartW - gap*11) / 12));

    const blue = cssVar("--blue");
    const hairline = cssVar("--hairline");
    const muted = cssVar("--muted");
    const text = cssVar("--text");

    ctx.strokeStyle = hairline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, topPad + chartH + 0.5);
    ctx.lineTo(pad + chartW, topPad + chartH + 0.5);
    ctx.stroke();

    ctx.fillStyle = muted;
    ctx.font = "12px -apple-system, BlinkMacSystemFont, DejaVuWeb, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText("Итого по месяцам", pad, 14);

    view._chartBars = [];
    for(let i=0; i<12; i++){
      const v = totals[i];
      const bh = Math.round((v / maxV) * (chartH - 8));
      const x = pad + i * (barW + gap);
      const y = topPad + chartH - bh;

      const r = 8;
      ctx.fillStyle = blue;
      ctx.globalAlpha = 0.20;
      roundRect(ctx, x, y, barW, bh, r);
      ctx.fill();

      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = blue;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, barW, bh, r);
      ctx.stroke();

      ctx.globalAlpha = 1;

      ctx.fillStyle = muted;
      ctx.font = "11px -apple-system, BlinkMacSystemFont, DejaVuWeb, Segoe UI, Roboto, Arial, sans-serif";
      const label = String(i+1);
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, x + (barW - tw)/2, topPad + chartH + 20);

      if(bh >= 26){
        ctx.fillStyle = text;
        ctx.font = "12px -apple-system, BlinkMacSystemFont, DejaVuWeb, Segoe UI, Roboto, Arial, sans-serif";
        const vtxt = formatInt(v);
        const tww = ctx.measureText(vtxt).width;
        ctx.fillText(vtxt, x + (barW - tww)/2, y + 16);
      }

      view._chartBars.push({i, x, y, w: barW, h: bh});
    }
  }

  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function renderMonthList(){
    if(!monthList) return;
    monthList.innerHTML = "";
    const totals = monthTotals(view.year);

    for(let i=0; i<12; i++){
      const item = document.createElement("div");
      item.className = "month-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const left = document.createElement("div");
      left.className = "mname";
      left.textContent = MONTHS_RU[i];

      const right = document.createElement("div");
      right.className = "mval";
      const v = totals[i];
      if(v > 0){
        right.textContent = formatInt(v);
      }else{
        right.innerHTML = `<span class="zero">0</span>`;
      }

      item.appendChild(left);
      item.appendChild(right);

      const go = () => {
        view.month = i;
        closeMonths();

        // If split is not enabled, switch to calendar for immediate editing
        if(!splitEnabled()){
          view.mode = "calendar";
        }
        render();
      };

      item.addEventListener("click", go);
      item.addEventListener("keydown", (e) => {
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          go();
        }
      });

      monthList.appendChild(item);
    }
  }

  function chartHitTest(evt){
    if(!view._chartBars || !Array.isArray(view._chartBars)) return null;
    const rect = monthChart.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    for(const b of view._chartBars){
      if(x >= b.x && x <= b.x + b.w && y >= (b.y - 6) && y <= (b.y + b.h + 18)){
        return b.i;
      }
    }
    return null;
  }

  monthChart.addEventListener("click", (evt) => {
    const idx = chartHitTest(evt);
    if(idx === null) return;
    view.month = idx;
    if(!splitEnabled()){
      view.mode = "calendar";
    }
    render();
  });

  window.addEventListener("resize", () => {
    if(splitEnabled() || view.mode === "chart"){
      renderChart();
    }
    updateSplitUI();
    render();
  });

  mqSplit.addEventListener?.("change", () => {
    updateSplitUI();
    render();
  });

  mqWide.addEventListener?.("change", () => {
    updateSplitUI();
  });

  // ---------- Editor (sheet) ----------
  function openEditor(key){
    editor.dateKey = key;

    const [y, m, d] = key.split("-").map(Number);
    const title = `${d} ${MONTHS_RU[m-1]} ${y}`;
    sheetDateTitle.textContent = title;

    const current = getValue(key);
    dayInput.value = current > 0 ? String(current) : "";
    dayInput.placeholder = "0";

    sheet.hidden = false;
    setTimeout(() => dayInput.focus(), 20);
  }

  function closeEditor(){
    editor.dateKey = null;
    sheet.hidden = true;
  }

  function commitEditor(){
    if(!editor.dateKey) return;
    const raw = dayInput.value.trim();
    const n = raw === "" ? 0 : Number(raw);
    setValue(editor.dateKey, n);
    render();
    closeEditor();
  }

  function clearEditor(){
    if(!editor.dateKey) return;
    setValue(editor.dateKey, 0);
    render();
    closeEditor();
  }

  // ---------- Events ----------
  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const y = Number(btn.getAttribute("data-year"));
      if(!YEARS.includes(y)) return;
      view.year = y;
      render();
    });
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const m = btn.getAttribute("data-mode");
      if(m !== "calendar" && m !== "chart") return;
      view.mode = m;
      render();
    });
  });

  if(splitToggle){
    splitToggle.addEventListener("change", () => {
      prefs.splitPreferred = !!splitToggle.checked;
      savePrefs();
      render();
    });
  }

  if(openMonthsBtn){
    openMonthsBtn.addEventListener("click", () => openMonths());
  }
  if(monthsBackdrop){
    monthsBackdrop.addEventListener("click", () => closeMonths());
  }
  if(closeMonthsBtn){
    closeMonthsBtn.addEventListener("click", () => closeMonths());
  }
  window.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && monthsSheet && !monthsSheet.hidden){
      closeMonths();
    }
  });

  prevMonthBtn.addEventListener("click", () => {
    if(view.month === 0){
      view.month = 11;
      view.year = Math.max(YEARS[0], view.year - 1);
      if(!YEARS.includes(view.year)) view.year = YEARS[0];
    }else{
      view.month -= 1;
    }
    render();
  });

  nextMonthBtn.addEventListener("click", () => {
    if(view.month === 11){
      view.month = 0;
      view.year = Math.min(YEARS[YEARS.length-1], view.year + 1);
      if(!YEARS.includes(view.year)) view.year = YEARS[YEARS.length-1];
    }else{
      view.month += 1;
    }
    render();
  });

  sheetBackdrop.addEventListener("click", closeEditor);
  closeSheetBtn.addEventListener("click", closeEditor);
  saveDayBtn.addEventListener("click", commitEditor);
  clearDayBtn.addEventListener("click", clearEditor);

  dayInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      e.preventDefault();
      commitEditor();
    }else if(e.key === "Escape"){
      e.preventDefault();
      closeEditor();
    }
  });

  clearYearBtn.addEventListener("click", () => {
    const y = view.year;
    const ok = confirm(`Очистить все значения за ${y} год? Это удалит только данные за этот год.`);
    if(!ok) return;

    const prefix = `${y}-`;
    for(const k of Object.keys(store.days)){
      if(k.startsWith(prefix)) delete store.days[k];
    }
    save();
    render();
  });

  exportBtn.addEventListener("click", () => {
    const payload = {
      exported_at: new Date().toISOString(),
      app: "stitch-pwa",
      version: store.version,
      days: store.days,
      prefs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `krestiki_export_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importFile.addEventListener("change", async () => {
    const file = importFile.files && importFile.files[0];
    if(!file) return;

    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      if(!obj || typeof obj !== "object" || !obj.days || typeof obj.days !== "object"){
        alert("Файл импорта не похож на экспорт этого приложения.");
        importFile.value = "";
        return;
      }

      const merged = { ...store.days };
      for(const [k,v] of Object.entries(obj.days)){
        const n = Number(v);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        const y = Number(k.slice(0,4));
        if(!YEARS.includes(y)) continue;
        if(Number.isFinite(n) && n > 0) merged[k] = Math.floor(n);
        if(!Number.isFinite(n) || n <= 0) delete merged[k];
      }

      store.days = merged;

      if(obj.prefs && typeof obj.prefs === "object"){
        prefs.splitPreferred = !!obj.prefs.splitPreferred;
        savePrefs();
        if(splitToggle) splitToggle.checked = prefs.splitPreferred;
      }

      save();
      render();
      alert("Импорт выполнен.");
    }catch(_e){
      alert("Не удалось импортировать файл (ошибка формата).");
    }finally{
      importFile.value = "";
    }
  });

  // ---------- PWA install ----------
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    try{ await deferredPrompt.userChoice; }catch(_e){}
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  // ---------- SW ----------
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
    });
  }

  // ---------- Init ----------
  load();
  loadPrefs();

  const now = new Date();
  if(YEARS.includes(now.getFullYear())){
    view.year = now.getFullYear();
    view.month = now.getMonth();
  }else{
    view.year = YEARS[0];
    view.month = 0;
  }
  view.mode = "calendar";

  if(splitToggle) splitToggle.checked = prefs.splitPreferred;

  render();
})();
