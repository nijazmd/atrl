// /assets/js/team.js
(async function TeamPage(){
  const leagueChips = document.getElementById("league-chips");
  const rankEl   = document.getElementById("team-rank");
  const titleEl  = document.getElementById("team-title");

  const overallStats = document.getElementById("overall-stats");
  const rrStats      = document.getElementById("rr-stats");
  const leagueStats  = document.getElementById("league-stats");
  const rosterList   = document.getElementById("roster-list");
  const bestScrips   = document.getElementById("best-scrips");
  const tradeCards   = document.getElementById("trade-cards");

  const params = new URLSearchParams(location.search);
  const teamId = params.get("id") || "";

  const cfg = await API.getConfig();
  AppState.setConfig(cfg);
  const lk = await API.getLookups();
  AppState.setLookups(lk);
  AppState.initSelectedLeagues();

  if (!teamId) {
    document.body.innerHTML = "<div class='empty'>Missing team id.</div>";
    return;
  }

  // league chips
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

  function currentLeagueIds(){
    return (AppState.leagues||[])
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);
  }

  async function refresh(){
    const data = await API.getTeamDetail(teamId, currentLeagueIds());
    paintHeader(data.team);
    paintOverview(data.overall, data.rr);
    paintPerLeague(data.perLeague || []);
    paintRoster(data.roster || []);
    paintBestScrips(data.bestScrips || []);
    paintTrades(data.trades || []);
  }

  function paintHeader(t){
    rankEl.textContent = t.CurrentRank ? `#${t.CurrentRank}` : "#—";
    titleEl.textContent = t.TeamName || t.TeamID;
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

  function paintRoster(arr){
    rosterList.innerHTML = "";
    if (!arr.length) { rosterList.innerHTML = `<div class="empty">No players.</div>`; return; }
    arr.forEach(p => {
      const row = document.createElement("a");
      row.href = `player.html?id=${encodeURIComponent(p.PlayerID)}`;
      row.className = "row-item";
      row.innerHTML = `
        <div class="row-main">
          <div class="row-title">${p.PlayerName}</div>
          <div class="row-sub">Risk ${p.RiskTrait || "—"}/5 · TT ${p.TT} · W% ${(p.WinPct||0).toFixed(1)}%</div>
        </div>
        <div class="row-value">${Fmt.compact(p.PnL)} (${(Number(p.PnLPct||0)).toFixed(2)}%)</div>
      `;
      rosterList.appendChild(row);
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
        <div class="trade-card-subtitle">${tr.LeagueName} · ${tr.PlayerName} ${tags? "· "+tags : ""}</div>
        <div class="trade-card-stats">
          <div class="stat"><span class="stat-label">Avg</span><span class="stat-value">${Fmt.compact(tr.avgEntry)}</span></div>
          <div class="stat"><span class="stat-label">Open</span><span class="stat-value">${tr.openQty}</span></div>
          <div class="stat"><span class="stat-label">r:r</span><span class="stat-value">${tr.rr ? tr.rr.toFixed(2) : "—"}</span></div>
          <div class="stat"><span class="stat-label">PnL</span><span class="stat-value">${Fmt.compact(tr.realizedPnl)}</span></div>
          <div class="stat"><span class="stat-label">PnL%</span><span class="stat-value">${(Number(tr.realizedPnlPct||0)).toFixed(2)}%</span></div>
        </div>
      `;
      tradeCards.appendChild(card);
    });
  }

  await refresh();
})();
