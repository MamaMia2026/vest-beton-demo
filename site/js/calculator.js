const WHATSAPP_NUMBER = "40700000000"; // număr WhatsApp (format internațional, fără + sau spații)

/* ---------- Constante comerciale (date de exemplu) ---------- */
const TRUCK_M3 = 8;              // capacitate autobetonieră (m³)
const FREE_KM = 10;              // transport gratuit până la (km)
const KM_PRICE = 6;              // lei / km / cursă, peste FREE_KM
const PUMP_FIXED = 650;          // pompă: taxă fixă (lei)
const PUMP_PER_M3 = 12;          // pompă: lei / m³
const LOSS_FACTOR = 1.05;        // +5% pierderi
const PARTIAL_TRIP_MIN_M3 = 3;   // prag cursă incompletă (m³)
const PARTIAL_TRIP_FEE = 250;    // taxă cursă incompletă (lei)

(function () {
  "use strict";

  const CLASSES = [
    ["C8/10", 310, "Egalizări, umpluturi, beton de curățenie"],
    ["C12/15", 335, "Fundații pentru garduri, alei"],
    ["C16/20", 360, "Fundații de case, plăci pe sol"],
    ["C20/25", 385, "Fundații, plăci, stâlpi – cel mai cerut"],
    ["C25/30", 410, "Planșee, grinzi, stâlpi, structuri"],
    ["C30/37", 445, "Structuri solicitate, platforme industriale"],
    ["Șapă M10", 290, "Șape, pardoseli interioare"]
  ];
  const DEFAULT_CLASS = 3;

  const PLACES = [
    ["Timișoara", 8], ["Dumbrăvița", 9], ["Ghiroda", 8], ["Giroc", 10], ["Moșnița Nouă", 12],
    ["Sânandrei", 14], ["Săcălaz", 15], ["Remetea Mare", 16], ["Recaș", 26], ["Buziaș", 36],
    ["Jimbolia", 42], ["Deta", 47], ["Arad", 56], ["Lugoj", 64], ["Sânnicolau Mare", 68]
  ];

  // [cheie, etichetă, unitate, valoare implicită]
  const FIELDS = {
    placa:  [["L", "Lungime", "m", 10], ["W", "Lățime", "m", 8], ["H", "Grosime", "cm", 15]],
    fund:   [["P", "Lungime totală (perimetru)", "m", 40], ["W", "Lățime", "cm", 40], ["H", "Adâncime", "cm", 80]],
    stalp:  [["D", "Diametru", "cm", 30], ["H", "Înălțime", "m", 3], ["N", "Bucăți", "buc", 6]],
    grinda: [["A", "Latura A", "cm", 25], ["B", "Latura B", "cm", 30], ["H", "Lungime / înălțime", "m", 3], ["N", "Bucăți", "buc", 8]],
    sapa:   [["S", "Suprafață", "m²", 80], ["H", "Grosime", "cm", 5]],
    m3:     [["V", "Cantitate", "m³", 6]]
  };
  const SHAPE_NAMES = {
    placa: "Placă / radier", fund: "Fundație continuă", stalp: "Stâlpi rotunzi",
    grinda: "Grinzi / stâlpi pătrați", sapa: "Șapă", m3: "Cantitate cunoscută"
  };

  const $ = (id) => document.getElementById(id);

  /* Formatare ro-RO independentă de browser: 6.178 / 12,60 */
  function fmt(n, d = 0) {
    const neg = n < 0;
    const [int, dec] = Math.abs(n).toFixed(d).split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "−" : "") + grouped + (dec ? "," + dec : "");
  }

  /* Valorile sunt păstrate pe formă, ca să nu se piardă la comutare */
  const values = {};
  Object.keys(FIELDS).forEach((s) => {
    values[s] = {};
    FIELDS[s].forEach((f) => { values[s][f[0]] = f[3]; });
  });

  let shape = "placa";
  let last = null; // ultimul rezultat calculat

  function num(x) {
    const n = parseFloat(String(x).replace(",", "."));
    return isFinite(n) && n > 0 ? n : 0;
  }
  const v = (k, s = shape) => num(values[s][k]);

  /* ---------- Volum ---------- */
  function rawVolume(s) {
    const g = (k) => v(k, s);
    switch (s) {
      case "placa":  return g("L") * g("W") * g("H") / 100;
      case "fund":   return g("P") * (g("W") / 100) * (g("H") / 100);
      case "stalp":  return Math.PI * Math.pow(g("D") / 200, 2) * g("H") * g("N");
      case "grinda": return (g("A") / 100) * (g("B") / 100) * g("H") * g("N");
      case "sapa":   return g("S") * g("H") / 100;
      case "m3":     return g("V");
    }
    return 0;
  }
  function volume(s) {
    let m = rawVolume(s);
    if ($("pierderi").checked && s !== "m3") m *= LOSS_FACTOR;
    return Math.round(m * 100) / 100;
  }

  /* ---------- Calcul complet (pur, fără DOM) ---------- */
  function quote(m, cls, km, pump) {
    const trips = m > 0 ? Math.ceil(m / TRUCK_M3 - 1e-9) : 0;
    const lastLoad = trips ? Math.round((m - (trips - 1) * TRUCK_M3) * 100) / 100 : 0;
    const concrete = m * cls[1];
    const transport = m > 0 ? Math.max(0, km - FREE_KM) * KM_PRICE * trips : 0;
    const pumpCost = pump && m > 0 ? PUMP_FIXED + m * PUMP_PER_M3 : 0;
    const partialFee = m > 0 && lastLoad < PARTIAL_TRIP_MIN_M3 ? PARTIAL_TRIP_FEE : 0;
    const total = Math.round(concrete + transport + pumpCost) + partialFee;
    return { m, trips, lastLoad, concrete, transport, pumpCost, partialFee, total };
  }

  /* ---------- Câmpuri ---------- */
  function renderFields() {
    $("fields").innerHTML = FIELDS[shape].map((f) => {
      const id = `f-${shape}-${f[0]}`;
      return `<label class="c-f" for="${id}"><span>${f[1]}</span><span class="c-box">` +
        `<input id="${id}" type="number" min="0" step="any" inputmode="decimal" data-k="${f[0]}" value="${values[shape][f[0]]}">` +
        `<em aria-hidden="true">${f[2]}</em><span class="sr-only"> ${f[2]}</span></span></label>`;
    }).join("");
  }

  /* ---------- Desen izometric în hero (legat de „Placă / radier”) ---------- */
  function drawIso() {
    const L = v("L", "placa"), W = v("W", "placa"), H = v("H", "placa");
    const m = volume("placa");
    // proporții: lățimea totală a desenului e fixă (340 px), raportul L/l se păstrează (limitat)
    let a = L + W > 0 ? L / (L + W) : 0.5;
    a = Math.min(0.75, Math.max(0.25, a));
    const b = 1 - a;
    const t = Math.min(56, Math.max(8, H * 2)); // grosime vizuală
    const x0 = 40;
    const y0 = 160 + (170 * a - 170 * b - t) / 2;
    const P0 = [x0, y0], P1 = [x0 + 340 * a, y0 - 170 * a], P2 = [x0 + 340, y0 - 170 * a + 170 * b], P3 = [x0 + 340 * b, y0 + 170 * b];
    const p = (q) => q[0].toFixed(1) + " " + q[1].toFixed(1);

    $("isoTop").setAttribute("d", `M${p(P0)} L${p(P1)} L${p(P2)} L${p(P3)}Z`);
    $("isoLeft").setAttribute("d", `M${p(P0)} v${t} L${P3[0].toFixed(1)} ${(P3[1] + t).toFixed(1)} V${P3[1].toFixed(1)}Z`);
    $("isoRight").setAttribute("d", `M${P3[0].toFixed(1)} ${(P3[1] + t).toFixed(1)} V${P3[1].toFixed(1)} L${p(P2)} v${t}Z`);
    $("isoDash").setAttribute("d", `M${P0[0]} ${(P0[1] - 10).toFixed(1)} L${P1[0].toFixed(1)} ${(P1[1] - 10).toFixed(1)} L${P2[0].toFixed(1)} ${(P2[1] - 10).toFixed(1)}`);

    const lx = (P0[0] + P1[0]) / 2 - 50, ly = (P0[1] + P1[1]) / 2 - 22;
    const wx = (P1[0] + P2[0]) / 2 - 20, wy = (P1[1] + P2[1]) / 2 - 30;
    const hx = P2[0] + 12, hy = P2[1] + t / 2 + 5;
    setText("isoL", `L = ${fmt(L, 2)} m`, lx, ly, -26.57);
    setText("isoW", `l = ${fmt(W, 2)} m`, wx, wy, 26.57);
    setText("isoH", `h = ${fmt(H, 0)} cm`, hx, hy);

    const cx = (P0[0] + P2[0]) / 2, cy = (P1[1] + P3[1]) / 2;
    const label = `= ${fmt(m, 2)} m³`;
    const w = Math.max(120, label.length * 8.6 + 28);
    const box = $("isoResBox");
    box.setAttribute("x", (cx - w / 2).toFixed(1)); box.setAttribute("width", w.toFixed(1));
    box.setAttribute("y", (cy - 19).toFixed(1));
    const vt = $("isoV");
    vt.textContent = label; vt.setAttribute("x", cx.toFixed(1)); vt.setAttribute("y", (cy + 5).toFixed(1));

    const desc = `Desen izometric al plăcii: L = ${fmt(L, 2)} m, l = ${fmt(W, 2)} m, h = ${fmt(H, 0)} cm, volum ${fmt(m, 2)} m³`;
    $("isoTitle").textContent = desc;
  }
  function setText(id, txt, x, y, rot) {
    const el = $(id);
    el.textContent = txt;
    el.setAttribute("x", x.toFixed(1)); el.setAttribute("y", y.toFixed(1));
    if (rot != null) el.setAttribute("transform", `rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})`);
  }

  /* ---------- Afișare rezultat ---------- */
  function calc() {
    const m = volume(shape);
    const cls = CLASSES[+$("clasa").value];
    const km = Math.max(0, Math.round(num($("km").value)));
    const pump = $("pompa").checked;
    const q = quote(m, cls, km, pump);
    last = { ...q, cls, km, pump };

    $("vol").textContent = fmt(m, 2);
    $("clasaHint").textContent = cls[2];

    if (q.trips) {
      const shown = Math.min(q.trips, 8);
      const fill = Math.round(q.lastLoad / TRUCK_M3 * 100);
      $("trucks").innerHTML = Array.from({ length: shown }, (_, i) =>
        i === shown - 1 && q.lastLoad < TRUCK_M3
          ? `<span class="tk half" style="--fill:${fill}%" aria-hidden="true"></span>`
          : `<span class="tk" aria-hidden="true"></span>`).join("") +
        `<b>${q.trips} ${q.trips === 1 ? "autobetonieră" : "autobetoniere"}</b> <i>· ${TRUCK_M3} m³ fiecare</i>`;
    } else {
      $("trucks").innerHTML = "";
    }

    $("lClasa").textContent = `${cls[0]} · ${fmt(m, 2)} m³`;
    $("lTransp").textContent = km <= FREE_KM ? `· gratuit până la ${FREE_KM} km` : `· ${km} km × ${q.trips} ${q.trips === 1 ? "cursă" : "curse"}`;
    $("pBeton").textContent = fmt(q.concrete) + " lei";
    $("pTransp").textContent = fmt(q.transport) + " lei";

    $("rPompa").hidden = !q.pumpCost;
    $("lPompa").textContent = `· ${fmt(PUMP_FIXED)} + ${PUMP_PER_M3} lei/m³`;
    $("pPompa").textContent = fmt(q.pumpCost) + " lei";

    $("rTaxa").hidden = !q.partialFee;
    $("lTaxa").textContent = `ultima cursă duce doar ${fmt(q.lastLoad, 2)} m³ (sub ${PARTIAL_TRIP_MIN_M3} m³) – mașina pleacă oricum, deci se taxează deplasarea`;
    $("pTaxa").textContent = fmt(q.partialFee) + " lei";

    $("pTot").textContent = fmt(q.total) + " lei";

    drawIso();
  }

  /* ---------- Inițializare ---------- */
  function init() {
    $("clasa").innerHTML = CLASSES.map((c, i) =>
      `<option value="${i}"${i === DEFAULT_CLASS ? " selected" : ""}>${c[0]} · ${c[1]} lei/m³</option>`).join("");
    $("loc").innerHTML = PLACES.map((l) => `<option value="${l[1]}" data-n="${l[0]}">${l[0]} · ~${l[1]} km</option>`).join("") +
      `<option value="x">Altă localitate…</option>`;

    $("shapes").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-s]");
      if (!btn) return;
      shape = btn.dataset.s;
      $("shapes").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      renderFields();
      calc();
    });

    $("fields").addEventListener("input", (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      values[shape][k] = e.target.value;
      calc();
    });

    $("loc").addEventListener("change", () => {
      if ($("loc").value !== "x") $("km").value = $("loc").value;
      else $("km").focus();
      calc();
    });
    $("km").addEventListener("input", () => {
      // dacă km nu mai corespunde localității, trecem pe „Altă localitate…”
      const opt = $("loc").selectedOptions[0];
      if (opt && opt.value !== "x" && opt.value !== String(Math.round(num($("km").value)))) $("loc").value = "x";
      calc();
    });
    ["clasa", "pompa", "pierderi"].forEach((id) => {
      $(id).addEventListener("input", calc);
      $(id).addEventListener("change", calc);
    });

    // „Deschide calculatorul”: derulează și mută focusul pe forma selectată
    $("openCalc").addEventListener("click", (e) => {
      e.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("calculator").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", "#calculator");
      const on = $("shapes").querySelector('[aria-pressed="true"]');
      if (on) on.focus({ preventScroll: true });
    });

    initDialog();
    renderFields();
    calc();
  }

  /* ---------- Dialog „Cere ofertă fermă” → WhatsApp ---------- */
  function initDialog() {
    const dlg = $("dlg"), form = $("dlgForm");
    let opener = null;

    const today = new Date();
    const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $("fData").min = iso(today);

    function placeName() {
      const opt = $("loc").selectedOptions[0];
      return opt && opt.value !== "x" ? opt.dataset.n : "altă localitate";
    }
    function summary() {
      const q = last;
      return [
        `Lucrare: ${SHAPE_NAMES[shape]}`,
        `Volum: ${fmt(q.m, 2)} m³ (${q.trips} ${q.trips === 1 ? "cursă" : "curse"})`,
        `Clasă: ${q.cls[0]}`,
        `Distanță: ${q.km} km (${placeName()})`,
        `Pompă: ${q.pump ? "da" : "nu"}`,
        q.partialFee ? `Taxă cursă incompletă: ${fmt(q.partialFee)} lei` : null,
        `Total estimat: ${fmt(q.total)} lei (fără TVA)`
      ].filter(Boolean);
    }

    $("cta").addEventListener("click", () => {
      opener = document.activeElement;
      $("dlgSum").innerHTML = summary().map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>");
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      $("fNume").focus();
    });
    function close() { if (dlg.open) dlg.close(); }
    $("dlgClose").addEventListener("click", close);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener("close", () => { if (opener) opener.focus(); });

    const rules = [
      ["fNume", "eNume", (x) => x.trim().length >= 2, "Scrie numele (minim 2 litere)."],
      ["fTel", "eTel", (x) => x.replace(/\D/g, "").length >= 9, "Scrie un număr de telefon valid."],
      ["fAdr", "eAdr", (x) => x.trim().length >= 4, "Scrie adresa sau localitatea șantierului."],
      ["fData", "eData", (x) => !!x && x >= $("fData").min, "Alege o dată de azi încolo."]
    ];
    function validate(only) {
      let firstBad = null;
      rules.forEach(([fid, eid, ok, msg]) => {
        if (only && only !== fid) return;
        const el = $(fid), good = ok(el.value);
        el.setAttribute("aria-invalid", String(!good));
        $(eid).textContent = good ? "" : msg;
        if (!good && !firstBad) firstBad = el;
      });
      return firstBad;
    }
    rules.forEach(([fid]) => $(fid).addEventListener("blur", () => { if ($(fid).value) validate(fid); }));

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const bad = validate();
      if (bad) { bad.focus(); return; }
      const d = $("fData").value.split("-").reverse().join(".");
      const msg = [
        "Bună ziua! Aș dori o ofertă fermă pentru beton:",
        ...summary(),
        "",
        `Nume: ${$("fNume").value.trim()}`,
        `Telefon: ${$("fTel").value.trim()}`,
        `Adresă: ${$("fAdr").value.trim()}`,
        `Data turnării: ${d}`
      ].join("\n");
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
      close();
    });
  }

  // expus pentru verificări din consolă
  window.VestBeton = { quote, CLASSES, fmt };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
