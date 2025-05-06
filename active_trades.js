const API_URL = "https://script.google.com/macros/s/AKfycbyTfKUqTt1bN3WFRyQlWWMh7tAX4af0qasvb2bhoNoJ98eImhqP0IPyMojneD7dL0nIjw/exec";

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

      tradeDiv.innerHTML = `
        <p><strong>Team:</strong> ${trade.Team}</p>
        <p><strong>Player:</strong> ${trade.Player}</p>
        <p><strong>Scrip:</strong> ${trade.Scrip}</p>
        <p><strong>Position Type:</strong> ${trade.PositionType}</p>
        <p><strong>Qty:</strong> ${trade.Qty}</p>
        <p><strong>Entry Price:</strong> ${trade.EntryPrice}</p>
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
