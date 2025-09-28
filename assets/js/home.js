// /assets/js/home.js
(async function HomePage(){
  const leagueChips = document.getElementById("league-chips");
  const roundBanner = document.getElementById("round-banner");
  const openList    = document.getElementById("open-list");
  const walletWrap  = document.getElementById("wallet-cards");
  const lastWrap    = document.getElementById("last-trades");
  const tagFilter  = document.getElementById("tag-filter");
  let activeTags = []; // for filtering
  let lastOpenRows = []; // keep a copy to re-filter on tag toggles

  // Load config + lookups
  const cfg = await API.getConfig();
  AppState.setConfig(cfg);
  const lk = await API.getLookups();
  AppState.setLookups(lk);
  AppState.initSelectedLeagues();

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

  async function refreshRoundBanner() {
    const leagueIds = currentLeagueIds();
    const rounds = await API.getRoundsMeta(leagueIds);
    roundBanner.textContent = (rounds || []).map(r => `${r.LeagueName} • R: ${r.RoundNumber} • Cap: ${r.BudgetCapPerPlayer}`).join("  |  ") || "No active rounds";
  }
  function currentLeagueIds() {
    return AppState.leagues.filter(l => AppState.selectedLeagues.includes(l.LeagueName)).map(l => l.LeagueID);
  }

  function drawSparkline(el){
    const pts = (el.dataset.points || "").split(",").map(Number).filter(x => isFinite(x));
    const width = 160, height = 48, pad = 4;
    const min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    const span = (max - min) || 1;
    const stepX = (width - pad*2) / Math.max(1, pts.length - 1);
    const d = pts.map((v,i) => {
      const x = pad + i*stepX;
      const y = pad + (height - pad*2) * (1 - (v - min) / span);
      return `${i===0?"M":"L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>`;
  }

  function stepByLastDigit(valueStr, dir) {
    let s = (valueStr ?? "").toString().trim();
    if (s === "" || isNaN(Number(s))) s = "0";
    const dec = (s.split(".")[1] || "").length;
    const step = Math.pow(10, -dec);
    const next = Number(s) + dir * step;
    return Number(next.toFixed(dec));
  }

  async function refresh() {
    await refreshRoundBanner();
    const data = await API.getHomeData(currentLeagueIds());
    lastOpenRows = data.openPositions || [];
    renderTagFilter(lastOpenRows);
    renderOpen(filteredOpenRows());
    renderWallets(data.wallets || []);
    renderLast(data.lastExits || []);
  }

  function renderOpen(rows){
    const tagHtml = (r.Tags || "")
    .toString()
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(t => `<span class="tag">#${t}</span>`)
    .join(" ");

    openList.innerHTML = "";
    if (!rows.length) { openList.innerHTML = `<div class="empty">No open positions.</div>`; return; }

    rows.forEach(r => {
      const card = document.createElement("div");
      card.className = "trade-card";

      const rr = r.RR || "—";
      const estSL = r.EstAtSL ? `${Fmt.compact(r.EstAtSL.pnl)} (${(Number(r.EstAtSL.pct||0)).toFixed(2)}%)` : "—";
      const estTP = r.EstAtTP ? `${Fmt.compact(r.EstAtTP.pnl)} (${(Number(r.EstAtTP.pct||0)).toFixed(2)}%)` : "—";
      const upnl = Number(r.UnrlzPnL || 0);
      const upnlPct = Number(r.UnrlzPnLPct || 0);
      const upnlClass = upnl > 0 ? "pos" : (upnl < 0 ? "neg" : "");
      const markTxt = r.Mark ? Fmt.compact(r.Mark) : "—";
      const markAsOfTxt = r.MarkAsOf ? Fmt.dateTime(r.MarkAsOf) : "";

      card.innerHTML = `
        <div class="trade-card-header">
          <div class="trade-card-title">${r.PlayerName} · ${r.TeamName || ""}</div>
          <div class="trade-card-meta">${r.LeagueName}</div>
        </div>
        <div class="trade-card-subtitle">
          ${r.ScripName} · ${r.Side} ${tagHtml ? "· " + tagHtml : ""}
          ${markAsOfTxt ? `<span class="muted">· ${markAsOfTxt}</span>` : ""}
        </div>
      

        <div class="trade-card-stats">
          <div class="stat"><span class="stat-label">Open</span><span class="stat-value">${r.OpenQty}</span></div>
          <div class="stat"><span class="stat-label">Avg</span><span class="stat-value">${Fmt.compact(r.AvgEntry)}</span></div>
          <div class="stat"><span class="stat-label">SL</span><span class="stat-value">${r.PositionSL || "—"}</span></div>
          <div class="stat"><span class="stat-label">TP</span><span class="stat-value">${r.PositionTP || "—"}</span></div>
          <div class="stat"><span class="stat-label">r:r</span><span class="stat-value">${rr}</span></div>
          <div class="stat"><span class="stat-label">Realized</span><span class="stat-value">${Fmt.compact(r.RealizedPnL)} (${(Number(r.RealizedPnLPct||0)).toFixed(2)}%)</span></div>
          <div class="stat"><span class="stat-label">@SL</span><span class="stat-value">${estSL}</span></div>
          <div class="stat"><span class="stat-label">@TP</span><span class="stat-value">${estTP}</span></div>
          <div class="stat"><span class="stat-label">Mark</span><span class="stat-value">${markTxt}</span></div>
          <div class="stat"><span class="stat-label">uPnL</span><span class="stat-value ${upnlClass}">${Fmt.compact(upnl)}</span></div>
          <div class="stat"><span class="stat-label">uPnL%</span><span class="stat-value ${upnlClass}">${upnlPct ? upnlPct.toFixed(2) : "0.00"}%</span></div>        
        </div>

        <div class="trade-card-actions">
          <button class="btn btn-small" data-act="entry">➕ Entry</button>
          <button class="btn btn-small" data-act="exit">➖ Exit</button>
          <button class="btn btn-small" data-act="exit-sl">🛑</button>
          <button class="btn btn-small" data-act="exit-tp">🎯</button>
          <button class="btn btn-small" data-act="close">✅ Close</button>
        </div>  
        

        <div class="inline-form hidden" data-form="entry">
          <div class="row">
            <label class="lbl">Qty</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="qty-entry" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="qty-entry" placeholder="0">
              <button type="button" class="btn-step" data-step="qty-entry" data-dir="up">+</button>
            </div>
          </div>
          <div class="row">
            <label class="lbl">Price</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="price-entry" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="price-entry" placeholder="${r.AvgEntry || 0}">
              <button type="button" class="btn-step" data-step="price-entry" data-dir="up">+</button>
            </div>
          </div>
          <div class="row">
            <label class="lbl">Total</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="total-entry" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="total-entry" placeholder="0">
              <button type="button" class="btn-step" data-step="total-entry" data-dir="up">+</button>
            </div>
            <div class="hint">Type Qty or Total — the other updates.</div>
          </div>
          <div class="row">
            <button class="btn btn-primary" data-submit="entry">Add Entry</button>
          </div>
        </div>

        <div class="inline-form hidden" data-form="exit">
          <div class="row">
            <label class="lbl">Qty</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="qty-exit" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="qty-exit" placeholder="${r.OpenQty}">
              <button type="button" class="btn-step" data-step="qty-exit" data-dir="up">+</button>
            </div>
          </div>
          <div class="row">
            <label class="lbl">Price</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="price-exit" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="price-exit" placeholder="${r.AvgEntry}">
              <button type="button" class="btn-step" data-step="price-exit" data-dir="up">+</button>
            </div>
            <div class="btn-row">
              <button class="btn btn-tiny" data-fill="sl">🛑 SL</button>
              <button class="btn btn-tiny" data-fill="tp">🎯 TP</button>
            </div>
          </div>
          <div class="row">
            <label class="lbl">Total</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="total-exit" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="total-exit" placeholder="0">
              <button type="button" class="btn-step" data-step="total-exit" data-dir="up">+</button>
            </div>
            <div class="hint">Type Qty or Total — the other updates.</div>
          </div>
          <div class="row">
            <button class="btn btn-primary" data-submit="exit">Add Exit</button>
          </div>
        </div>
      `;

      // wire buttons
      const btnEntry = card.querySelector("[data-act='entry']");
      const btnExit  = card.querySelector("[data-act='exit']");
      const btnClose = card.querySelector("[data-act='close']");
      const formEntry= card.querySelector("[data-form='entry']");
      const formExit = card.querySelector("[data-form='exit']");
      const btnExitSL = card.querySelector("[data-act='exit-sl']");
      const btnExitTP = card.querySelector("[data-act='exit-tp']");

      btnEntry.addEventListener("click", () => {
        formExit.classList.add("hidden");
        formEntry.classList.toggle("hidden");
        formEntry.querySelector("[data-input='qty-entry']").focus();
      });
      btnExit.addEventListener("click", () => {
        formEntry.classList.add("hidden");
        formExit.classList.toggle("hidden");
        formExit.querySelector("[data-input='qty-exit']").focus();
      });
      btnClose.addEventListener("click", async () => {
        await API.closePosition(r.PositionID);
        await refresh();
      });

      async function oneTapExit(kind){
        const qty = Number(r.OpenQty||0);
        const price = kind==="SL" ? Number(r.PositionSL||0) : Number(r.PositionTP||0);
        if (!qty) return alert("No open qty.");
        if (!price) return alert(`No ${kind} set.`);
        await API.addLeg({
          positionId: r.PositionID,
          legType: "Exit",
          qty: String(qty),
          price: String(price),
          total: String(qty*price),
          exitType: kind
        });
        await refresh();
      }

      btnExitSL.addEventListener("click", () => oneTapExit("SL"));
      btnExitTP.addEventListener("click", () => oneTapExit("TP"));


      // steppers
      card.querySelectorAll(".btn-step").forEach(btn => {
        btn.addEventListener("click", () => {
          const dir = btn.dataset.dir === "up" ? 1 : -1;
          const key = btn.dataset.step;
          const input = card.querySelector(`[data-input='${key}']`);
          input.value = stepByLastDigit(input.value, dir);
          // link Qty <-> Total if we can (needs price)
          const [qKey, pKey, tKey] = key.includes("entry")
            ? ["qty-entry","price-entry","total-entry"]
            : ["qty-exit","price-exit","total-exit"];
          const qEl = card.querySelector(`[data-input='${qKey}']`);
          const pEl = card.querySelector(`[data-input='${pKey}']`);
          const tEl = card.querySelector(`[data-input='${tKey}']`);
          const price = Number(pEl.value || 0);
          if (price > 0) {
            if (input === qEl) tEl.value = (Number(qEl.value||0) * price).toString();
            if (input === tEl) qEl.value = (Number(tEl.value||0) / price).toString();
          }
        });
      });

      // two-way link on typing
      function link(qKey, pKey, tKey){
        const qEl = card.querySelector(`[data-input='${qKey}']`);
        const pEl = card.querySelector(`[data-input='${pKey}']`);
        const tEl = card.querySelector(`[data-input='${tKey}']`);
        function recompute(from){
          const price = Number(pEl.value || 0);
          if (!price) return;
          if (from==="qty") tEl.value = (Number(qEl.value||0)*price).toString();
          if (from==="total") qEl.value = (Number(tEl.value||0)/price).toString();
        }
        qEl.addEventListener("input", () => recompute("qty"));
        tEl.addEventListener("input", () => recompute("total"));
        pEl.addEventListener("input", () => recompute("qty")); // default to qty driver
      }
      link("qty-entry","price-entry","total-entry");
      link("qty-exit","price-exit","total-exit");

      // quick fill SL/TP
      formExit.querySelector("[data-fill='sl']").addEventListener("click", (e)=> {
        e.preventDefault();
        const pEl = formExit.querySelector("[data-input='price-exit']");
        pEl.value = r.PositionSL || "";
        pEl.dispatchEvent(new Event("input"));
      });
      formExit.querySelector("[data-fill='tp']").addEventListener("click", (e)=> {
        e.preventDefault();
        const pEl = formExit.querySelector("[data-input='price-exit']");
        pEl.value = r.PositionTP || "";
        pEl.dispatchEvent(new Event("input"));
      });

      // submit entry
      formEntry.querySelector("[data-submit='entry']").addEventListener("click", async () => {
        const q = formEntry.querySelector("[data-input='qty-entry']").value;
        const p = formEntry.querySelector("[data-input='price-entry']").value;
        const t = formEntry.querySelector("[data-input='total-entry']").value;
        if (!Number(q) && !Number(t)) return alert("Enter Qty or Total");
        if (!Number(p)) return alert("Enter Price");
        await API.addLeg({ positionId: r.PositionID, legType: "Entry", qty: q||"0", price: p, total: t||"" });
        await refresh();
      });

      // submit exit
      formExit.querySelector("[data-submit='exit']").addEventListener("click", async () => {
        const q = formExit.querySelector("[data-input='qty-exit']").value;
        const p = formExit.querySelector("[data-input='price-exit']").value;
        const t = formExit.querySelector("[data-input='total-exit']").value;
        if (!Number(q) && !Number(t)) return alert("Enter Qty or Total");
        if (!Number(p)) return alert("Enter Price");
        // decide ExitType if price equals SL or TP (rough compare)
        let exitType = "Manual";
        const numP = Number(p), sl = Number(r.PositionSL||0), tp = Number(r.PositionTP||0);
        if (sl && Math.abs(numP - sl) < 1e-12) exitType = "SL";
        if (tp && Math.abs(numP - tp) < 1e-12) exitType = "TP";
        await API.addLeg({ positionId: r.PositionID, legType: "Exit", qty: q||"0", price: p, total: t||"", exitType });
        await refresh();
      });

      openList.appendChild(card);
    });
  }

  function renderWallets(arr){
    walletWrap.innerHTML = "";
    if (!arr.length) { walletWrap.innerHTML = `<div class="empty">No wallet for selected leagues.</div>`; return; }
    arr.forEach(w => {
      const last = Number(w.LastImpact||0);
      const arrow = last > 0 ? "⬆️" : last < 0 ? "⬇️" : "⏸️";
      const div = document.createElement("div");
      div.className = "wallet-mini";
      div.innerHTML = `
        <div class="wallet-mini-left">
          <div class="wallet-mini-title">${w.WalletName} <span class="muted">(${w.Currency})</span></div>
          <div class="wallet-mini-balance">${Fmt.compact(w.EquityNow)} <span class="delta">${arrow} ${Fmt.compact(w.LastImpact)}</span></div>
        </div>
        <div class="wallet-mini-spark" data-points="${(w.Spark||[]).join(",")}"></div>
      `;
      walletWrap.appendChild(div);
    });
    walletWrap.querySelectorAll(".wallet-mini-spark").forEach(drawSparkline);
  }

  function renderLast(items){
    lastWrap.innerHTML = "";
    if (!items.length) { lastWrap.innerHTML = `<div class="empty">No trades yet.</div>`; return; }
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = `
        <div class="row-main">
          <div class="row-title">${it.PlayerName} · ${it.ScripName} · ${it.Side}</div>
          <div class="row-sub">${Fmt.dateTime(it.Timestamp)} · ${it.ExitType || ""}</div>
        </div>
        <div class="row-value">${Fmt.compact(it.RealizedPnl)} (${(Number(it.RealizedPnlPct||0)).toFixed(2)}%)</div>
      `;
      lastWrap.appendChild(row);
    });
  }

  await refresh();

  function uniqueTags(rows){
    const set = new Set();
    rows.forEach(r => {
      (r.Tags || "").toString().split(",").forEach(s => {
        const t = s.trim();
        if (t) set.add(t);
      });
    });
    return Array.from(set);
  }

  function renderTagFilter(rows){
    const tags = uniqueTags(rows);
    tagFilter.innerHTML = "";
    if (!tags.length) return;
    tags.forEach(t => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = `#${t}`;
      b.dataset.tag = t;
      b.addEventListener("click", () => {
        b.classList.toggle("chip--selected");
        activeTags = Array.from(tagFilter.querySelectorAll(".chip--selected")).map(x => x.dataset.tag);
        renderOpen(filteredOpenRows());
      });
      tagFilter.appendChild(b);
    });
  }

  function filteredOpenRows(){
    if (!activeTags.length) return lastOpenRows;
    return lastOpenRows.filter(r => {
      const tags = (r.Tags || "").toString().split(",").map(s => s.trim()).filter(Boolean);
      // show a card if it contains ALL active tags (AND) — change to OR if you prefer
      return activeTags.every(t => tags.includes(t));
    });
  }
  await refresh();
  // Auto-refresh every 30s to reflect latest prices (adjust if you want)
  setInterval(refresh, 30000);

})();
