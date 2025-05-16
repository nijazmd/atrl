const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";


const urlParams = new URLSearchParams(window.location.search);
const teamCode = urlParams.get("team");

if (!teamCode) {
  alert("No team specified.");
} else {
  document.getElementById("teamName").textContent = teamCode;

  Promise.all([
    fetch(`${API_URL}?action=getClosedTrades`).then(res => res.json()),
    fetch(`${API_URL}?action=getQueueStatus`).then(res => res.json())
  ]).then(([closedData, queueData]) => {
    const trades = closedData.trades.filter(t => t.Team === teamCode);

    // Team level stats
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

    // Player stats
    const playerStats = {};
    closedData.trades.forEach(t => {
      if (t.Team !== teamCode) return;
      const id = t.PlayerID;
      const pnl = parseFloat(t.PnL);
      const win = pnl > 0;

      if (!playerStats[id]) {
        playerStats[id] = {
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

    // Calculate global ranks
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
      div.innerHTML = `
  <strong><a href="player-single.html?id=${stats.PlayerID}">${stats.PlayerName}</a></strong><br>
  Rank: ${rank} | Win %: ${winRate}%<br>
  Wallet: ₹${wallet} | Net PnL: ₹${stats.PnL.toFixed(2)}
  <div style="background: lightgray; height: 6px; margin-top: 6px; border-radius: 4px;">
    <div style="background: green; width: ${Math.max(0, (stats.PnL / maxPnL) * 100)}%; height: 100%; border-radius: 4px;"></div>
  </div>
`;

      container.appendChild(div);
    });
  })
  .catch(err => {
    console.error("Failed to load team data:", err);
    alert("Could not load team profile.");
  });
}

