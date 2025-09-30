(async function AddPage() {
  // Elements
  const leagueChips = document.getElementById("league-chips");
  const roundBanner = document.getElementById("round-banner");
  const playerChips = document.getElementById("player-chips");
  const scripInput  = document.getElementById("scrip-input");
  const scripList   = document.getElementById("scrip-list");
  const sideChips   = document.getElementById("side-chips");
  const slEl = document.getElementById("sl");
  const tpEl = document.getElementById("tp");
  const entryEl = document.getElementById("entry");
  const qtyEl = document.getElementById("qty");
  const totalEl = document.getElementById("total");
  const rrView = document.getElementById("rr-view");
  const submitBtn = document.getElementById("submit-btn");
  const placeOrderEl = document.getElementById("place-order");


  // Attach steppers
  document.querySelectorAll(".input-stepper").forEach(UI.attachCryptoStepper);
  UI.twoWayQtyTotalSync({ qtyEl, priceEl: entryEl, totalEl });

  // Live RR preview
  function updateRR() {
    const side = sideChips.querySelector(".chip--selected")?.dataset.side || "Long";
    const rr = Compute.rr(entryEl.value, slEl.value, tpEl.value || entryEl.value, side);
    rrView.textContent = rr && rr !== "0" ? rr : "—";
  }
  [slEl, tpEl, entryEl].forEach(el => el.addEventListener("input", updateRR));
  sideChips.addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    sideChips.querySelectorAll(".chip").forEach(x=>x.classList.remove("chip--selected"));
    b.classList.add("chip--selected");
    updateRR();
  });

  // Load config & lookups
  const config = await API.getConfig();
  AppState.setConfig(config);
  const lookups = await API.getLookups();
  AppState.setLookups(lookups);
  AppState.initSelectedLeagues();
  // Build Tag chips (multi-select)
  const tagsRow = document.getElementById("tags-chips");
  let selectedTags = [];
  (AppState.tags || []).forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = t.TagName || t.TagID || "";
    b.dataset.tagName = t.TagName || "";
    b.addEventListener("click", () => {
      b.classList.toggle("chip--selected");
      selectedTags = Array.from(tagsRow.querySelectorAll(".chip--selected")).map(x => x.dataset.tagName).filter(Boolean);
    });
    tagsRow.appendChild(b);
  });

  // League chips
  (AppState.leagues || []).forEach(l => {
    if (l.IsActive !== true && String(l.IsActive).toLowerCase() !== "true") return;
    const chip = document.createElement("button");
    chip.className = "chip" + (AppState.selectedLeagues.includes(l.LeagueName) ? " chip--selected" : "");
    chip.textContent = l.LeagueName;
    chip.dataset.leagueId = l.LeagueID;
    chip.addEventListener("click", () => {
      chip.classList.toggle("chip--selected");
      AppState.selectedLeagues = Array.from(leagueChips.querySelectorAll(".chip--selected")).map(x => x.textContent);
      refreshRoundBanner();
      refreshNext5Players();
    });
    leagueChips.appendChild(chip);
  });

  // Rounds banner
  async function refreshRoundBanner() {
    const ids = AppState.leagues.filter(l => AppState.selectedLeagues.includes(l.LeagueName)).map(l => l.LeagueID);
    const rounds = await API.getRoundsMeta(ids);
    // pick latest per league, render: "Scalp • R: 1 • Cap: 100 | Swing • R: 1 • Cap: 5000"
    const txt = (rounds || []).map(r => `${r.LeagueName} • R: ${r.RoundNumber} • Cap: ${r.BudgetCapPerPlayer}`).join("  |  ");
    roundBanner.textContent = txt || "No active rounds";
  }

  // Predictive scrip input
  (AppState.scrips || []).forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.ScripName;
    scripList.appendChild(opt);
  });

  // Next 5 players logic: fewest trades → lowest PnL% → QueueOrder
  async function refreshNext5Players() {
    const init = await API.getAddPageInit(
      AppState.leagues.filter(l => AppState.selectedLeagues.includes(l.LeagueName)).map(l => l.LeagueID)
    );
    // init.playersStats = [{PlayerID, PlayerName, TeamID, TT, PnLPct, QueueOrder, RiskTrait}]
    const sorted = (init.playersStats || []).sort((a,b) => {
      if (a.TT !== b.TT) return a.TT - b.TT;
      if ((a.PnLPct||0) !== (b.PnLPct||0)) return (a.PnLPct||0) - (b.PnLPct||0);
      return (a.QueueOrder||999) - (b.QueueOrder||999);
    }).slice(0,5);

    playerChips.innerHTML = "";
    sorted.forEach(p => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = `${p.PlayerName} (${p.RiskTrait||1})`;
      chip.dataset.playerId = p.PlayerID;
      chip.addEventListener("click", () => {
        playerChips.querySelectorAll(".chip").forEach(x=>x.classList.remove("chip--selected"));
        chip.classList.add("chip--selected");
      });
      playerChips.appendChild(chip);
    });
  }

  await refreshRoundBanner();
  await refreshNext5Players();

  // Default side
  sideChips.querySelector('[data-side="Long"]').classList.add("chip--selected");

  // Autofocus on first field (scrip)
  UI.autofocusFirst(document);

  // Submit
  submitBtn.addEventListener("click", async () => {
    const playerBtn = playerChips.querySelector(".chip--selected");
    const playerId = playerBtn?.dataset.playerId;
    const side = sideChips.querySelector(".chip--selected")?.dataset.side;
    const scripName = scripInput.value.trim();

    if (!playerId || !scripName || !entryEl.value) {
      alert("Player, Scrip and Entry are required.");
      return;
    }

    // exposure/concurrency gate (server authoritative)
    const leagueIds = AppState.leagues.filter(l => AppState.selectedLeagues.includes(l.LeagueName)).map(l => l.LeagueID);
    const gate = await API.getExposureSummary(leagueIds);
    if (gate.block) { alert(gate.reason || "Exposure / Concurrency limit reached."); return; }

    const payload = {
      side,
      scripName,
      playerId,
      leagues: leagueIds,
      // server will resolve season + round via RoundsMeta
      positionSL: slEl.value || "", 
      positionTP: tpEl.value || "",      
      // first entry leg
      qty: qtyEl.value || "0",
      entry: entryEl.value,
      total: totalEl.value || Compute.mulStr(qtyEl.value||"0", entryEl.value||"0"),
      rr: Compute.rr(entryEl.value, slEl.value, (tpEl.value || entryEl.value), side),
      inOrder: !!placeOrderEl?.checked,
      tags: selectedTags
    };

    try {
      await API.createPositionWithEntry(payload);
      alert("Position created.");
      // reset minimal
      qtyEl.value = totalEl.value = "";
      rrView.textContent = "—";
    } catch (e) {
      alert(e.message);
    }
  });
})();
