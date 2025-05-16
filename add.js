const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

const playerList = document.getElementById("playerList");
const playerInfo = document.getElementById("playerInfo");
const queueDisplay = document.getElementById("queueNumberDisplay");
const walletDisplay = document.getElementById("walletDisplay");
const estimatedTotal = document.getElementById("estimatedTotal");

const roundInput = document.getElementById("roundNumber");
const qtyInput = document.getElementById("qtyInput");
const entryPriceInput = document.getElementById("entryPriceInput");

let selectedPlayerData = null;

let playerDataList = []; // store full queue info for later use


// Load latest round and next 5 players
fetch(`${SCRIPT_URL}?action=getQueueStatus`)
  .then(res => res.json())
  .then(data => {
    roundInput.value = data.round;

    playerDataList = data.queue;

    // Add radio buttons for players
    data.queue.forEach(player => {
      const label = document.createElement("label");
      label.innerHTML = `
        <input type="radio" name="Player" value="${player.PlayerID}">
        ${player.QueueNumber}. ${player.PlayerName} (${player.Team})
      `;
      playerList.appendChild(label);
      playerList.appendChild(document.createElement("br"));
    });

    // Handle player selection
    document.querySelectorAll("input[name='Player']").forEach(radio => {
      radio.addEventListener("change", function () {
        const selected = playerDataList.find(p => String(p.PlayerID) === this.value);
        if (selected) {
          selectedPlayerData = selected;
          queueDisplay.textContent = selected.QueueNumber;
          walletDisplay.textContent = selected.WalletBalance.toFixed(2);
          document.getElementById("walletBottomDisplay").textContent = selected.WalletBalance.toFixed(2);
          playerInfo.style.display = "block";
          document.getElementById("walletSummary").style.display = "block";
        }
      });
      
    });
  })
  .catch(err => {
    console.error("Error fetching queue status:", err);
    alert("Failed to load player queue.");
  });

// Live update of estimated trade total
function updateEstimatedTotal() {
  const qty = parseFloat(qtyInput.value) || 0;
  const price = parseFloat(entryPriceInput.value) || 0;
  estimatedTotal.textContent = (qty * price).toFixed(2);
}

qtyInput.addEventListener("input", updateEstimatedTotal);
entryPriceInput.addEventListener("input", updateEstimatedTotal);

// Submit trade
document.getElementById("tradeForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const selectedRadio = document.querySelector("input[name='Player']:checked");
  if (!selectedRadio) {
    alert("Please select a player.");
    return;
  }

  const selectedPlayerID = selectedRadio.value;
  const playerData = playerDataList.find(p => String(p.PlayerID) === String(selectedPlayerID));

  if (!playerData) {
    alert("Player data not found.");
    return;
  }

  const formData = new FormData(e.target);
  formData.set("Player", playerData.PlayerName); // human readable
  formData.set("PlayerID", playerData.PlayerID); // for internal matching
  formData.set("Team", playerData.Team);
  formData.set("QueueNumber", playerData.QueueNumber);

  fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(formData)
  })
    .then(() => {
      alert("Trade submitted successfully!");
      location.reload();
    })
    .catch(error => {
      console.error("Submit error:", error);
      alert("There was an error submitting the trade.");
    });
});
