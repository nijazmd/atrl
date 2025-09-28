// /assets/js/scrips.js
(async function ScripsPage(){
  const leagueChips = document.getElementById("league-chips");
  const searchInput = document.getElementById("scrip-search");
  const tbody = document.querySelector("#scrips-table tbody");
  const emptyMsg = document.getElementById("scrips-empty");

  // state
  let rawRows = [];
  let sortKey = "PnLPct"; // default sort by PnL%
  let sortDir = -1;       // desc

  // Load config & lookups
  const config = await API.getConfig();
  AppState.setConfig(config);
  const lookups = await API.getLookups();
  AppState.setLookups(lookups);
  AppState.initSelectedLeagues();

  // League chips
  (AppState.leagues || []).forEach(l => {
    if (l.IsActive !== true && String(l.IsActive).toLowerCase() !== "true") return;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (AppState.selectedLeagues.includes(l.LeagueName) ? " chip--selected" : "");
    chip.textContent = l.LeagueName;
    chip.dataset.leagueId = l.LeagueID;
    chip.addEventListener("click", async () => {
      chip.classList.toggle("chip--selected");
      AppState.selectedLeagues = Array.from(leagueChips.querySelectorAll(".chip--selected")).map(x => x.textContent);
      await loadData();
      render();
    });
    leagueChips.appendChild(chip);
  });

  // Sorting handlers
  document.getElementById("th-pnl")?.addEventListener("click", () => {
    if (sortKey === "PnL") sortDir = -sortDir; else { sortKey = "PnL"; sortDir = -1; }
    render();
  });
  document.getElementById("th-pnlpct")?.addEventListener("click", () => {
    if (sortKey === "PnLPct") sortDir = -sortDir; else { sortKey = "PnLPct"; sortDir = -1; }
    render();
  });

  // Search
  searchInput.addEventListener("input", render);

  async function loadData() {
    const leagueIds = AppState.leagues
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);
    const data = await API.getScripsStats(leagueIds);
    rawRows = data.scrips || [];
  }

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    let rows = rawRows.filter(r => !q || String(r.ScripName).toLowerCase().includes(q));

    rows.sort((a,b) => {
      const av = Number(a[sortKey] || 0), bv = Number(b[sortKey] || 0);
      return sortDir * (av - bv);
    }).reverse(); // to handle both dir toggles consistently

    tbody.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.RankByPnLPct}</td>
        <td><a href="scrip.html?id=${encodeURIComponent(r.ScripID)}">${r.ScripName}</a></td>
        <td>${r.TT}</td>
        <td>${(r.WinPct||0).toFixed(1)}%</td>
        <td>${(r.LongWinPct||0).toFixed(1)}%</td>
        <td>${(r.ShortWinPct||0).toFixed(1)}%</td>
        <td>${Fmt.compact(r.PnL)}</td>
        <td>${(r.PnLPct||0).toFixed(2)}%</td>
      `;
      tbody.appendChild(tr);
    });

    emptyMsg.style.display = rows.length ? "none" : "block";
  }

  await loadData();
  render();
})();
