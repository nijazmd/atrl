const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

const scripListContainer = document.getElementById("scripRadioContainer");
const tableBody = document.querySelector("#scripTradeTable tbody");

const totalTradesEl = document.getElementById("totalTrades");
const winsEl = document.getElementById("wins");
const lossesEl = document.getElementById("losses");
const winRateEl = document.getElementById("winRate");
const longTradesEl = document.getElementById("longTrades");
const shortTradesEl = document.getElementById("shortTrades");
const longWinRateEl = document.getElementById("longWinRate");
const shortWinRateEl = document.getElementById("shortWinRate");

const urlParams = new URLSearchParams(window.location.search);
const preselectedScrip = urlParams.get("s");


let allTrades = [];
let allScrips = new Set();

// Load and build UI
fetch(API_URL + "?action=getClosedTrades")
  .then(res => res.json())
  .then(data => {
    allTrades = data.trades;

    allTrades.forEach(trade => {
      if (trade.Scrip) allScrips.add(trade.Scrip);
    });

    [...allScrips].sort().forEach(scrip => {
      const label = document.createElement("label");
      label.className = "radio-wrapper";
      label.innerHTML = `
        <input type="radio" name="scrip" value="${scrip}">
        <span class="radio-button">${scrip}</span>
      `;
      scripListContainer.appendChild(label);
    });

    document.querySelectorAll("input[name='scrip']").forEach(radio => {
      radio.addEventListener("change", () => {
        renderScripDetails(radio.value);
      });
    });

    if (preselectedScrip) {
  const targetRadio = document.querySelector(`input[name='scrip'][value='${preselectedScrip}']`);
  if (targetRadio) {
    targetRadio.checked = true;
    renderScripDetails(preselectedScrip);
    targetRadio.scrollIntoView({ behavior: "smooth", inline: "center" });
  }
}

  });

function renderScripDetails(scrip) {
  const trades = allTrades.filter(t => t.Scrip === scrip);

  let wins = 0, losses = 0;
  let longWins = 0, shortWins = 0;
  let longTrades = 0, shortTrades = 0;
  let totalPnL = 0;
  let longPnL = 0, shortPnL = 0;
  let longEntry = 0, shortEntry = 0;

  trades.forEach(t => {
    const pnl = parseFloat(t.PnL) || 0;
    const type = t.PositionType;
    const qty = parseFloat(t.Qty) || 0;
    const entry = parseFloat(t.EntryPrice) || 0;
    const entryValue = parseFloat(t.EntryValue) || (qty * entry);

    totalPnL += pnl;

    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;

    if (type === "Long") {
      longTrades++;
      longPnL += pnl;
      longEntry += entryValue;
      if (pnl > 0) longWins++;
    } else if (type === "Short") {
      shortTrades++;
      shortPnL += pnl;
      shortEntry += entryValue;
      if (pnl > 0) shortWins++;
    }
  });

  const total = trades.length;
  const winRate = total ? ((wins / total) * 100).toFixed(2) : "0.00";
  const longWinRate = longTrades ? ((longWins / longTrades) * 100).toFixed(2) : "0.00";
  const shortWinRate = shortTrades ? ((shortWins / shortTrades) * 100).toFixed(2) : "0.00";
  const longPnLPercent = longEntry ? ((longPnL / longEntry) * 100).toFixed(2) : "0.00";
  const shortPnLPercent = shortEntry ? ((shortPnL / shortEntry) * 100).toFixed(2) : "0.00";

  totalTradesEl.textContent = total;
  winsEl.textContent = wins;
  lossesEl.textContent = losses;
  winRateEl.textContent = winRate;
  longTradesEl.innerHTML = `${longTrades} <span class="labelspan">w%</span><span style="color:lightgreen;">${longWinRate}</span> <span class="labelspan"> PnL<span style="color:skyblue;">${longPnLPercent}</span>`;
  shortTradesEl.innerHTML = `${shortTrades}<span class="labelspan">w%</span><span style="color:orange;">${shortWinRate}</span> <span class="labelspan"> PnL<span style="color:skyblue;">${shortPnLPercent}</span>`;

  // Show total PnL somewhere (e.g., below win% row)
  let pnlSummary = document.getElementById("scripPnLSummary");
  if (!pnlSummary) {
    pnlSummary = document.createElement("div");
    pnlSummary.id = "scripPnLSummary";
    document.querySelector(".card-grid")?.appendChild(pnlSummary);
  }
  pnlSummary.innerHTML = `<div class="card">PnL<span>${totalPnL.toFixed(2)}</span></div><br>`;

  // Fill table
  tableBody.innerHTML = "";
  trades.sort((a, b) => parseInt(b.RoundNumber) - parseInt(a.RoundNumber)).forEach(t => {
    const qty = parseFloat(t.Qty) || 0;
    const entry = parseFloat(t.EntryPrice) || 0;
    const exit = parseFloat(t.ExitPrice) || 0;
    const pnl = parseFloat(t.PnL) || 0;
    const entryTotal = parseFloat(t.EntryValue) || (qty * entry);
    const exitTotal = parseFloat(t.ExitValue) || (qty * exit);
    const pnlPercent = parseFloat(t.PnLPercent) || (entryTotal ? (pnl / entryTotal) * 100 : 0);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${pnlPercent.toFixed(2)}%</td>
      <td style="color: ${pnl > 0 ? 'lightgreen' : pnl < 0 ? 'salmon' : 'white'};">${pnl.toFixed(2)}</td>
      <td>${t.RoundNumber}</td>
      <td>${t.Player}</td>
      <td>${t.Team}</td>
      <td>${t.PositionType}</td>
      <td>${qty}</td>
      <td>${entry.toFixed(2)}</td>
      <td>${exit.toFixed(2)}</td>
      <td>₹${parseFloat(t.WalletBalanceAfterTrade || 0).toFixed(2)}</td>
    `;
    tableBody.appendChild(row);
  });
}
