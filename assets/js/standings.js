// /assets/js/standings.js
(async function StandingsPage(){
  const leagueChips   = document.getElementById("league-chips");
  const modeChips     = document.getElementById("mode-chips");     // we will use this for scope toggles
  const teamsTBody    = document.querySelector("#teams-table tbody");
  const playersTBody  = document.querySelector("#players-table tbody");

  // default scope
  let scope = "league"; // "league" | "master"

  // ---- Load config & lookups
  const config  = await API.getConfig();
  AppState.setConfig(config);
  const lookups = await API.getLookups();
  AppState.setLookups(lookups);
  AppState.initSelectedLeagues();

  // ---- Helpers
  function currentLeagueIds() {
    return (AppState.leagues || [])
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);
  }

  async function refresh() {
    const data = await API.getStandings(currentLeagueIds(), scope);

    // Teams table
    teamsTBody.innerHTML = "";
    (data.teams || []).forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.RankByPnLPct}</td>
        <td><a href="team.html?id=${encodeURIComponent(row.TeamID)}">${row.TeamName}</a></td>
        <td>${row.TT}</td>
        <td>${(row.WinPct||0).toFixed(1)}%</td>
        <td>${Fmt.compact(row.PnL)}</td>
        <td>${(row.PnLPct||0).toFixed(2)}%</td>
      `;
      teamsTBody.appendChild(tr);
    });

    // Players table
    playersTBody.innerHTML = "";
    (data.players || []).forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.RankByPnLPct}</td>
        <td><a href="player.html?id=${encodeURIComponent(row.PlayerID)}">${row.PlayerName}</a></td>
        <td><a href="team.html?id=${encodeURIComponent(row.TeamID)}">${row.TeamName || ""}</a></td>
        <td>${row.TT}</td>
        <td>${(row.WinPct||0).toFixed(1)}%</td>
        <td>${Fmt.compact(row.PnL)}</td>
        <td>${(row.PnLPct||0).toFixed(2)}%</td>
      `;
      playersTBody.appendChild(tr);
    });
  }

  // ---- League chips (multi-select)
  (AppState.leagues || []).forEach(l => {
    if (String(l.IsActive).toLowerCase() !== "true") return;
    const chip = document.createElement("button");
    chip.className = "chip" + (AppState.selectedLeagues.includes(l.LeagueName) ? " chip--selected" : "");
    chip.textContent = l.LeagueName;
    chip.dataset.leagueId = l.LeagueID;
    chip.addEventListener("click", async () => {
      chip.classList.toggle("chip--selected");
      AppState.selectedLeagues = Array.from(leagueChips.querySelectorAll(".chip--selected")).map(x => x.textContent);
      await refresh();
    });
    leagueChips.appendChild(chip);
  });

  // ---- Scope chips ("By Lg" vs "Master") — rendered inside #mode-chips
  function buildScopeChips(){
    modeChips.innerHTML = "";
    ["league","master"].forEach(sc => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (sc===scope ? " chip--selected" : "");
      b.dataset.scope = sc;
      b.textContent = sc === "league" ? "By Lg" : "Master";
      b.addEventListener("click", async () => {
        scope = sc;
        Array.from(modeChips.children).forEach(x => x.classList.remove("chip--selected"));
        b.classList.add("chip--selected");
        await refresh();
      });
      modeChips.appendChild(b);
    });
  }
  buildScopeChips();

  await refresh();
})();
