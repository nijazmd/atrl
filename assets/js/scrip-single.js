// /assets/js/scrip-single.js
(async function ScripSinglePage(){
  const chipsRow   = document.getElementById("scrip-chips");
  const titleEl    = document.getElementById("scrip-title");
  const totalsWrap = document.getElementById("totals-stats");
  const sideWrap   = document.getElementById("side-stats");
  const history    = document.getElementById("history");
  const searchEl   = document.getElementById("scrip-search");
  const dl         = document.getElementById("scrips-datalist");

  // Load config/lookups
  const config = await API.getConfig();
  AppState.setConfig(config);
  const lookups = await API.getLookups();
  AppState.setLookups(lookups);
  AppState.initSelectedLeagues();

  // Fill datalist
  (AppState.scrips || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.ScripName;
    opt.dataset.id = s.ScripID;
    dl.appendChild(opt);
  });

  // get URL ?id=...
  const params = new URLSearchParams(location.search);
  let currentId = params.get("id") || "";

  async function loadAndRender(useId) {
    const leagueIds = AppState.leagues
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);

    const data = await API.getScripDetail(useId || "", leagueIds);
    currentId = data.selected?.ScripID || "";
    const scripName = data.selected?.ScripName || currentId || "Scrip";

    // chips
    chipsRow.innerHTML = "";
    (data.scripChips || []).forEach(c => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (c.ScripID === currentId ? " chip--selected" : "");
      b.textContent = c.ScripName;
      b.addEventListener("click", () => {
        loadAndRender(c.ScripID);
      });
      chipsRow.appendChild(b);
    });

    // title
    titleEl.textContent = scripName;

    // totals
    const t = data.totals || {};
    totalsWrap.innerHTML = `
      <div class="stat"><span class="stat-label">TT</span><span class="stat-value">${t.TT||0}</span></div>
      <div class="stat"><span class="stat-label">W</span><span class="stat-value">${t.Wins||0}</span></div>
      <div class="stat"><span class="stat-label">L</span><span class="stat-value">${t.Losses||0}</span></div>
      <div class="stat"><span class="stat-label">W%</span><span class="stat-value">${(t.WinPct||0).toFixed(1)}%</span></div>
      <div class="stat"><span class="stat-label">PnL</span><span class="stat-value">${Fmt.compact(t.PnL)}</span></div>
      <div class="stat"><span class="stat-label">PnL%</span><span class="stat-value">${(t.PnLPct||0).toFixed(2)}%</span></div>
    `;

    // side stats
    sideWrap.innerHTML = `
      <div class="stat-block">
        <div class="stat-title">Long</div>
        <div class="stat-row"><span>TT</span><span>${t.LongTT||0}</span></div>
        <div class="stat-row"><span>W%</span><span>${(t.LongWinPct||0).toFixed(1)}%</span></div>
      </div>
      <div class="stat-block">
        <div class="stat-title">Short</div>
        <div class="stat-row"><span>TT</span><span>${t.ShortTT||0}</span></div>
        <div class="stat-row"><span>W%</span><span>${(t.ShortWinPct||0).toFixed(1)}%</span></div>
      </div>
    `;

    // history cards
    history.innerHTML = "";
    (data.trades || []).forEach(tr => {
      const card = document.createElement("div");
      card.className = "trade-card";
      card.innerHTML = `
        <div class="trade-card-header">
          <div class="trade-card-title">${tr.PlayerName} · ${tr.TeamName || ""}</div>
          <div class="trade-card-meta">${Fmt.dateTime(tr.OpenTimestamp)} ${tr.Status==="Closed" ? "→ " + Fmt.dateTime(tr.CloseTimestamp) : ""}</div>
        </div>
        <div class="trade-card-stats">
          <div class="stat"><span class="stat-label">Side</span><span class="stat-value">${tr.Side}</span></div>
          <div class="stat"><span class="stat-label">Avg</span><span class="stat-value">${Fmt.compact(tr.avgEntry)}</span></div>
          <div class="stat"><span class="stat-label">Open</span><span class="stat-value">${tr.openQty}</span></div>
          <div class="stat"><span class="stat-label">r:r</span><span class="stat-value">${tr.rr || "—"}</span></div>
          <div class="stat"><span class="stat-label">PnL</span><span class="stat-value">${Fmt.compact(tr.realizedPnl)}</span></div>
          <div class="stat"><span class="stat-label">PnL%</span><span class="stat-value">${(tr.realizedPnlPct||0).toFixed(2)}%</span></div>
        </div>
        <div class="trade-card-legs">
          ${(tr.legs||[]).map(l => `
            <div class="leg-row" data-leg="${l.LegID}" data-type="${l.LegType}">
            <span class="leg-type">${l.LegType==="Entry" ? "➕" : "➖"}</span>
            <span class="leg-qty">${l.Qty}</span>
            <span class="leg-price">@ ${Fmt.compact(l.Price)}</span>
            <span class="leg-total">= ${Fmt.compact(l.Total)}</span>
            <span class="leg-time">${Fmt.dateTime(l.Timestamp)}</span>
            ${l.LegType==="Exit" ? `<span class="leg-pnl">${Fmt.compact(l.RealizedPnl)} (${(Number(l.RealizedPnlPct||0)).toFixed(2)}%)</span>` : ""}
            <span class="leg-actions">
              <button class="icon-btn" data-edit="${l.LegID}">✏️</button>
              <button class="icon-btn" data-del="${l.LegID}">🗑️</button>
            </span>
          </div>
      
          `).join("")}
        </div>
      `;
      history.appendChild(card);
            // Edit/Delete legs (inline mini form)
            card.querySelectorAll("[data-edit]").forEach(btn => {
              btn.addEventListener("click", () => {
                const legId = btn.getAttribute("data-edit");
                const row = card.querySelector(`.leg-row[data-leg='${legId}']`);
                const type = row.getAttribute("data-type");
                const qtyEl = row.querySelector(".leg-qty");
                const priceEl = row.querySelector(".leg-price");
                const totalEl = row.querySelector(".leg-total");
      
                const oldQty   = (qtyEl.textContent || "").replace(/[^\d.\-]/g,"");
                const oldPrice = (priceEl.textContent||"").replace(/[^\d.\-]/g,"");
                const oldTotal = (totalEl.textContent||"").replace(/[^\d.\-]/g,"");
      
                row.innerHTML = `
                  <span class="leg-type">${type==="Entry"?"➕":"➖"}</span>
                  <div class="number-group">
                    <button type="button" class="btn-step" data-k="qty" data-d="-1">−</button>
                    <input class="input input--xs" type="number" inputmode="decimal" data-k="qty" value="${oldQty}">
                    <button type="button" class="btn-step" data-k="qty" data-d="1">+</button>
                  </div>
                  <div class="number-group">
                    <button type="button" class="btn-step" data-k="price" data-d="-1">−</button>
                    <input class="input input--xs" type="number" inputmode="decimal" data-k="price" value="${oldPrice}">
                    <button type="button" class="btn-step" data-k="price" data-d="1">+</button>
                  </div>
                  <div class="number-group">
                    <button type="button" class="btn-step" data-k="total" data-d="-1">−</button>
                    <input class="input input--xs" type="number" inputmode="decimal" data-k="total" value="${oldTotal}">
                    <button type="button" class="btn-step" data-k="total" data-d="1">+</button>
                  </div>
                  ${type==="Exit" ? `
                    <select class="input input--xs" data-k="exitType">
                      <option value="Manual">Manual</option>
                      <option value="SL">SL</option>
                      <option value="TP">TP</option>
                    </select>` : `<span></span>`}
                  <button class="btn btn-tiny" data-k="save">Save</button>
                  <button class="btn btn-tiny" data-k="cancel">Cancel</button>
                `;
      
                // stepper: rightmost digit rule
                function stepVal(inp, dir){
                  const s = (inp.value||"0").toString();
                  const dec = (s.split(".")[1]||"").length;
                  const step = Math.pow(10, -dec);
                  const next = Number(s||0) + dir*step;
                  inp.value = next.toFixed(dec);
                }
                row.querySelectorAll(".btn-step").forEach(b=>{
                  b.addEventListener("click", ()=>{
                    const key = b.dataset.k;
                    const dir = Number(b.dataset.d);
                    const inp = row.querySelector(`[data-k='${key}']`);
                    stepVal(inp, dir);
                    // link qty<->total when price known
                    const q = row.querySelector("[data-k='qty']");
                    const p = row.querySelector("[data-k='price']");
                    const t = row.querySelector("[data-k='total']");
                    const price = Number(p.value||0);
                    if (price>0) {
                      if (inp===q) t.value = (Number(q.value||0)*price).toString();
                      if (inp===t) q.value = (Number(t.value||0)/price).toString();
                    }
                  });
                });
      
                row.querySelector("[data-k='cancel']").addEventListener("click", () => {
                  // simple refresh: reload page section
                  location.reload();
                });
                row.querySelector("[data-k='save']").addEventListener("click", async () => {
                  try {
                    const payload = {
                      legId,
                      qty: row.querySelector("[data-k='qty']").value,
                      price: row.querySelector("[data-k='price']").value,
                      total: row.querySelector("[data-k='total']").value
                    };
                    const sel = row.querySelector("[data-k='exitType']");
                    if (sel) payload.exitType = sel.value;
                    await API.updateLeg(payload);
                    // reload scrip detail
                    await loadAndRender(currentId);
                  } catch(err){ alert(err.message || String(err)); }
                });
              });
            });
      
            card.querySelectorAll("[data-del]").forEach(btn => {
              btn.addEventListener("click", async () => {
                const legId = btn.getAttribute("data-del");
                if (!confirm("Delete this leg?")) return;
                try {
                  await API.deleteLeg(legId);
                  await loadAndRender(currentId);
                } catch(err){ alert(err.message || String(err)); }
              });
            });
      
    });
    if (!history.children.length) history.innerHTML = `<div class="empty">No trades yet for this scrip.</div>`;

    // update URL ?id= (so refresh keeps selection)
    const url = new URL(location.href);
    url.searchParams.set("id", currentId);
    history.replaceChildren(...history.childNodes); // noop; keeps history visible
    history.ownerDocument.defaultView.history.replaceState({}, "", url);
  }

  // Search → pick by name
  searchEl.addEventListener("change", () => {
    const name = searchEl.value.trim().toLowerCase();
    const s = (AppState.scrips||[]).find(x => String(x.ScripName).toLowerCase() === name);
    if (s) loadAndRender(s.ScripID);
  });

  // initial load (uses ?id= if present, else top chip)
  await loadAndRender(currentId);
})();
