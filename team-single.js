const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

const teams = ["AMC", "BIS", "BOS", "CAR", "FRE", "GRE", "HST", "OTT", "PNX", "ZDG"];
const teamSelector = document.getElementById("teamSelector");

const currentTeam = new URLSearchParams(window.location.search).get("team");

teams.forEach(code => {
  const label = document.createElement("label");
  label.classList.add("radio-wrapper");
  label.innerHTML = `
    <input type="radio" name="team" value="${code}" ${code === currentTeam ? "checked" : ""}>
    <span class="radio-button">${code}</span>
  `;
  label.querySelector("input").addEventListener("change", () => {
    window.location.href = `team-single.html?team=${code}`;
  });
  teamSelector.appendChild(label);
});

const urlParams = new URLSearchParams(window.location.search);
const teamCode = urlParams.get("team");

if (!teamCode) {
  // Don't alert — just stop further processing
  document.getElementById("teamName").textContent = "Select a Team";
} else {
  document.getElementById("teamName").textContent = teamCode;

  Promise.all([
    fetch(`${API_URL}?action=getClosedTrades`).then(res => res.json()),
    fetch(`${API_URL}?action=getQueueStatus`).then(res => res.json())
  ]).then(([closedData, queueData]) => {
    const trades = closedData.trades.filter(t => t.Team === teamCode);

    let totalTrades = trades.length;
    let wins = 0, losses = 0, pnl = 0;

    trades.forEach(t => {
      const tradePnL = parseFloat(t.PnL);
      pnl += tradePnL;
      if (tradePnL > 0) wins++;
      else if (tradePnL < 0) losses++;
    });

    const winRate = totalTrades ? ((wins / totalTrades) * 100).toFixed(2) : "0.00";

    document.getElementById("teamPnL").textContent = pnl.toFixed(2);
    document.getElementById("teamTrades").textContent = totalTrades;
    document.getElementById("teamWins").textContent = wins;
    document.getElementById("teamLosses").textContent = losses;
    document.getElementById("teamWinRate").textContent = winRate;

    const playerStats = {};
    closedData.trades.forEach(t => {
      if (t.Team !== teamCode) return;
      const id = t.PlayerID;
      const pnl = parseFloat(t.PnL);
      const win = pnl > 0;

      if (!playerStats[id]) {
        playerStats[id] = {
          PlayerID: id,
          PlayerName: t.Player,
          PnL: 0,
          Trades: 0,
          Wins: 0
        };
      }

      playerStats[id].PnL += pnl;
      playerStats[id].Trades++;
      if (win) playerStats[id].Wins++;
    });

    const queueMap = {};
    queueData.queue.forEach(p => {
      queueMap[p.PlayerID] = p;
    });

    const allPlayers = Object.keys(playerStats);
    const sortedPlayers = allPlayers.sort((a, b) => playerStats[b].PnL - playerStats[a].PnL);

    const globalPnL = {};
    closedData.trades.forEach(t => {
      const id = t.PlayerID;
      const pnl = parseFloat(t.PnL);
      if (!globalPnL[id]) globalPnL[id] = 0;
      globalPnL[id] += pnl;
    });
    const globalRanks = Object.keys(globalPnL).sort((a, b) => globalPnL[b] - globalPnL[a]);

    const container = document.getElementById("playersList");

    const maxPnL = Math.max(...sortedPlayers.map(pid => playerStats[pid].PnL));

    
    sortedPlayers.forEach(playerId => {
      const stats = playerStats[playerId];
      const wallet = queueMap[playerId]?.WalletBalance ?? "-";
      const rank = globalRanks.indexOf(playerId) + 1;
      const winRate = stats.Trades ? ((stats.Wins / stats.Trades) * 100).toFixed(2) : "0.00";

      const div = document.createElement("div");
      div.className = "player-card";
      div.style = "border: 1px solid #ccc; padding: 0.75rem; margin-bottom: 0.5rem; border-radius: 8px;";
      const barWidth = Math.max(0, (stats.PnL / maxPnL) * 100);
const barColor = stats.PnL >= 0 ? 'green' : 'crimson';
      div.innerHTML = `
        <strong><a href="player-single.html?id=${playerId}">${stats.PlayerName}</a></strong><br>
        Rank: ${rank} | Win %: ${winRate}%<br>
        Wallet: ₹${wallet} | Net PnL: ₹${stats.PnL.toFixed(2)}
        <div class="bar-bg">
          <div class="bar-fill" style="width: ${Math.max(0, (stats.PnL / maxPnL) * 100)}%"></div>
        </div>
      `;
      container.appendChild(div);
    });
  }).catch(err => {
    console.error("Failed to load team data:", err);
    alert("Could not load team profile.");
  });
}
