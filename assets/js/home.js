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
    openList.innerHTML = "";
    if (!rows.length) { 
      openList.innerHTML = `<div class="empty">No open positions.</div>`; 
      return; 
    }
  
    rows.forEach(r => {
      const tagHtml = (r.Tags || "")
        .toString()
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .map(t => `<span class="tag">#${t}</span>`)
        .join(" ");
  
      const card = document.createElement("div");
      card.className = "trade-card";

      const rr = r.RR || "—";
      // --- derived stats (frontend only) ---
      const side = String(r.Side || 'Long').toLowerCase();
      const avg  = Number(r.AvgEntry || 0);
      const sl   = Number(r.PositionSL || 0);
      const tp   = Number(r.PositionTP || 0);
      const oq   = Number(r.OpenQty || 0);

      function pnlAt(price){
        if (!price || !oq || !avg) return null;
        const diff = (side === 'long') ? (price - avg) : (avg - price);
        const pnl  = diff * oq;
        const pct  = avg ? (diff / avg) * 100 : 0;
        return { pnl, pct };
      }
      const estAtSL = pnlAt(sl);
      const estAtTP = pnlAt(tp);

      // r:r = reward/risk from entry to TP vs entry to SL
      let rrTxt = "—";
      if (avg && sl && tp) {
        const reward = Math.abs((side === 'long') ? (tp - avg) : (avg - tp));
        const risk   = Math.abs((side === 'long') ? (avg - sl) : (sl - avg));
        if (risk > 0) rrTxt = (reward / risk).toFixed(2);
      }
      const estSLTxt = estAtSL ? `${Fmt.compact(estAtSL.pnl)} (${estAtSL.pct.toFixed(2)}%)` : "—";
      const estTPTxt = estAtTP ? `${Fmt.compact(estAtTP.pnl)} (${estAtTP.pct.toFixed(2)}%)` : "—";

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
          <div class="stat"><span class="stat-label">r:r</span><span class="stat-value">${rrTxt}</span></div>
          <div class="stat"><span class="stat-label">@SL</span><span class="stat-value">${estSLTxt}</span></div>
          <div class="stat"><span class="stat-label">@TP</span><span class="stat-value">${estTPTxt}</span></div>
          <div class="stat"><span class="stat-label">Realized</span><span class="stat-value">${Fmt.compact(r.RealizedPnL)} (${(Number(r.RealizedPnLPct||0)).toFixed(2)}%)</span></div>
     
        </div>

        <div class="trade-card-actions">
          <button class="btn btn-small" data-act="entry">➕ Add Entry</button>
          <button class="btn btn-small" data-act="exit">➖ Add Exit</button>
          <div class="spacer"></div>
          <button class="btn btn-small" data-act="close">✅ Close</button>
          <button class="btn btn-small btn-danger" data-act="delete">🗑️ Delete</button>
        </div>

        <!-- ENTRY form: qty, price, total -->
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

        <!-- EXIT form: qty (prefilled open), optional Target and SL → creates pending exits -->
        <div class="inline-form hidden" data-form="exit">
          <div class="row">
            <label class="lbl">Qty</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="qty-exit" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="qty-exit" placeholder="${r.OpenQty}" value="${r.OpenQty}">
              <button type="button" class="btn-step" data-step="qty-exit" data-dir="up">+</button>
            </div>
          </div>
          <div class="row">
            <label class="lbl">Target</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="tp-exit" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="tp-exit" placeholder="${r.PositionTP || ''}">
              <button type="button" class="btn-step" data-step="tp-exit" data-dir="up">+</button>
            </div>
          </div>
          <div class="row">
            <label class="lbl">SL</label>
            <div class="number-group">
              <button type="button" class="btn-step" data-step="sl-exit" data-dir="down">−</button>
              <input class="input" type="number" inputmode="decimal" data-input="sl-exit" placeholder="${r.PositionSL || ''}">
              <button type="button" class="btn-step" data-step="sl-exit" data-dir="up">+</button>
            </div>
          </div>
          <div class="row">
            <button class="btn btn-primary" data-submit="exit">Add Pending Exit(s)</button>
          </div>
          <div class="hint">We’ll create a pending exit for Target (if given) and another for SL (if given).</div>
        </div>

        <!-- Orders lists -->
        ${(r.Orders && r.Orders.length) ? `
          <div class="orders-block">
            <div class="orders-title">Pending Orders</div>
            <div class="orders-grid">
              ${r.Orders
                .filter(o => String(o.LegStatus)==="InOrder")
                .map(o => `
                <div class="order-card">
                  <div class="head">
                    <span class="badge ${o.IsExit ? 'exit' : 'entry'}">${o.IsExit ? 'Exit' : 'Entry'}</span>
                    ${o.ExitType ? `<span class="badge ${o.ExitType==='TP' ? 'tp' : 'sl'}">${o.ExitType}</span>` : ``}
                    <span class="status pending">Pending</span>
                  </div>
                  <div class="meta">
                    <span>Qty: <b>${o.Qty}</b></span>
                    <span>@ <b>${Fmt.compact(o.Price)}</b></span>
                    <span>${Fmt.dateTime(o.Timestamp)}</span>
                  </div>
                  <div class="actions">
                    ${o.IsExit ? `<button class="icon-btn" title="Execute" data-exec="${o.LegID}">▶️</button>` : ``}
                    <button class="icon-btn cancel" title="Cancel" data-cancel="${o.LegID}">✖</button>
                  </div>
                </div>
              `).join('') || `<div class="empty">No pending orders.</div>`}
            </div>
          </div>

          <div class="orders-block">
            <div class="orders-title">Completed Orders</div>
            <div class="orders-grid">
              ${r.Orders
                .filter(o => String(o.LegStatus)==="Executed")
                .sort((a,b)=> new Date(b.ExecTimestamp||b.Timestamp) - new Date(a.ExecTimestamp||a.Timestamp))
                .map(o => `
                <div class="order-card">
                  <div class="head">
                    <span class="badge ${o.IsExit ? 'exit' : 'entry'}">${o.IsExit ? 'Exit' : 'Entry'}</span>
                    ${o.ExitType ? `<span class="badge ${o.ExitType==='TP' ? 'tp' : 'sl'}">${o.ExitType}</span>` : ``}
                    <span class="status executed">Executed</span>
                  </div>
                  <div class="meta">
                    <span>Qty: <b>${o.Qty}</b></span>
                    <span>@ <b>${Fmt.compact(o.Price)}</b></span>
                    <span>${Fmt.dateTime(o.ExecTimestamp || o.Timestamp)}</span>
                    ${o.IsExit ? `<span>Realized: <b>${Fmt.compact(o.RealizedPnl || 0)} (${(Number(o.RealizedPnlPct||0)).toFixed(2)}%)</b></span>` : ``}
                  </div>
                  <div class="actions">
                    <!-- no actions for executed -->
                  </div>
                </div>
              `).join('') || `<div class="empty">No completed orders.</div>`}
            </div>
          </div>
        ` : ``}


      `;

      // wire buttons
      const btnEntry = card.querySelector("[data-act='entry']");
      const btnExit  = card.querySelector("[data-act='exit']");
      const btnClose = card.querySelector("[data-act='close']");
      const btnDel   = card.querySelector("[data-act='delete']");
      const formEntry= card.querySelector("[data-form='entry']");
      const formExit = card.querySelector("[data-form='exit']");
      
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
      btnDel.addEventListener("click", async () => {
        if (!confirm("Delete this position and all its legs? This cannot be undone.")) return;
        await API.deletePosition(r.PositionID);
        await refresh();
      });


      // steppers
      card.querySelectorAll(".btn-step").forEach(btn => {
        btn.addEventListener("click", () => {
          const dir = btn.dataset.dir === "up" ? 1 : -1;
          const key = btn.dataset.step;
          const input = card.querySelector(`[data-input='${key}']`);
          if (input) input.value = stepByLastDigit(input.value, dir);

          // Only do Qty <-> Total linking for ENTRY fields
          if (key.includes("entry")) {
            const qEl = card.querySelector(`[data-input='qty-entry']`);
            const pEl = card.querySelector(`[data-input='price-entry']`);
            const tEl = card.querySelector(`[data-input='total-entry']`);
            if (qEl && pEl && tEl) {
              const price = Number(pEl.value || 0);
              if (price > 0) {
                if (input === qEl) tEl.value = (Number(qEl.value||0) * price).toString();
                if (input === tEl) qEl.value = (Number(tEl.value||0) / price).toString();
              }
            }
          }

        });
      });

      if (Number(r.OpenQty || 0) > 0) {
        btnClose.disabled = true;
        btnClose.title = "Execute exits until Open = 0 to close.";
      }      

      // two-way link on typing
      function link(qKey, pKey, tKey){
        const qEl = card.querySelector(`[data-input='${qKey}']`);
        const pEl = card.querySelector(`[data-input='${pKey}']`);
        const tEl = card.querySelector(`[data-input='${tKey}']`);
      
        // If any field is missing (e.g. exit form), do nothing
        if (!qEl || !pEl || !tEl) return;
      
        function recompute(from){
          const price = Number(pEl.value || 0);
          if (!price) return;
          if (from==="qty")   tEl.value = (Number(qEl.value||0)*price).toString();
          if (from==="total") qEl.value = (Number(tEl.value||0)/price).toString();
        }
        qEl.addEventListener("input", () => recompute("qty"));
        tEl.addEventListener("input", () => recompute("total"));
        pEl.addEventListener("input", () => recompute("qty"));
      }
      
      link("qty-entry","price-entry","total-entry");

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
      

      // submit exit (supports executed OR pending)
      formExit.querySelector("[data-submit='exit']").addEventListener("click", async () => {
        const q  = formExit.querySelector("[data-input='qty-exit']").value;
        const tp = formExit.querySelector("[data-input='tp-exit']").value;
        const sl = formExit.querySelector("[data-input='sl-exit']").value;
        const qty = Number(q||0);
        if (!qty) return alert("Enter Qty");
      
        // 👉 add this line:
        const ocoId = `OCO-${r.PositionID}-${Date.now()}`;
      
        const tasks = [];
        if (Number(tp)) {
          tasks.push(API.addLeg({
            positionId: r.PositionID,
            legType: "Exit",
            qty: q,
            price: tp,
            total: String(qty * Number(tp)),
            exitType: "TP",
            status: "InOrder",
            // 👉 add this:
            ocoGroupId: ocoId
          }));
        }
        if (Number(sl)) {
          tasks.push(API.addLeg({
            positionId: r.PositionID,
            legType: "Exit",
            qty: q,
            price: sl,
            total: String(qty * Number(sl)),
            exitType: "SL",
            status: "InOrder",
            // 👉 add this:
            ocoGroupId: ocoId
          }));
        }
        if (!tasks.length) return alert("Provide Target and/or SL price.");
        await Promise.all(tasks);
        await refresh();
      });
      
      

      // Orders: execute / cancel
      card.querySelectorAll("[data-exec]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const legId = btn.getAttribute("data-exec");
          try { await API.executeLeg(legId); await refresh(); }
          catch (e) { alert(e.message || "Failed to execute"); }
        });
      });
      card.querySelectorAll("[data-cancel]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const legId = btn.getAttribute("data-cancel");
          try { await API.cancelLeg(legId); await refresh(); }
          catch (e) { alert(e.message || "Failed to cancel"); }
        });
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
