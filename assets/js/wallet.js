// /assets/js/wallet.js
(async function WalletPage(){
  const leagueChips = document.getElementById("league-chips");
  const walletCards = document.getElementById("wallet-cards");
  const playersList = document.getElementById("players-list");
  const recentTxns  = document.getElementById("recent-txns");

  const txnForm   = document.getElementById("txn-form");
  const wSel      = document.getElementById("txn-wallet");
  const tType     = document.getElementById("txn-type");
  const tAmt      = document.getElementById("txn-amount");
  const tPlayer   = document.getElementById("txn-player");
  const tTag      = document.getElementById("txn-tag");
  const tNote     = document.getElementById("txn-note");

  // Simple stepper (increment by rightmost digit)
  document.querySelectorAll("[data-step-for='txn-amount']").forEach(btn => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.dir === "up" ? 1 : -1;
      const s = (tAmt.value||"0").toString();
      const dec = (s.split(".")[1] || "").length;
      const step = Math.pow(10, -dec);
      const next = Number(s||0) + dir*step;
      tAmt.value = next.toFixed(dec);
    });
  });

  // Load config & lookups
  const config = await API.getConfig();
  AppState.setConfig(config);
  const lk = await API.getLookups();
  AppState.setLookups(lk);
  AppState.initSelectedLeagues();

  // Fill league chips
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

  // Fill player select (optional)
  tPlayer.innerHTML = `<option value="">— none —</option>`;
  (AppState.players || []).forEach(p => {
    if (p.IsActive !== true && String(p.IsActive).toLowerCase() !== "true") return;
    const opt = document.createElement("option");
    opt.value = p.PlayerID;
    opt.textContent = p.PlayerName;
    tPlayer.appendChild(opt);
  });

  function currentLeagueIds(){
    return AppState.leagues
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);
  }

  async function refresh(){
    const data = await API.getWalletOverview(currentLeagueIds());
    renderWallets(data.wallets || []);
    renderPlayers(data.players || []);
    renderTxns(data.txns || []);
    // also fill wallet select with the wallets shown
    wSel.innerHTML = "";
    (data.wallets || []).forEach(w => {
      const opt = document.createElement("option");
      opt.value = w.WalletID;
      opt.textContent = `${w.WalletName} (${w.Currency})`;
      wSel.appendChild(opt);
    });
  }

  function renderWallets(arr){
    walletCards.innerHTML = "";
    if (!arr.length) {
      walletCards.innerHTML = `<section class="card"><div class="card-body"><div class="empty">No wallets for selected leagues.</div></div></section>`;
      return;
    }
    arr.forEach(w => {
      const card = document.createElement("section");
      card.className = "card";
      const last = Number(w.LastImpact||0);
      const arrow = last > 0 ? "⬆️" : last < 0 ? "⬇️" : "⏸️";

      card.innerHTML = `
        <div class="card-header">
          <h2 class="card-title">${w.WalletName} <span class="muted">(${w.Currency})</span></h2>
        </div>
        <div class="card-body">
          <div class="wallet-hero">
            <div class="wallet-balance">
              <div class="label">Balance</div>
              <div class="value">${Fmt.compact(w.EquityNow)}</div>
              <div class="delta">${arrow} ${Fmt.compact(w.LastImpact)}</div>
            </div>
            <div class="wallet-spark" data-points="${(w.Spark||[]).join(",")}"></div>
          </div>

          <div class="stats-grid">
            <div class="stat"><span class="stat-label">Today</span><span class="stat-value">${Fmt.compact(w.Stats?.Today)}</span></div>
            <div class="stat"><span class="stat-label">Week</span><span class="stat-value">${Fmt.compact(w.Stats?.Week)}</span></div>
            <div class="stat"><span class="stat-label">Month</span><span class="stat-value">${Fmt.compact(w.Stats?.Month)}</span></div>
            <div class="stat"><span class="stat-label">Overall</span><span class="stat-value">${Fmt.compact(w.Stats?.Overall)} (${(Number(w.Stats?.OverallPct||0)).toFixed(2)}%)</span></div>
          </div>
        </div>
      `;
      walletCards.appendChild(card);
    });

    // draw sparklines
    walletCards.querySelectorAll(".wallet-spark").forEach(drawSparkline);
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
    el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <path d="${d}" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>`;
  }

  function renderPlayers(arr){
    playersList.innerHTML = "";
    if (!arr.length) { playersList.innerHTML = `<div class="empty">No players yet.</div>`; return; }
    arr.forEach(p => {
      const row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = `
        <div class="row-main">
          <div class="row-title">${p.PlayerName}</div>
          <div class="row-sub">${p.TeamName || ""}</div>
        </div>
        <div class="row-value">${Fmt.compact(p.Balance)}</div>
      `;
      playersList.appendChild(row);
    });
  }

  function renderTxns(arr){
    recentTxns.innerHTML = "";
    if (!arr.length) { recentTxns.innerHTML = `<div class="empty">No transactions.</div>`; return; }
    arr.forEach(t => {
      const div = document.createElement("div");
      const amt = Number(t.Amount||0);
      const sign = amt>0 ? "➕" : amt<0 ? "➖" : "•";
      div.className = "row-item";
      div.innerHTML = `
        <div class="row-main">
          <div class="row-title">${sign} ${t.Type || ""} ${t.Tag ? "· "+t.Tag : ""}</div>
          <div class="row-sub">${Fmt.dateTime(t.AsOf || t.Timestamp)} ${t.PlayerID? "· "+t.PlayerID : ""}</div>
        </div>
        <div class="row-value">${Fmt.compact(amt)}</div>
      `;
      recentTxns.appendChild(div);
    });
  }

  // submit new wallet txn
  txnForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const payload = {
        walletId: wSel.value,
        type: tType.value,
        amount: tAmt.value,
        playerId: tPlayer.value || "",
        tag: tTag.value || "",
        note: tNote.value || ""
      };
      if (!payload.walletId) throw new Error("Pick a wallet.");
      if (!Number(payload.amount)) throw new Error("Enter amount.");

      await API.addWalletTxn(payload);
      // reset minimal
      tAmt.value = ""; tTag.value = ""; tNote.value = "";
      await refresh();
      alert("Saved.");
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  await refresh();
})();
