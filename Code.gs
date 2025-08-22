/** =========================
 *  CONSTANTS / HELPERS
 *  ========================= */
const ACTIVE_TRADES_SHEET = "ActiveTrades";
const TEAM_PLAYER_MAP_SHEET = "TeamPlayerMap";

function _getAll_(sheetName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const vals = sh.getDataRange().getValues();
  const headers = vals[0] || [];
  const rows = vals.slice(1);
  return { sh, headers, rows };
}
function _idxMap(headers){ return Object.fromEntries(headers.map((h,i)=>[h,i])); }
function _uuid(){ return Utilities.getUuid(); }
function _now(){ return new Date(); }
function _jsonOk(obj){ return ContentService.createTextOutput(JSON.stringify({ok:true, ...obj})).setMimeType(ContentService.MimeType.JSON); }
function _jsonBad(msg){ return ContentService.createTextOutput(JSON.stringify({ok:false, error:msg})).setMimeType(ContentService.MimeType.JSON); }

/** Round capital lookup (CapitalPerTeam preferred, else CapitalPerPlayer) */
function _getRoundCapByRound(roundNumber){
  const {rows, headers} = _getAll_("RoundsMeta");
  if (!rows.length) return 0;
  const H = _idxMap(headers);
  const capKey = H["CapitalPerTeam"] !== undefined ? "CapitalPerTeam"
               : H["CapitalPerPlayer"] !== undefined ? "CapitalPerPlayer"
               : null;
  if (!capKey) return 0;

  const rIdx = H["RoundNumber"], cIdx = H[capKey];

  // Try exact round with non-empty capital
  for (let i = rows.length-1; i >= 0; i--) {
    if (Number(rows[i][rIdx]) === Number(roundNumber)) {
      const cap = Number(rows[i][cIdx]);
      if (!isNaN(cap) && cap > 0) return cap;
      break;
    }
  }
  // Fallback to last non-empty capital
  for (let i = rows.length-1; i >= 0; i--) {
    const cap = Number(rows[i][cIdx]);
    if (!isNaN(cap) && cap > 0) return cap;
  }
  return 0;
}

/** =========================
 *  GROUPING (ENTRIES + EXITS in ActiveTrades)
 *  ========================= */
function _groupOpenTrades(){
  const {headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
  const H = _idxMap(headers);

  const hasLegType = H["LegType"] !== undefined;
  const hasIsExecuted = H["IsExecuted"] !== undefined;

  // Only rows not marked closed
  const open = rows
    .map((r,i)=>({r, i1:i+2}))
    .filter(x => String(x.r[H["IsClosed"]]).toUpperCase() !== "TRUE");

  const byId = {}; // TradeID -> { meta, legs[], exits[] }
  open.forEach(x=>{
    const r = x.r;
    const id = r[H["TradeID"]];
    if (!byId[id]) {
      byId[id] = {
        TradeID: id,
        RoundNumber: r[H["RoundNumber"]],
        Team: r[H["Team"]],
        PlayerID: r[H["PlayerID"]],
        Player: r[H["Player"]],
        QueueNumber: r[H["QueueNumber"]],
        Scrip: r[H["Scrip"]],
        PositionType: r[H["PositionType"]],
        legs: [],
        exits: []
      };
    }
    const legType = hasLegType ? String(r[H["LegType"]]).toUpperCase() : "ENTRY";

    if (legType === "EXIT") {
      byId[id].exits.push({
        RowIndex: x.i1,
        ExitNumber: "", // client will number sequentially
        Qty: Number(r[H["Qty"]]) || 0,
        ExitPrice: r[H["ExitPrice"]],
        StopLoss: r[H["StopLoss"]],
        ExitTotal: r[H["ExitTotal"]],
        IsExecuted: hasIsExecuted ? r[H["IsExecuted"]] : ""
      });
    } else {
      byId[id].legs.push({
        RowIndex: x.i1,
        StopLoss: r[H["StopLoss"]],
        Qty: Number(r[H["Qty"]]) || 0,
        EntryPrice: Number(r[H["EntryPrice"]]) || 0,
        EntryTotal: Number(r[H["EntryTotal"]]) || 0,
        ExitPrice: r[H["ExitPrice"]],
        ExitTotal: r[H["ExitTotal"]],
        PnL: r[H["PnL"]]
      });
    }
  });

  const groups = [];
  Object.values(byId).forEach(g=>{
    const cap = _getRoundCapByRound(g.RoundNumber);

    // entries
    const totalQty = g.legs.reduce((a,l)=>a+(Number(l.Qty)||0),0);
    const totalEntry = g.legs.reduce((a,l)=>a+(Number(l.EntryTotal)||0),0);
    const avgEntry = totalQty ? totalEntry/totalQty : 0;

    // exits (for info)
    const exitsWithPrice = g.exits.filter(e => e.ExitPrice!=="" && e.ExitPrice!=null && !isNaN(e.ExitPrice));
    const exitValueTotal = exitsWithPrice.reduce((a,e)=>a + (Number(e.Qty)||0) * Number(e.ExitPrice), 0);
    const qtyWithExitPx = exitsWithPrice.reduce((a,e)=>a + (Number(e.Qty)||0), 0);
    const avgExitPrice = qtyWithExitPx ? (exitValueTotal / qtyWithExitPx) : 0;

    groups.push({
      TradeID: g.TradeID,
      RoundNumber: g.RoundNumber,
      Team: g.Team,
      PlayerID: g.PlayerID,
      Player: g.Player,
      QueueNumber: g.QueueNumber,
      Scrip: g.Scrip,
      PositionType: g.PositionType,
      legs: g.legs,
      Exits: g.exits,
      ExitsCount: g.exits.length,

      LegsCount: g.legs.length,
      MaxLegs: 4,
      MaxCapital: cap,
      UsedCapital: totalEntry,
      RemainingCapital: Math.max(0, cap - totalEntry),

      TotalQty: totalQty,
      AvgEntryPrice: avgEntry,
      TotalEntryValue: totalEntry,

      // handy exit aggregates (optional)
      ExitValueTotal: exitValueTotal,
      AvgExitPrice: avgExitPrice
    });
  });

  return groups;
}

/** =========================
 *  GET HANDLERS (kept + new)
 *  ========================= */
function doGet(e){
  const action = e.parameter.action;

  // --- NEW: grouped active view ---
  if (action === "getActiveGroupedTrades") {
    try {
      const positions = _groupOpenTrades();
      return ContentService.createTextOutput(JSON.stringify({ ok:true, positions }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      Logger.log(err && err.stack ? err.stack : err);
      return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // --- EXISTING: getPlayers ---
  if (action === "getPlayers" && e.parameter.team) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEAM_PLAYER_MAP_SHEET);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const teamIndex = headers.indexOf("Team");
    const playerIdIndex = headers.indexOf("PlayerID");
    const playerNameIndex = headers.indexOf("PlayerName");

    const players = data.slice(1)
      .filter(row => row[teamIndex] === e.parameter.team)
      .map(row => ({ PlayerID: row[playerIdIndex], PlayerName: row[playerNameIndex] }));

    return ContentService.createTextOutput(JSON.stringify({ players }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- EXISTING: getTrades / getClosedTrades ---
  if (action === "getTrades" || action === "getClosedTrades") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACTIVE_TRADES_SHEET);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const isClosedIndex = headers.indexOf("IsClosed");
    const targetStatus = action === "getClosedTrades" ? "TRUE" : "FALSE";

    const trades = data.slice(1)
      .filter(row => row[isClosedIndex].toString().toUpperCase() === targetStatus)
      .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));

    return ContentService.createTextOutput(JSON.stringify({ trades }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- UPDATED: getQueueStatus (team-aware & ignores Exit rows) ---
  if (action === "getQueueStatus") {
    const {rows: rounds, headers: rH} = _getAll_("RoundsMeta");
    const latest = rounds[rounds.length - 1];
    const round = Number(latest[_idxMap(rH)["RoundNumber"]]);
    const capital = _getRoundCapByRound(round);

    const map = _getAll_("TeamPlayerMap");
    const standings = _getAll_("StandingsPlayer");
    const active = _getAll_(ACTIVE_TRADES_SHEET);

    const mH = _idxMap(map.headers);
    const sH = _idxMap(standings.headers);
    const aH = _idxMap(active.headers);

    // Teams with an open grouped trade in this round (only Entry rows count)
    const teamsWithOpen = new Set(
      active.rows.filter(r =>
        Number(r[aH["RoundNumber"]]) === round &&
        String(r[aH["IsClosed"]]).toUpperCase() !== "TRUE" &&
        String(r[aH["LegType"]] || "").toUpperCase() !== "EXIT"
      ).map(r => String(r[aH["Team"]]))
    );

    const walletById = {};
    standings.rows.forEach(r => walletById[String(r[sH["PlayerID"]])] = Number(r[sH["WalletBalance"]]) || 0);

    const queue = map.rows
      .filter(r => !teamsWithOpen.has(String(r[mH["Team"]])))
      .map(r => ({
        PlayerID: String(r[mH["PlayerID"]]),
        PlayerName: r[mH["PlayerName"]],
        Team: r[mH["Team"]],
        QueueNumber: Number(r[mH["PlayerOrder"]]),
        WalletBalance: walletById[String(r[mH["PlayerID"]])] || 0
      }))
      .sort((a,b)=>a.QueueNumber - b.QueueNumber)
      .slice(0,5);

    return ContentService.createTextOutput(JSON.stringify({ round, capital, queue }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- EXISTING: getPlayerInfo ---
  if (action === "getPlayerInfo" && e.parameter.id) {
    const playerId = e.parameter.id;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const playerSheet = ss.getSheetByName("TeamPlayerMap").getDataRange().getValues();
    const standingsSheet = ss.getSheetByName("StandingsPlayer").getDataRange().getValues();
    const completedSheet = ss.getSheetByName("CompletedTrades").getDataRange().getValues();

    const playerHeaders = playerSheet[0];
    const standingsHeaders = standingsSheet[0];
    const completedHeaders = completedSheet[0];

    const playerRow = playerSheet.find(row => String(row[playerHeaders.indexOf("PlayerID")]) === playerId);
    if (!playerRow) {
      return ContentService.createTextOutput("Player not found").setMimeType(ContentService.MimeType.TEXT);
    }

    const playerName = playerRow[playerHeaders.indexOf("PlayerName")];
    const team = playerRow[playerHeaders.indexOf("Team")];

    const standingsRow = standingsSheet.find(row => String(row[standingsHeaders.indexOf("PlayerID")]) === playerId);
    const walletBalance = standingsRow ? parseFloat(standingsRow[standingsHeaders.indexOf("WalletBalance")]) || 0 : 0;

    const trades = completedSheet.slice(1).filter(row =>
      String(row[completedHeaders.indexOf("PlayerID")]) === playerId
    ).map(row => Object.fromEntries(completedHeaders.map((h, i) => [h, row[i]])));

    return ContentService.createTextOutput(JSON.stringify({
      PlayerID: playerId, PlayerName: playerName, Team: team, WalletBalance: walletBalance, Trades: trades
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // --- EXISTING: getPlayerStats ---
  if (action === "getPlayerStats") {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("StandingsPlayer");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const idIndex = headers.indexOf("PlayerID");
    const nameIndex = headers.indexOf("PlayerName");
    const tradesIndex = headers.indexOf("Trades");
    const winsIndex = headers.indexOf("Wins");
    const lossesIndex = headers.indexOf("Losses");
    const pnlIndex = headers.indexOf("NetPnL");
    const longTradesIndex = headers.indexOf("LongTrades");
    const longWinsIndex = headers.indexOf("LongWins");
    const shortTradesIndex = headers.indexOf("ShortTrades");
    const shortWinsIndex = headers.indexOf("ShortWins");

    const players = {};
    data.slice(1).forEach(row => {
      players[row[idIndex]] = {
        PlayerID: row[idIndex],
        PlayerName: row[nameIndex],
        Trades: Number(row[tradesIndex]) || 0,
        Wins: Number(row[winsIndex]) || 0,
        Losses: Number(row[lossesIndex]) || 0,
        PnL: Number(row[pnlIndex]) || 0,
        LongTrades: Number(row[longTradesIndex]) || 0,
        LongWins: Number(row[longWinsIndex]) || 0,
        ShortTrades: Number(row[shortTradesIndex]) || 0,
        ShortWins: Number(row[shortWinsIndex]) || 0
      };
    });
    return ContentService.createTextOutput(JSON.stringify(players))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- EXISTING: getScripList ---
  if (action === "getScripList") {
    const scripSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scrips");
    if (!scripSheet) return ContentService.createTextOutput("Scrips sheet not found.").setMimeType(ContentService.MimeType.TEXT);

    const data = scripSheet.getDataRange().getValues();
    const headers = data[0];
    const scripNameIndex = headers.indexOf("ScripName");

    const scrips = data.slice(1).map(row => row[scripNameIndex]).filter(name => !!name);
    return ContentService.createTextOutput(JSON.stringify({ scrips }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Fallback
  return ContentService.createTextOutput("Invalid request").setMimeType(ContentService.MimeType.TEXT);
}

/** =========================
 *  POST HANDLERS (kept + new)
 *  ========================= */
function doPost(e){
  const action = e.parameter.action;

  /** ---- NEW: Create first entry leg for a grouped trade ---- */
  if (action === "createTrade") {
    const team = e.parameter.Team;
    const playerID = e.parameter.PlayerID;
    const player = e.parameter.Player;
    const queueNumber = e.parameter.QueueNumber;
    const scrip = e.parameter.Scrip;
    const positionType = e.parameter.PositionType;
    const qty = Number(e.parameter.Qty||0);
    const entry = Number(e.parameter.EntryPrice||0);
    const sl = e.parameter.StopLoss || "";

    if (!team || !playerID || !player || !scrip || !positionType) return _jsonBad("Missing required fields.");
    if (qty<=0 || entry<=0) return _jsonBad("Invalid Qty/Entry.");

    const {rows: rounds, headers: rH} = _getAll_("RoundsMeta");
    const round = Number(rounds[rounds.length-1][_idxMap(rH)["RoundNumber"]]);
    const cap = _getRoundCapByRound(round);

    const {headers: aHh, rows: act} = _getAll_(ACTIVE_TRADES_SHEET);
    const aH = _idxMap(aHh);
    const teamHasOpen = act.some(r =>
      Number(r[aH["RoundNumber"]])===round &&
      String(r[aH["Team"]])===String(team) &&
      String(r[aH["IsClosed"]]).toUpperCase()!=="TRUE" &&
      String(r[aH["LegType"]] || "").toUpperCase() !== "EXIT"
    );
    if (teamHasOpen) return _jsonBad("Team already has an open trade this round.");

    const entryTotal = qty * entry;
    if (entryTotal > cap) return _jsonBad("Entry exceeds round capital.");

    const tradeId = _uuid();
    const newRow = aHh.map(()=> "");
    newRow[aH["RoundNumber"]] = round;
    newRow[aH["Team"]] = team;
    newRow[aH["PlayerID"]] = playerID;
    newRow[aH["Player"]] = player;
    newRow[aH["QueueNumber"]] = queueNumber;
    newRow[aH["TradeID"]] = tradeId;
    newRow[aH["Scrip"]] = scrip;
    newRow[aH["PositionType"]] = positionType;
    newRow[aH["StopLoss"]] = sl;
    newRow[aH["Qty"]] = qty;
    newRow[aH["EntryPrice"]] = entry;
    newRow[aH["EntryTotal"]] = entryTotal;
    if (aH["LegType"] !== undefined) newRow[aH["LegType"]] = "Entry";
    newRow[aH["IsClosed"]] = "FALSE";
    newRow[aH["IsSuccess"]] = "";

    _getAll_(ACTIVE_TRADES_SHEET).sh.appendRow(newRow);
    return _jsonOk({ TradeID: tradeId });
  }

  /** ---- NEW: Add another entry leg ---- */
  if (action === "addTradeLeg") {
    const tradeId = e.parameter.TradeID;
    const qty = Number(e.parameter.Qty||0);
    const entry = Number(e.parameter.EntryPrice||0);
    const sl = e.parameter.StopLoss || "";
    if (!tradeId) return _jsonBad("TradeID required.");
    if (qty<=0 || entry<=0) return _jsonBad("Invalid leg values.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);

    const baseLegs = rows.filter(r =>
      String(r[H["TradeID"]])===String(tradeId) &&
      String(r[H["LegType"]]||"").toUpperCase()!=="EXIT"
    );
    if (!baseLegs.length) return _jsonBad("TradeID not found.");

    const base = baseLegs[0];
    const round = Number(base[H["RoundNumber"]]);
    const team = base[H["Team"]];
    const playerID = base[H["PlayerID"]];
    const player = base[H["Player"]];
    const queueNumber = base[H["QueueNumber"]];
    const scrip = base[H["Scrip"]];
    const positionType = base[H["PositionType"]];

    if (baseLegs.length >= 4) return _jsonBad("Max 4 legs reached.");
    const used = baseLegs.reduce((a,r)=>a + (Number(r[H["EntryTotal"]])||0), 0);
    const cap = _getRoundCapByRound(round);
    const newEntryTotal = qty * entry;
    if (used + newEntryTotal > cap) return _jsonBad("This leg exceeds remaining capital.");

    const newRow = headers.map(()=> "");
    newRow[H["RoundNumber"]] = round;
    newRow[H["Team"]] = team;
    newRow[H["PlayerID"]] = playerID;
    newRow[H["Player"]] = player;
    newRow[H["QueueNumber"]] = queueNumber;
    newRow[H["TradeID"]] = tradeId;
    newRow[H["Scrip"]] = scrip;
    newRow[H["PositionType"]] = positionType;
    newRow[H["StopLoss"]] = sl;
    newRow[H["Qty"]] = qty;
    newRow[H["EntryPrice"]] = entry;
    newRow[H["EntryTotal"]] = newEntryTotal;
    if (H["LegType"] !== undefined) newRow[H["LegType"]] = "Entry";
    newRow[H["IsClosed"]] = "FALSE";
    newRow[H["IsSuccess"]] = "";
    sh.appendRow(newRow);

    return _jsonOk({ ok:true });
  }

  /** ---- NEW: Update an entry leg (Qty/Entry/SL) ---- */
  if (action === "updateTradeLeg") {
    const rowIndex = Number(e.parameter.RowIndex); // 1-based
    const qty = e.parameter.Qty!==undefined ? Number(e.parameter.Qty) : undefined;
    const entry = e.parameter.EntryPrice!==undefined ? Number(e.parameter.EntryPrice) : undefined;
    const sl = e.parameter.StopLoss!==undefined ? e.parameter.StopLoss : undefined;
    if (!rowIndex || rowIndex<2) return _jsonBad("RowIndex invalid.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);
    const r = rows[rowIndex-2];
    if (!r) return _jsonBad("Row not found.");
    if (String(r[H["IsClosed"]]).toUpperCase()==="TRUE") return _jsonBad("Leg already closed.");
    if (String(r[H["LegType"]]||"").toUpperCase()==="EXIT") return _jsonBad("Use updateExitPlan for exit rows.");

    const tradeId = r[H["TradeID"]];
    const legs = rows.map((row, idx) => ({row, idx1: idx+2}))
      .filter(x => String(x.row[H["TradeID"]])===String(tradeId) && String(x.row[H["LegType"]]||"").toUpperCase()!=="EXIT");

    const curQty = Number(r[H["Qty"]]) || 0;
    const curEntry = Number(r[H["EntryPrice"]]) || 0;
    const newQty = qty!==undefined ? qty : curQty;
    const newEntry = entry!==undefined ? entry : curEntry;
    if (newQty<=0 || newEntry<=0) return _jsonBad("Qty/Entry must be > 0.");

    const round = Number(r[H["RoundNumber"]]);
    const cap = _getRoundCapByRound(round);

    let used = 0;
    legs.forEach(x=>{
      if (x.idx1 === rowIndex) used += newQty * newEntry;
      else used += (Number(x.row[H["EntryTotal"]])||0);
    });
    if (used > cap) return _jsonBad("Edit would exceed round capital.");

    if (sl!==undefined) sh.getRange(rowIndex, H["StopLoss"]+1).setValue(sl);
    sh.getRange(rowIndex, H["Qty"]+1).setValue(newQty);
    sh.getRange(rowIndex, H["EntryPrice"]+1).setValue(newEntry);
    sh.getRange(rowIndex, H["EntryTotal"]+1).setValue(newQty * newEntry);

    return _jsonOk({ ok:true });
  }

  /** ---- NEW: Add/Update/Delete EXIT rows (planned exits) ---- */
  if (action === "addExitPlan") {
    const tradeId = e.parameter.TradeID;
    const qty = Number(e.parameter.Qty || 0);
    const exitPriceParam = e.parameter.ExitPrice;
    const stopLossParam = e.parameter.StopLoss;

    if (!tradeId) return _jsonBad("TradeID required.");
    if (qty <= 0) return _jsonBad("Exit Qty must be > 0.");

    // Parse optional numbers
    const exitPrice = (exitPriceParam==="" || exitPriceParam==null) ? "" : Number(exitPriceParam);
    if (exitPrice !== "" && (isNaN(exitPrice) || exitPrice<=0)) return _jsonBad("Invalid Exit Price.");
    const stopLoss = (stopLossParam==="" || stopLossParam==null) ? "" : Number(stopLossParam);
    if (stopLoss !== "" && (isNaN(stopLoss) || stopLoss<=0)) return _jsonBad("Invalid SL.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);

    const legs = rows.filter(r =>
      String(r[H["TradeID"]])===String(tradeId) &&
      String(r[H["LegType"]]||"").toUpperCase()!=="EXIT"
    );
    if (!legs.length) return _jsonBad("No entry legs for this trade.");

    const base = legs[0];
    const round = base[H["RoundNumber"]];
    const team = base[H["Team"]];
    const playerID = base[H["PlayerID"]];
    const player = base[H["Player"]];
    const queueNumber = base[H["QueueNumber"]];
    const scrip = base[H["Scrip"]];
    const positionType = base[H["PositionType"]];

    const totalQty = legs.reduce((a,r)=> a + (Number(r[H["Qty"]])||0), 0);
    const exits = rows.filter(r =>
      String(r[H["TradeID"]])===String(tradeId) &&
      String(r[H["LegType"]]||"").toUpperCase()==="EXIT"
    );
    if (exits.length >= 4) return _jsonBad("Max 4 exits reached.");
    const exitQtySum = exits.reduce((a,r)=> a + (Number(r[H["Qty"]])||0), 0);
    if (exitQtySum + qty > totalQty) return _jsonBad("Exit qty exceeds total entry qty.");

    const newRow = headers.map(()=> "");
    newRow[H["RoundNumber"]] = round;
    newRow[H["Team"]] = team;
    newRow[H["PlayerID"]] = playerID;
    newRow[H["Player"]] = player;
    newRow[H["QueueNumber"]] = queueNumber;
    newRow[H["TradeID"]] = tradeId;
    newRow[H["Scrip"]] = scrip;
    newRow[H["PositionType"]] = positionType;
    newRow[H["LegType"]] = "Exit";
    if (H["ExitNumber"] !== undefined) newRow[H["ExitNumber"]] = exits.length + 1;
    newRow[H["Qty"]] = qty;
    newRow[H["ExitPrice"]] = exitPrice === "" ? "" : exitPrice;
    newRow[H["StopLoss"]] = stopLoss === "" ? "" : stopLoss;
    newRow[H["ExitTotal"]] = exitPrice === "" ? "" : qty * exitPrice;
    newRow[H["IsClosed"]] = "FALSE";
    newRow[H["IsSuccess"]] = "";

    sh.appendRow(newRow);
    return _jsonOk({ ok:true });
  }

  if (action === "updateExitPlan") {
    const rowIndex = Number(e.parameter.RowIndex);
    const qty = e.parameter.Qty !== undefined ? Number(e.parameter.Qty) : undefined;
    const exitPriceParam = e.parameter.ExitPrice;
    const stopLossParam = e.parameter.StopLoss;

    if (!rowIndex || rowIndex < 2) return _jsonBad("RowIndex invalid.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);
    const r = rows[rowIndex - 2];
    if (!r) return _jsonBad("Exit row not found.");
    if (String(r[H["LegType"]]||"").toUpperCase() !== "EXIT") return _jsonBad("Not an exit row.");

    const tradeId = r[H["TradeID"]];
    const legs = rows.filter(x => String(x[H["TradeID"]])===String(tradeId) && String(x[H["LegType"]]||"").toUpperCase()!=="EXIT");
    const totalQty = legs.reduce((a,x)=> a + (Number(x[H["Qty"]])||0), 0);

    const allExits = rows.map((row, idx)=>({row, idx1: idx+2}))
      .filter(x => String(x.row[H["TradeID"]])===String(tradeId) && String(x.row[H["LegType"]]||"").toUpperCase()==="EXIT");

    // Compute planned qty after this change
    let planned = 0;
    allExits.forEach(x => {
      if (x.idx1 === rowIndex) {
        const q = (qty !== undefined) ? qty : Number(r[H["Qty"]]) || 0;
        planned += q;
      } else {
        planned += Number(x.row[H["Qty"]]) || 0;
      }
    });
    if (planned > totalQty) return _jsonBad("Exit qty exceeds total entry qty.");

    // Parse optional numbers
    let exitPrice;
    if (exitPriceParam !== undefined) {
      exitPrice = (exitPriceParam==="" || exitPriceParam==null) ? "" : Number(exitPriceParam);
      if (exitPrice !== "" && (isNaN(exitPrice) || exitPrice<=0)) return _jsonBad("Invalid Exit Price.");
    }
    let stopLoss;
    if (stopLossParam !== undefined) {
      stopLoss = (stopLossParam==="" || stopLossParam==null) ? "" : Number(stopLossParam);
      if (stopLoss !== "" && (isNaN(stopLoss) || stopLoss<=0)) return _jsonBad("Invalid SL.");
    }

    if (qty !== undefined) sh.getRange(rowIndex, H["Qty"]+1).setValue(qty);
    if (exitPriceParam !== undefined) sh.getRange(rowIndex, H["ExitPrice"]+1).setValue(exitPrice === "" ? "" : exitPrice);
    if (stopLossParam !== undefined) sh.getRange(rowIndex, H["StopLoss"]+1).setValue(stopLoss === "" ? "" : stopLoss);

    // Recalc ExitTotal when we have price
    const qNow = (qty !== undefined ? qty : Number(r[H["Qty"]]) || 0);
    const pNow = (exitPriceParam !== undefined
                  ? (exitPrice === "" ? "" : Number(exitPrice))
                  : (r[H["ExitPrice"]]==="" ? "" : Number(r[H["ExitPrice"]]) || ""));
    if (pNow === "") {
      sh.getRange(rowIndex, H["ExitTotal"]+1).setValue("");
    } else {
      sh.getRange(rowIndex, H["ExitTotal"]+1).setValue(qNow * Number(pNow));
    }

    return _jsonOk({ ok:true });
  }

  if (action === "deleteExitPlan") {
    const rowIndex = Number(e.parameter.RowIndex);
    if (!rowIndex || rowIndex < 2) return _jsonBad("RowIndex invalid.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);
    const r = rows[rowIndex - 2];
    if (!r) return _jsonBad("Row not found.");
    if (String(r[H["LegType"]]||"").toUpperCase() !== "EXIT") return _jsonBad("Not an exit row.");

    sh.deleteRow(rowIndex);
    return _jsonOk({ ok:true });
  }

  /** ---- NEW: Execute exit at Target (keep ExitPrice; mark executed; set ExitTotal) ---- */
  if (action === "markExitExecuted") {
    const rowIndex = Number(e.parameter.RowIndex);
    if (!rowIndex || rowIndex < 2) return _jsonBad("RowIndex invalid.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);
    const r = rows[rowIndex - 2];
    if (!r) return _jsonBad("Row not found.");
    if (String(r[H["LegType"]]||"").toUpperCase() !== "EXIT") return _jsonBad("Not an exit row.");

    const px = Number(r[H["ExitPrice"]] || 0);
    const q  = Number(r[H["Qty"]] || 0);
    if (!px || px <= 0) return _jsonBad("Set Exit Price before marking executed.");

    if (H["IsExecuted"] === undefined) return _jsonBad("Add 'IsExecuted' column to ActiveTrades.");
    sh.getRange(rowIndex, H["IsExecuted"]+1).setValue("TRUE");

    if (H["ExitTotal"] !== undefined) sh.getRange(rowIndex, H["ExitTotal"]+1).setValue(q * px);

    return _jsonOk({ ok:true });
  }

  /** ---- Execute exit at SL (keep ExitPrice; mark executed; ExitTotal uses SL) ---- */
  if (action === "markExitExecutedAtSL") {
    const rowIndex = Number(e.parameter.RowIndex);
    if (!rowIndex || rowIndex < 2) return _jsonBad("RowIndex invalid.");

    const {sh, headers, rows} = _getAll_("ActiveTrades");
    const H = _idxMap(headers);
    const r = rows[rowIndex - 2];
    if (!r) return _jsonBad("Row not found.");
    if (String(r[H["LegType"]]||"").toUpperCase() !== "EXIT")
      return _jsonBad("Not an exit row.");

    const sl = Number(r[H["StopLoss"]] || 0);
    const q  = Number(r[H["Qty"]] || 0);
    if (!sl || sl <= 0) return _jsonBad("No valid SL on this row.");

    // Do NOT change ExitPrice — keep the planned target intact
    if (H["IsExecuted"] === undefined)
      return _jsonBad("Add 'IsExecuted' column to ActiveTrades.");
    sh.getRange(rowIndex, H["IsExecuted"]+1).setValue("TRUE");

    // Set ExitTotal to SL * Qty for clarity
    if (H["ExitTotal"] !== undefined) {
      sh.getRange(rowIndex, H["ExitTotal"]+1).setValue(q * sl);
    }

    return _jsonOk({ ok:true });
  }

  /** ---- NEW: Close grouped trade using planned exits ---- */
  if (action === "closeGroupedTrade") {
    const tradeId = e.parameter.TradeID;
    if (!tradeId) return _jsonBad("TradeID required.");

    const {sh, headers, rows} = _getAll_(ACTIVE_TRADES_SHEET);
    const H = _idxMap(headers);

    const entries = rows.map((row, idx)=>({row, idx1: idx+2}))
      .filter(x => String(x.row[H["TradeID"]])===String(tradeId) && String(x.row[H["LegType"]]||"").toUpperCase()!=="EXIT");

    const exits   = rows.map((row, idx)=>({row, idx1: idx+2}))
      .filter(x => String(x.row[H["TradeID"]])===String(tradeId) && String(x.row[H["LegType"]]||"").toUpperCase()==="EXIT");

    if (!entries.length) return _jsonBad("No entry legs for this trade.");
    if (!exits.length) return _jsonBad("No exit plans found.");

    const round = Number(entries[0].row[H["RoundNumber"]]);
    const team  = entries[0].row[H["Team"]];
    const playerID = entries[0].row[H["PlayerID"]];
    const player   = entries[0].row[H["Player"]];
    const scrip    = entries[0].row[H["Scrip"]];
    const positionType = entries[0].row[H["PositionType"]];
    const long = String(positionType).toLowerCase() === "long";
    const sign = long ? 1 : -1;

    const totalQty   = entries.reduce((a,x)=> a + (Number(x.row[H["Qty"]])||0), 0);
    const totalEntry = entries.reduce((a,x)=> a + (Number(x.row[H["EntryTotal"]])||0), 0);
    const avgEntry   = totalQty ? totalEntry / totalQty : 0;

    const exitQty    = exits.reduce((a,x)=> a + (Number(x.row[H["Qty"]])||0), 0);
    if (Math.round((exitQty - totalQty)*10000) !== 0) {
      return _jsonBad("Total exit qty must equal total entry qty before closing.");
    }
    const exitValue  = exits.reduce((a,x)=> a + ((Number(x.row[H["Qty"]])||0) * (Number(x.row[H["ExitPrice"]])||0)), 0);
    const avgExit    = totalQty ? exitValue / totalQty : 0;

    const totalPnL = totalQty * (avgExit - avgEntry) * sign;
    const pnlPct   = totalEntry ? (totalPnL / totalEntry) * 100 : 0;

    // CompletedTrades (aggregate)
    const {sh:doneSh, headers:doneH} = _getAll_("CompletedTrades");
    const dH = _idxMap(doneH);
    const row = doneH.map(()=> "");
    if (dH["TradeID"]!==undefined) row[dH["TradeID"]] = tradeId;
    if (dH["RoundNumber"]!==undefined) row[dH["RoundNumber"]] = round;
    if (dH["Team"]!==undefined) row[dH["Team"]] = team;
    if (dH["PlayerID"]!==undefined) row[dH["PlayerID"]] = playerID;
    if (dH["Player"]!==undefined) row[dH["Player"]] = player;
    if (dH["Scrip"]!==undefined) row[dH["Scrip"]] = scrip;
    if (dH["PositionType"]!==undefined) row[dH["PositionType"]] = positionType;
    if (dH["Qty"]!==undefined) row[dH["Qty"]] = totalQty;
    if (dH["EntryPrice"]!==undefined) row[dH["EntryPrice"]] = avgEntry;
    if (dH["EntryValue"]!==undefined) row[dH["EntryValue"]] = totalEntry;
    if (dH["ExitPrice"]!==undefined) row[dH["ExitPrice"]] = avgExit;
    if (dH["ExitValue"]!==undefined) row[dH["ExitValue"]] = exitValue;
    if (dH["PnL"]!==undefined) row[dH["PnL"]] = totalPnL;
    if (dH["PnLPercent"]!==undefined) row[dH["PnLPercent"]] = pnlPct;
    if (dH["LegsCount"]!==undefined) row[dH["LegsCount"]] = entries.length;
    if (dH["ExitsCount"]!==undefined) row[dH["ExitsCount"]] = exits.length; // optional column
    if (dH["CompletedTimestamp"]!==undefined) row[dH["CompletedTimestamp"]] = _now();
    doneSh.appendRow(row);

    // Optional: write per-leg to CompletedTradeLegs if sheet exists
    const ctl = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CompletedTradeLegs");
    if (ctl) {
      const headers = ctl.getDataRange().getValues()[0];
      const h = _idxMap(headers);
      exits.forEach((ex, idx) => {
        const qty = Number(ex.row[H["Qty"]]) || 0;
        const exitPrice  = Number(ex.row[H["ExitPrice"]]) || 0;
        const exitTotal  = qty * exitPrice;
        // Use avgEntry for leg PnL attribution
        const pnl        = qty * (exitPrice - avgEntry) * sign;

        const row = headers.map(()=> "");
        if (h["TradeID"]!==undefined) row[h["TradeID"]] = tradeId;
        if (h["RoundNumber"]!==undefined) row[h["RoundNumber"]] = round;
        if (h["Team"]!==undefined) row[h["Team"]] = team;
        if (h["PlayerID"]!==undefined) row[h["PlayerID"]] = playerID;
        if (h["Player"]!==undefined) row[h["Player"]] = player;
        if (h["Scrip"]!==undefined) row[h["Scrip"]] = scrip;
        if (h["PositionType"]!==undefined) row[h["PositionType"]] = positionType;
        if (h["LegIndex"]!==undefined) row[h["LegIndex"]] = idx+1;
        if (h["Qty"]!==undefined) row[h["Qty"]] = qty;
        if (h["EntryPrice"]!==undefined) row[h["EntryPrice"]] = avgEntry; // aggregated basis
        if (h["EntryTotal"]!==undefined) row[h["EntryTotal"]] = qty * avgEntry;
        if (h["ExitPrice"]!==undefined) row[h["ExitPrice"]] = exitPrice;
        if (h["ExitTotal"]!==undefined) row[h["ExitTotal"]] = exitTotal;
        if (h["PnL"]!==undefined) row[h["PnL"]] = pnl;
        if (h["CompletedTimestamp"]!==undefined) row[h["CompletedTimestamp"]] = _now();
        ctl.appendRow(row);
      });
    }

    // Wallet update (add net PnL)
    const {sh:standSh, headers:standH, rows:standRows} = _getAll_("StandingsPlayer");
    const sH = _idxMap(standH);
    const idx = standRows.findIndex(r => String(r[sH["PlayerID"]])===String(playerID));
    if (idx>=0) {
      const cur = Number(standRows[idx][sH["WalletBalance"]]) || 0;
      standSh.getRange(idx+2, sH["WalletBalance"]+1).setValue(cur + totalPnL);
      if (dH["WalletBalanceAfterTrade"] !== undefined) {
        const lastRow = doneSh.getLastRow();
        doneSh.getRange(lastRow, dH["WalletBalanceAfterTrade"]+1).setValue(cur + totalPnL);
      }
    }

    // Delete ALL rows (entries + exits) for this TradeID from ActiveTrades
    const {rows: allRows} = _getAll_(ACTIVE_TRADES_SHEET);
    const rowsToDelete = allRows.map((row, idx)=>({row, idx1: idx+2}))
      .filter(x => String(x.row[H["TradeID"]])===String(tradeId))
      .map(x => x.idx1)
      .sort((a,b)=>b-a);
    rowsToDelete.forEach(rn => sh.deleteRow(rn));

    return _jsonOk({ PnL: totalPnL });
  }

  /** ---- EXISTING: closeTrade (legacy single-leg close) ---- */
  if (action === "closeTrade") {
    const tradeId = e.parameter.TradeID;
    const exitPrice = parseFloat(e.parameter.ExitPrice);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getSheetByName("ActiveTrades");
    const completedSheet = ss.getSheetByName("CompletedTrades");
    const standingsSheet = ss.getSheetByName("StandingsPlayer");

    const activeData = activeSheet.getDataRange().getValues();
    const activeHeaders = activeData[0];
    const indexes = Object.fromEntries(activeHeaders.map((h, i) => [h, i]));

    for (let i = 1; i < activeData.length; i++) {
      const row = activeData[i];
      if (row[indexes["TradeID"]] === tradeId) {
        const qty = parseFloat(row[indexes["Qty"]]);
        const entryPrice = parseFloat(row[indexes["EntryPrice"]]);
        const position = row[indexes["PositionType"]];
        const playerID = row[indexes["PlayerID"]];

        const exitTotal = qty * exitPrice;
        const pnl = position.toLowerCase() === "long"
          ? (exitPrice - entryPrice) * qty
          : (entryPrice - exitPrice) * qty;

        activeSheet.getRange(i + 1, indexes["ExitPrice"] + 1).setValue(exitPrice);
        activeSheet.getRange(i + 1, indexes["ExitTotal"] + 1).setValue(exitTotal);
        activeSheet.getRange(i + 1, indexes["PnL"] + 1).setValue(pnl);
        activeSheet.getRange(i + 1, indexes["IsClosed"] + 1).setValue("TRUE");
        activeSheet.getRange(i + 1, indexes["IsSuccess"] + 1).setValue(pnl > 0 ? "TRUE" : "FALSE");

        const standingsData = standingsSheet.getDataRange().getValues();
        const standingsHeaders = standingsData[0];
        const standingsIndexes = Object.fromEntries(standingsHeaders.map((h, i) => [h, i]));

        for (let j = 1; j < standingsData.length; j++) {
          if (standingsData[j][standingsIndexes["PlayerID"]] === playerID) {
            let wallet = parseFloat(standingsData[j][standingsIndexes["WalletBalance"]]) || 0;
            wallet += pnl;
            standingsSheet.getRange(j + 1, standingsIndexes["WalletBalance"] + 1).setValue(wallet);

            const completedHeaders = completedSheet.getRange(1, 1, 1, completedSheet.getLastColumn()).getValues()[0];
            const completedIndexes = Object.fromEntries(completedHeaders.map((h, i) => [h, i]));
            const completedRow = completedHeaders.map((header, k) => {
              if (header in e.parameter) {
                if (header === "PnLPercent") return parseFloat(e.parameter[header]).toFixed(2);
                return e.parameter[header];
              }
              if (header in indexes) return row[indexes[header]];
              return "";
            });

            completedRow[completedIndexes["ExitPrice"]] = exitPrice;
            completedRow[completedIndexes["ExitValue"]] = exitTotal;
            completedRow[completedIndexes["PnL"]] = pnl;
            completedRow[completedIndexes["WalletBalanceAfterTrade"]] = wallet;
            completedRow[completedIndexes["CompletedTimestamp"]] = new Date();

            completedSheet.appendRow(completedRow);

            // delete the closed row from ActiveTrades
            SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ActiveTrades").deleteRow(i+1);

            return ContentService.createTextOutput("Trade closed and wallet updated.");
          }
        }
        return ContentService.createTextOutput("Player not found in standings.");
      }
    }
    return ContentService.createTextOutput("Trade ID not found.");
  }

  /** ---- EXISTING: startNextRound ---- */
  if (action === "startNextRound") {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roundsSheet = ss.getSheetByName("RoundsMeta");
    const standingsSheet = ss.getSheetByName("StandingsPlayer");

    const capital = parseFloat(e.parameter.capital);
    if (isNaN(capital) || capital <= 0) return ContentService.createTextOutput("Invalid capital value.");

    const roundsData = roundsSheet.getDataRange().getValues();
    const headers = roundsData[0];
    const roundIndex = headers.indexOf("RoundNumber");
    const capitalIndex = headers.indexOf("CapitalPerPlayer");

    const lastRoundRow = roundsData[roundsData.length - 1];
    const nextRound = parseInt(lastRoundRow[roundIndex]) + 1;

    roundsSheet.appendRow([nextRound, new Date(), capital]);

    const standingsData = standingsSheet.getDataRange().getValues();
    const standingsHeaders = standingsData[0];
    const walletIndex = standingsHeaders.indexOf("WalletBalance");

    for (let i = 1; i < standingsData.length; i++) {
      let current = parseFloat(standingsData[i][walletIndex]) || 0;
      standingsSheet.getRange(i + 1, walletIndex + 1).setValue(current + capital);
    }
    return ContentService.createTextOutput("Next round added and wallets updated.");
  }

  /** ---- EXISTING: generic add (legacy) + nextRound ---- */
  // (kept as-is from your earlier code)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getSheetByName("ActiveTrades");
  const completedSheet = ss.getSheetByName("CompletedTrades");
  const standingsSheet = ss.getSheetByName("StandingsPlayer");

  // If someone posts with action "nextRound" (legacy)
  if (action === "nextRound") {
    const roundsSheet = ss.getSheetByName("RoundsMeta");
    const standingsSheet2 = ss.getSheetByName("StandingsPlayer");

    const roundsData = roundsSheet.getDataRange().getValues();
    const lastRound = parseInt(roundsData[roundsData.length - 1][0]);
    const newRound = lastRound + 1;
    const capitalPerPlayer = parseFloat(roundsData[roundsData.length - 1][2]);

    const today = new Date();
    roundsSheet.appendRow([newRound, today, capitalPerPlayer]);

    const standingsData = standingsSheet2.getDataRange().getValues();
    const headers = standingsData[0];
    const walletIndex = headers.indexOf("WalletBalance");

    for (let i = 1; i < standingsData.length; i++) {
      let currentWallet = parseFloat(standingsData[i][walletIndex]) || 0;
      let updatedWallet = currentWallet + capitalPerPlayer;
      standingsSheet2.getRange(i + 1, walletIndex + 1).setValue(updatedWallet);
    }
    return ContentService.createTextOutput("Next round added and wallets updated.");
  }

  // ===== IMPORTANT: Stop falling into legacy "add trade" for unknown actions =====
  if (action === "legacyAddTrade") {
    const headers = activeSheet.getRange(1, 1, 1, activeSheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(header => e.parameter[header] || "");
    const qty = parseFloat(e.parameter.Qty);
    const entryPrice = parseFloat(e.parameter.EntryPrice);
    const entryTotal = qty * entryPrice;
    const tradeId = Utilities.getUuid();

    const indexes = Object.fromEntries(headers.map((h, i) => [h, i]));
    newRow[indexes["TradeID"]] = tradeId;
    newRow[indexes["EntryTotal"]] = entryTotal;
    newRow[indexes["IsClosed"]] = "FALSE";

    const player = e.parameter.Player;
    const standingsData = standingsSheet.getDataRange().getValues();
    const standingsHeaders = standingsData[0];
    const standingsIndexes = Object.fromEntries(standingsHeaders.map((h, i) => [h, i]));

    for (let j = 1; j < standingsData.length; j++) {
      if (standingsData[j][standingsIndexes["PlayerID"]] === player) {
        let wallet = parseFloat(standingsData[j][standingsIndexes["WalletBalance"]]) || 0;
        wallet -= entryTotal;
        standingsSheet.getRange(j + 1, standingsIndexes["WalletBalance"] + 1).setValue(wallet);
        break;
      }
    }

    activeSheet.appendRow(newRow);
    return ContentService.createTextOutput("Trade added and wallet updated.");
  }

  // Unknown action
  return _jsonBad("Unknown action.");
}

/** Utility */
function testSheetExists() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("RoundsMeta");
  Logger.log(sheet);
}
