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

      const tbody = document.querySelector("#tradeHistoryTable tbody");
trades.forEach(t => {
  const row = document.createElement("tr");

const qty = parseFloat(t.Qty) || 0;
const entry = parseFloat(t.EntryPrice) || 0;
const exit = parseFloat(t.ExitPrice) || 0;
const pnl = parseFloat(t.PnL) || 0;
const entryTotal = parseFloat(t.EntryValue) || (qty * entry);
const exitTotal = parseFloat(t.ExitValue) || (qty * exit);
const pnlPercent = parseFloat(t.PnLPercent) || (entryTotal ? ((pnl / entryTotal) * 100) : 0);

  row.innerHTML = `
  <td>${t.RoundNumber}</td>
  <td>${pnlPercent.toFixed(2)}%</td>
  <td>₹${pnl.toFixed(2)}</td>
  <td><a href="scrip.html?s=${t.Scrip}">${t.Scrip}</a></td>
  <td>${t.PositionType}</td>
  <td>${qty}</td>
  <td>${entry.toFixed(2)}</td>
  <td>₹${entryTotal.toFixed(2)}</td>
  <td>${exit.toFixed(2)}</td>
  <td>₹${exitTotal.toFixed(2)}</td>
  <td>₹${parseFloat(t.WalletBalanceAfterTrade || 0).toFixed(2)}</td>
`;

if (pnl > 0) {
  row.style.backgroundColor = "#163c2f"; // green-ish
} else if (pnl < 0) {
  row.style.backgroundColor = "#3b1e1e"; // red-ish
} else {
  row.style.backgroundColor = "#2c2c2c"; // neutral gray
}

  tbody.appendChild(row);
});


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

function sortTable(colIndex) {
  const table = document.getElementById("tradeHistoryTable");
  const tbody = table.querySelector("tbody");
  const rows = Array.from(tbody.rows);

  const isNumeric = !isNaN(parseFloat(rows[0].cells[colIndex].innerText.replace(/[₹,%]/g, '')));
  const sorted = rows.sort((a, b) => {
    const aText = a.cells[colIndex].innerText.replace(/[₹,%]/g, '');
    const bText = b.cells[colIndex].innerText.replace(/[₹,%]/g, '');

    const aVal = isNumeric ? parseFloat(aText) : aText;
    const bVal = isNumeric ? parseFloat(bText) : bText;

    return aVal > bVal ? -1 : 1; // descending
  });

  rows.forEach(row => tbody.appendChild(row));
}
