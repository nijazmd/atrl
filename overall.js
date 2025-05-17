const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

fetch(`${API_URL}?action=getClosedTrades`)
  .then(res => res.json())
  .then(data => {
    const trades = data.trades;

    let totalPnL = 0, totalTrades = 0, wins = 0, losses = 0;
    let longCount = 0, longWins = 0;
    let shortCount = 0, shortWins = 0;

    trades.forEach(t => {
      const tradePnL = parseFloat(t.PnL);
      if (isNaN(tradePnL)) return;

      totalPnL += tradePnL;
      totalTrades++;

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

    const container = document.getElementById("overallStats");

    container.innerHTML = `
      <div class="card-grid">
        <div class="card">Total PnL: ₹<span>${totalPnL.toFixed(2)}</span></div>
        <div class="card">Total Trades: <span>${totalTrades}</span></div>
        <div class="card">Wins: <span>${wins}</span></div>
        <div class="card">Losses: <span>${losses}</span></div>
        <div class="card">Win %: <span>${winRate}%</span></div>
        <div class="card">Long Trades: <span>${longCount}</span></div>
        <div class="card">Long Win %: <span>${longWinRate}%</span></div>
        <div class="card">Short Trades: <span>${shortCount}</span></div>
        <div class="card">Short Win %: <span>${shortWinRate}%</span></div>
      </div>
    `;
  })
  .catch(err => {
    console.error("Failed to load overall stats:", err);
    alert("Could not load overall stats.");
  });
