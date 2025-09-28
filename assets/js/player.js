// /assets/js/player.js
(async function PlayerPage(){
  const leagueChips = document.getElementById("league-chips");
  const rankEl   = document.getElementById("player-rank");
  const titleEl  = document.getElementById("player-title");
  const metaEl   = document.getElementById("player-meta");

  const overallStats = document.getElementById("overall-stats");
  const rrStats      = document.getElementById("rr-stats");
  const leagueStats  = document.getElementById("league-stats");
  const bestScrips   = document.getElementById("best-scrips");
  const tradeCards   = document.getElementById("trade-cards");

  // Parse ?id=...
  const params = new URLSearchParams(location.search);
  const playerId = params.get("id") || "";

  // Load config & lookups
  const cfg = await API.getConfig();
  AppState.setConfig(cfg);
  const lk = await API.getLookups();
  AppState.setLookups(lk);
  AppState.initSelectedLeagues();

  if (!playerId) {
    document.body.innerHTML = "<div class='empty'>Missing player id.</div>";
    return;
  }

  // League chips
  (AppState.leagues || []).forEach(l => {
    if (l.IsActive !== true && String(l.IsActive).toLowerCase() !== "true") return;
    const b = document.createElement("button");
    b.className = "chip" + (AppState.selectedLeagues.includes(l.LeagueName) ? " chip--selected" : "");
    b.textContent = l.LeagueName;
    b.dataset.leagueId = l.LeagueID;
    b.addEventListener("click", async () => {
      b.classList.toggle("chip--selected");
      AppState.selectedLeagues = Array.from(leagueChips.querySelectorAll(".chip--selected")).map(x=>x.textContent);
      await refresh();
    });
    leagueChips.appendChild(b);
  });

  function currentLeagueIds() {
    return (AppState.leagues||[])
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);
  }

  async function refresh() {
    const data = await API.getPlayerDetail(playerId, currentLeagueIds());
    paintHeader(data.player);
    paintOverview(data.overall, data.rr);
    paintPerLeague(data.perLeague || []);
    paintBestScrips(data.bestScrips || []);
    paintTrades(data.trades || []);
  }

  function paintHeader(p){
    rankEl.textContent = p.CurrentRank ? `#${p.CurrentRank}` : "#—";
    titleEl.textContent = `${p.PlayerName} · ${p.TeamName || ""}`;
    metaEl.textContent = `Risk: ${p.RiskTrait || "—"} /5`;
  }

  function paintOverview(o, rr){
    overallStats.innerHTML = `
      <div class="stat"><span class="stat-label">TT</span><span class="stat-value">${o.TT||0}</span></div>
      <div class="stat"><span class="stat-label">W</span><span class="stat-value">${o.Wins||0}</span></div>
      <div class="stat"><span class="stat-label">L</span><span class="stat-value">${o.Losses||0}</span></div>
      <div class="stat"><span class="stat-label">W%</span><span class="stat-value">${(o.WinPct||0).toFixed(1)}%</span></div>
      <div class="stat"><span class="stat-label">PnL</span><span class="stat-value">${Fmt.compact(o.PnL)}</span></div>
      <div class="stat"><span class="stat-label">PnL%</span><span class="stat-value">${(o.PnLPct||0).toFixed(2)}%</span></div>
    `;
    rrStats.innerHTML = `
      <div class="stat-pill">r:r avg <b>${rr.count? rr.avg.toFixed(2):"—"}</b></div>
      <div class="stat-pill">med <b>${rr.count? rr.med.toFixed(2):"—"}</b></div>
      <div class="stat-pill">best <b>${rr.count? rr.best.toFixed(2):"—"}</b></div>
      <div class="stat-pill">worst <b>${rr.count? rr.worst.toFixed(2):"—"}</b></div>
    `;
  }

  function paintPerLeague(arr){
    leagueStats.innerHTML = "";
    if (!arr.length) { leagueStats.innerHTML = `<div class="empty">No trades yet.</div>`; return; }
    arr.forEach(x => {
      const row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = `
        <div class="row-main">
          <div class="row-title">${x.LeagueName}</div>
          <div class="row-sub">TT ${x.TT} · W% ${(x.WinPct||0).toFixed(1)}%</div>
        </div>
        <div class="row-value">${Fmt.compact(x.PnL)} (${(Number(x.PnLPct||0)).toFixed(2)}%)</div>
      `;
      leagueStats.appendChild(row);
    });
  }

  function paintBestScrips(arr){
    bestScrips.innerHTML = "";
    if (!arr.length) { bestScrips.innerHTML = `<div class="empty">No scrips yet.</div>`; return; }
    arr.forEach(s => {
      const row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = `
        <div class="row-main">
          <div class="row-title"><a href="scrip.html?id=${encodeURIComponent(s.ScripID)}">${s.ScripName}</a></div>
          <div class="row-sub">TT ${s.TT} · W% ${(s.WinPct||0).toFixed(1)}%</div>
        </div>
        <div class="row-value">${Fmt.compact(s.PnL)} (${(Number(s.PnLPct||0)).toFixed(2)}%)</div>
      `;
      bestScrips.appendChild(row);
    });
  }

  function paintTrades(arr){
    tradeCards.innerHTML = "";
    if (!arr.length) { tradeCards.innerHTML = `<div class="empty">No trades yet.</div>`; return; }
    arr.forEach(tr => {
      const card = document.createElement("div");
      card.className = "trade-card";
      const tags = (tr.tags||[]).map(t => `<span class="tag">#${t}</span>`).join(" ");
      card.innerHTML = `
        <div class="trade-card-header">
          <div class="trade-card-title">${tr.ScripName} · ${tr.Side}</div>
          <div class="trade-card-meta">${Fmt.dateTime(tr.OpenTimestamp)} ${tr.Status==="Closed" ? "→ "+Fmt.dateTime(tr.CloseTimestamp) : ""}</div>
        </div>
        <div class="trade-card-subtitle">${tr.LeagueName} · ${tr.TeamName || ""} ${tags? "· "+tags : ""}</div>
        <div class="trade-card-stats">
          <div class="stat"><span class="stat-label">Avg</span><span class="stat-value">${Fmt.compact(tr.avgEntry)}</span></div>
          <div class="stat"><span class="stat-label">Open</span><span class="stat-value">${tr.openQty}</span></div>
          <div class="stat"><span class="stat-label">r:r</span><span class="stat-value">${tr.rr ? tr.rr.toFixed(2) : "—"}</span></div>
          <div class="stat"><span class="stat-label">PnL</span><span class="stat-value">${Fmt.compact(tr.realizedPnl)}</span></div>
          <div class="stat"><span class="stat-label">PnL%</span><span class="stat-value">${(Number(tr.realizedPnlPct||0)).toFixed(2)}%</span></div>
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
      tradeCards.appendChild(card);
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
  }
  await refresh();
})();
