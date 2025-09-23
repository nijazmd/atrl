const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

const playerList = document.getElementById("playerList");
const playerInfo = document.getElementById("playerInfo");
const queueDisplay = document.getElementById("queueNumberDisplay");
const walletDisplay = document.getElementById("walletDisplay");
const estimatedTotal = document.getElementById("estimatedTotal");

const roundInput = document.getElementById("roundNumber");
const qtyInput = document.getElementById("qtyInput");
const entryPriceInput = document.getElementById("entryPriceInput");

let playerDataList = [];
let roundCapital = 0;

function updateEstimatedTotal() {
  const qty = parseFloat(qtyInput.value) || 0;
  const price = parseFloat(entryPriceInput.value) || 0;
  estimatedTotal.textContent = (qty * price).toFixed(2);
}
qtyInput.addEventListener("input", updateEstimatedTotal);
entryPriceInput.addEventListener("input", updateEstimatedTotal);

const scripDatalist = document.getElementById("scripList");
fetch(`${SCRIPT_URL}?action=getScripList`)
  .then(r => r.json())
  .then(({ scrips }) => {
    if (!Array.isArray(scrips)) return;
    scripDatalist.innerHTML = "";
    scrips.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      scripDatalist.appendChild(opt);
    });
  })
  .catch(err => console.error("getScripList failed:", err));


// Load queue + cap
fetch(`${SCRIPT_URL}?action=getQueueStatus`)
  .then(r => r.json())
  .then(({ round, capital, queue }) => {
    roundInput.value = round;
    roundCapital = Number(capital || 0);

    playerDataList = queue;
    queue.forEach(p => {
      const wrap = document.createElement("label");
      wrap.className = "radio-wrapper";
      wrap.innerHTML = `
        <input type="radio" name="Player" value="${p.PlayerID}">
        <span class="radio-button">
          ${p.QueueNumber}. ${p.PlayerName} (${p.Team})
          ${p.RiskLevel ? `<small class="risk-badge">(${p.RiskLevel})</small>` : ""}
        </span>
      `;
      playerList.appendChild(wrap);
    });
    

    document.querySelectorAll("input[name='Player']").forEach(radio => {
      radio.addEventListener("change", e => {
        const p = playerDataList.find(x => String(x.PlayerID)===e.target.value);
        if (!p) return;
        playerInfo.style.display = "block";
        queueDisplay.textContent = p.QueueNumber;
        walletDisplay.textContent = (p.WalletBalance||0).toFixed(2);
      });
    });
  });

// Submit = create grouped trade with first leg
document.getElementById("tradeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sel = document.querySelector("input[name='Player']:checked");
  if (!sel) return alert("Please select a player.");

  const p = playerDataList.find(x => String(x.PlayerID)===sel.value);
  if (!p) return alert("Player not found.");

  const fd = new FormData(e.target);
  const qty = Number(fd.get("Qty")||0);
  const entry = Number(fd.get("EntryPrice")||0);
  const entryTotal = qty * entry;
  if (qty<=0 || entry<=0) return alert("Qty/Entry must be > 0.");
  if (roundCapital && entryTotal > roundCapital) return alert("This entry exceeds round capital.");

  const body = new URLSearchParams({
    action: "createTrade",
    Team: p.Team,
    PlayerID: p.PlayerID,
    Player: p.PlayerName,
    QueueNumber: p.QueueNumber,
    Scrip: fd.get("Scrip"),
    PositionType: fd.get("PositionType"),
    StopLoss: fd.get("StopLoss") || "",
    Qty: String(qty),
    EntryPrice: String(entry)
  });

  const res = await fetch(SCRIPT_URL, { method: "POST", body });
  const j = await res.json();
  if (!j.ok) return alert(j.error || "Failed to create trade.");
  alert("Trade created (leg #1).");
  location.href = "index.html";
});
