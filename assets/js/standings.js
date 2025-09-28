(async function StandingsPage(){
  const leagueChips = document.getElementById("league-chips");
  const modeChips   = document.getElementById("mode-chips");
  const teamsTBody  = document.querySelector("#teams-table tbody");
  const playersTBody= document.querySelector("#players-table tbody");
  const scopeChips = document.getElementById("scope-chips");
  let scope = "league"; // or "master"
  
  // Load config & lookups
  const config = await API.getConfig();
  AppState.setConfig(config);
  const lookups = await API.getLookups();
  AppState.setLookups(lookups);
  AppState.initSelectedLeagues();

  // League chips (multi-select)
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
  // scope chips
  scopeChips.innerHTML = "";
  ["league","master"].forEach(sc => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (sc===scope ? " chip--selected" : "");
    b.textContent = sc === "league" ? "By Lg" : "Master";
    b.addEventListener("click", async () => {
      scope = sc;
      Array.from(scopeChips.children).forEach(x => x.classList.remove("chip--selected"));
      b.classList.add("chip--selected");
      await refresh();
    });
    scopeChips.appendChild(b);
  });

  // Mode chips (League vs Master)
  modeChips.addEventListener("click", async (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    modeChips.querySelectorAll(".chip").forEach(x=>x.classList.remove("chip--selected"));
    b.classList.add("chip--selected");
    await refresh();
  });

  function currentScope() {
    return modeChips.querySelector(".chip--selected")?.dataset.scope || "league";
  }

  async function refresh() {
    const scope = currentScope();
    const leagueIds = AppState.leagues
      .filter(l => AppState.selectedLeagues.includes(l.LeagueName))
      .map(l => l.LeagueID);

      const data = await API.getStandings(currentLeagueIds(), scope);

    // Teams
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

    // Players
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

  await refresh();
})();
