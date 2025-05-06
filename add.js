const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyTfKUqTt1bN3WFRyQlWWMh7tAX4af0qasvb2bhoNoJ98eImhqP0IPyMojneD7dL0nIjw/exec";

const teamSelect = document.querySelector("select[name='Team']");
const playerSelect = document.getElementById("playerSelect");

teamSelect.addEventListener("change", function () {
  const selectedTeam = this.value;

  // Clear current options
  playerSelect.innerHTML = '<option value="">Loading...</option>';

  if (selectedTeam) {
    fetch(`${SCRIPT_URL}?action=getPlayers&team=${selectedTeam}`)
      .then(res => res.json())
      .then(data => {
        playerSelect.innerHTML = '<option value="">Select Player</option>';
        data.players.forEach(player => {
          const option = document.createElement("option");
          option.value = player.PlayerName;
          option.textContent = player.PlayerName;
          playerSelect.appendChild(option);
        });
      })
      .catch(err => {
        console.error("Error fetching players:", err);
        playerSelect.innerHTML = '<option value="">Error loading players</option>';
      });
  } else {
    playerSelect.innerHTML = '<option value="">Select Player</option>';
  }
});


document.getElementById("tradeForm").addEventListener("submit", function (e) {
  e.preventDefault();
  const formData = new FormData(e.target);

  fetch(SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(formData)
  })
  .then(() => {
    alert("Trade submitted successfully!");
    tradeForm.reset();
  })
  .catch(error => {
    console.error("Submit error:", error);
    alert("There was an error submitting the trade.");
  });
  
      
});
