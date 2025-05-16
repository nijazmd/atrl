const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

fetch(API_URL + "?action=getTrades")
  .then(response => response.json())
  .then(data => {
    const container = document.getElementById("activeTrades");
    container.innerHTML = ""; // clear previous content

    data.trades.forEach(trade => {
      const tradeDiv = document.createElement("div");
      tradeDiv.className = "trade-card";
      tradeDiv.style = `
        border: 1px solid #ccc;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 1rem;
      `;

      const total = (parseFloat(trade.Qty) * parseFloat(trade.EntryPrice)).toFixed(2);
      const color = trade.PositionType === 'Long' ? 'green' : 'red';

      tradeDiv.innerHTML = `
        <p><strong>${trade.Team} - ${trade.Player}</strong></p>
        <p><strong>Scrip:</strong> ${trade.Scrip}</p>
        <p><strong>Type:</strong> <span style="color: ${color};">${trade.PositionType}</span></p>
        <p><strong>Qty:</strong> ${trade.Qty} × ₹${trade.EntryPrice} = ₹${total}</p>
        <input type="number" placeholder="Exit Price" step="0.01" class="exit-price-input" />
        <button onclick="closeTrade('${trade.TradeID}', this)">Close Trade</button>
      `;

      container.appendChild(tradeDiv);
    });
  })
  .catch(error => {
    console.error("Failed to load active trades:", error);
  });

function closeTrade(tradeId, button) {
  const exitInput = button.previousElementSibling;
  const exitPrice = parseFloat(exitInput.value);

  if (isNaN(exitPrice)) {
    alert("Please enter a valid exit price.");
    return;
  }

  if (!confirm(`Close trade at ₹${exitPrice}?`)) return;

  fetch(API_URL, {
    method: "POST",
    body: new URLSearchParams({
      action: "closeTrade",
      TradeID: tradeId,
      ExitPrice: exitPrice
    })
  })
    .then(res => res.text())
    .then(response => {
      alert(response);
      location.reload(); // Refresh the list after closing
    })
    .catch(error => {
      console.error("Error closing trade:", error);
      alert("Failed to close trade.");
    });
}
