const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get("id");

if (!playerId) {
  alert("No player selected.");
} else {
  fetch(`${API_URL}?action=getPlayerInfo&id=${playerId}`)
    .then(res => res.json())
    .then(data => {
      if (!data || !data.Trades) {
        alert("Player data not found.");
        return;
      }

      const trades = data.Trades;
      document.getElementById("playerName").textContent = data.PlayerName;
      document.getElementById("teamName").textContent = data.Team;
      document.getElementById("walletBalance").textContent = data.WalletBalance.toFixed(2);

      let totalTrades = trades.length;
      let wins = 0, losses = 0, pnl = 0;
      let longWins = 0, shortWins = 0, longCount = 0, shortCount = 0;

      trades.forEach(t => {
        const tradePnL = parseFloat(t.PnL);
        pnl += tradePnL;

        if (tradePnL > 0) wins++;
        else if (tradePnL < 0) losses++;

        if (t.PositionType === "Long") {
          longCount++;
          if (tradePnL > 0) longWins++;
        } else if (t.PositionType === "Short") {
          shortCount++;
          if (tradePnL > 0) shortWins++;
        }
      });

      const winRate = totalTrades ? ((wins / totalTrades) * 100).toFixed(2) : "0.00";
      const longWinRate = longCount ? ((longWins / longCount) * 100).toFixed(2) : "0.00";
      const shortWinRate = shortCount ? ((shortWins / shortCount) * 100).toFixed(2) : "0.00";

      document.getElementById("totalTrades").textContent = totalTrades;
      document.getElementById("wins").textContent = wins;
      document.getElementById("losses").textContent = losses;
      document.getElementById("winRate").textContent = winRate;
      document.getElementById("longCount").textContent = longCount;
      document.getElementById("shortCount").textContent = shortCount;
      document.getElementById("longWinRate").textContent = longWinRate;
      document.getElementById("shortWinRate").textContent = shortWinRate;
      document.getElementById("totalPnL").textContent = pnl.toFixed(2);

      // Fetch all player PnLs for rank
      fetch(`${API_URL}?action=getClosedTrades`)
        .then(res => res.json())
        .then(allData => {
          const playerStats = {};
          allData.trades.forEach(t => {
            const id = t.PlayerID;
            const pnl = parseFloat(t.PnL);
            if (!playerStats[id]) playerStats[id] = 0;
            playerStats[id] += pnl;
          });

          const sortedIds = Object.keys(playerStats).sort((a, b) => playerStats[b] - playerStats[a]);
          const rank = sortedIds.indexOf(playerId) + 1;
          document.getElementById("rank").textContent = rank;
        });
    })
    .catch(err => {
      console.error("Failed to load player info:", err);
      alert("Could not load player profile.");
    });
}
