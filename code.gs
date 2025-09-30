/***** ATrL Web App Backend (Code.gs) *****
 * Tabs expected (header row must match exactly):
 * CONFIG | Wallets | WalletTxns | Leagues | Seasons | RoundsMeta
 * Teams | Players | Scrips | Positions | Legs
 * (Optional: ScripPrices | Tags | FXRates)
 *
 * All reads/writes use HEADER NAMES (never column numbers).
 */

/* ========= HTTP ENTRY ========= */
function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || "{}");
    var mode = req.mode;
    var p = req.payload || {};
    var out = router(mode, p);
    return ContentService
      .createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ========= ROUTER ========= */
function router(mode, p) {
  if (mode === "getHomeData")               return getHomeData(p.leagueIds || []);
  if (mode === "getConfig")                  return getConfig();
  if (mode === "getLookups")                 return getLookups();
  if (mode === "getRoundsMeta")              return getRoundsMeta(p.leagueIds || []);
  if (mode === "getAddPageInit")             return getAddPageInit(p.leagueIds || []);
  if (mode === "getExposureSummary")         return getExposureSummary(p.leagueIds || []);
  if (mode === "createPositionWithEntry")    return createPositionWithEntry(p);
  if (mode === "getStandings")               return getStandings(p.leagueIds || [], p.scope || "league");
  if (mode === "getScripsStats")             return getScripsStats(p.leagueIds || []);
  if (mode === "getScripDetail")             return getScripDetail(p.scripId || "", p.leagueIds || []);
  if (mode === "getWalletOverview")          return getWalletOverview(p.leagueIds || []);
  if (mode === "addWalletTxn")               return addWalletTxn(p);
  if (mode === "addLeg")                     return addLeg(p);
  if (mode === "closePosition")              return closePosition(p.positionId || "");
  if (mode === "updatePosition")              return updatePosition(p);
  if (mode === "getPlayerDetail")            return getPlayerDetail(p.playerId || "", p.leagueIds || []);
  if (mode === "updateLeg")                  return updateLeg(p);
  if (mode === "deleteLeg")                  return deleteLeg(p.legId || "");
  if (mode === "getTeamDetail")              return getTeamDetail(p.teamId || "", p.leagueIds || []);
  if (mode === "executeLeg")               return executeLeg(p.legId || "");
  if (mode === "cancelLeg")                return cancelLeg(p.legId || "");
  if (mode === "deletePosition")             return deletePosition(p.positionId || "");
  throw new Error("Unknown mode: " + mode);
}


/* ========= GENERAL HELPERS ========= */
function sheet(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error("Missing sheet: " + name);
  return sh;
}
function readAll(name) {
  return sheet(name).getDataRange().getValues();
}
function headerMap(name) {
  var hdr = readAll(name)[0] || [];
  var map = {};
  hdr.forEach(function(h, i) { map[String(h).trim()] = i; });
  return map;
}
function rowsToObjs(name) {
  var rows = readAll(name);
  if (rows.length < 2) return [];
  var map = headerMap(name);
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var obj = {};
    for (var k in map) obj[k] = rows[i][map[k]];
    out.push(obj);
  }
  return out;
}
function appendRowByObj(name, obj) {
  var sh = sheet(name);
  var hdr = readAll(name)[0];
  var map = headerMap(name);
  var row = new Array(hdr.length).fill("");
  Object.keys(obj).forEach(function(k) {
    if (map.hasOwnProperty(k)) row[map[k]] = obj[k];
  });
  sh.appendRow(row);
  return row;
}
function nowISO() {
  return new Date().toISOString(); // UTC ISO; frontend formats to IST
}
function isExecuted(leg) {
  return String(leg.LegStatus || "Executed").trim().toLowerCase() === "executed";
}

function updateRowByObj(name, keyColName, keyVal, updates) {
  var sh = sheet(name), rows = sh.getDataRange().getValues();
  if (rows.length < 2) throw new Error("No data in " + name);
  var hdr = rows[0], map = headerMap(name);
  var keyIdx = map[keyColName];
  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][keyIdx]) === String(keyVal)) {
      var row = rows[r].slice();
      Object.keys(updates).forEach(function(k){
        if (k in map) row[map[k]] = updates[k];
      });
      sh.getRange(r+1, 1, 1, hdr.length).setValues([row]);
      return true;
    }
  }
  return false;
}
function findRowIndexByKey(name, keyColName, keyVal) {
  var sh = sheet(name), rows = sh.getDataRange().getValues();
  if (rows.length < 2) return -1;
  var map = headerMap(name);
  var keyIdx = map[keyColName];
  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][keyIdx]) === String(keyVal)) return r+1; // 1-based for sheet
  }
  return -1;
}
function deleteRowByKey(name, keyColName, keyVal) {
  var sh = sheet(name);
  var idx = findRowIndexByKey(name, keyColName, keyVal);
  if (idx > 0) { sh.deleteRow(idx); return true; }
  return false;
}
function recomputePositionStatus(positionId) {
  var positions = rowsToObjs("Positions");
  var pos = positions.find(function(p){ return String(p.PositionID)===String(positionId); });
  if (!pos) return;

  var legs = rowsToObjs("Legs").filter(function(l){ return String(l.PositionID)===String(positionId); });
  var qIn  = legs.filter(function(l){return l.LegType==="Entry" && isExecuted(l);})
                 .reduce(function(a,l){return a+Number(l.Qty||0);},0);
  var qOut = legs.filter(function(l){return l.LegType==="Exit"  && isExecuted(l);})
                 .reduce(function(a,l){return a+Number(l.Qty||0);},0);
  var openQty = qIn - qOut;

  if (openQty > 0) {
    updateRowByObj("Positions", "PositionID", positionId, { Status: "Open", CloseTimestamp: "" });
  }
  // if openQty === 0 → leave Status as-is; user will click Close
}



function generateId(prefix) {
  // timestamp + 4 random chars (safe for concurrent calls)
  var rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prefix + "-" + Date.now() + "-" + rand;
}

/* ========= MODES ========= */

// 1) CONFIG as key-value map
function getConfig() {
  var rows = readAll("CONFIG");
  if (rows.length < 2) return {};
  var obj = {};
  for (var i = 1; i < rows.length; i++) {
    obj[rows[i][0]] = rows[i][1];
  }
  return obj;
}

// 2) Lookups for front-end selects (leagues / players / teams / scrips / seasons)
function getLookups() {
  const leagues = rowsToObjs("Leagues");
  const players = rowsToObjs("Players");
  const teams   = rowsToObjs("Teams");
  const scrips  = rowsToObjs("Scrips");
  const seasons = rowsToObjs("Seasons");
  let tags = [];
  try { tags = rowsToObjs("Tags"); } catch(e) { tags = []; }
  return { leagues, players, teams, scrips, seasons, tags };
}


// 3) Rounds meta (joins LeagueName for display)
function getRoundsMeta(leagueIds) {
  var rows = rowsToObjs("RoundsMeta");
  var leagues = rowsToObjs("Leagues");
  var mapL = {};
  leagues.forEach(function(l){ mapL[l.LeagueID] = l.LeagueName; });
  return rows
    .filter(function(r){ return (!leagueIds.length) || leagueIds.indexOf(r.LeagueID) !== -1; })
    .map(function(r){ r.LeagueName = mapL[r.LeagueID] || r.LeagueID; return r; });
}

// 4) Add Page Init: compute TT (positions count), weighted PnL% for each player
function getAddPageInit(leagueIds) {
  var positions = rowsToObjs("Positions")
    .filter(function(p){ return (!leagueIds.length) || leagueIds.indexOf(p.LeagueID) !== -1; });
  var legs = rowsToObjs("Legs");
  var players = rowsToObjs("Players");

  var posById = {};
  positions.forEach(function(p){ posById[p.PositionID] = p; });

  // init per player
  var agg = {};
  players.forEach(function(pl){
    agg[pl.PlayerID] = {
      PlayerID: pl.PlayerID,
      PlayerName: pl.PlayerName,
      TeamID: pl.TeamID,
      QueueOrder: Number(pl.QueueOrder || 999),
      RiskTrait: pl.RiskTrait,
      TT: 0,
      _posSeen: {},
      _notional: 0,
      _pnl: 0,
      PnLPct: 0
    };
  });

  legs.forEach(function(l){
    var pos = posById[l.PositionID]; if (!pos) return;
    var a = agg[pos.PlayerID];       if (!a)   return;
    if (l.LegType === "Entry" && isExecuted(l)) {
      a._posSeen[pos.PositionID] = true;
      a._notional += Number(l.Total || 0);
    } else if (l.LegType === "Exit" && isExecuted(l)) {
      a._pnl += Number(l.RealizedPnl || 0);
    }
  });


  Object.keys(agg).forEach(function(key){
    var a = agg[key];
    a.TT = Object.keys(a._posSeen).length;                 // total positions with entries
    a.PnLPct = a._notional ? (a._pnl / a._notional) * 100 : 0;
    delete a._posSeen; delete a._notional; delete a._pnl;
  });

  return { playersStats: Object.values(agg) };
}

// 5) Exposure & concurrency gating (sum of entry totals on open positions)
function getExposureSummary(leagueIds) {
  var leagues = rowsToObjs("Leagues")
    .filter(function(l){ return (!leagueIds.length) || leagueIds.indexOf(l.LeagueID) !== -1; });

  var wallets = rowsToObjs("Wallets"); var walletById = {};
  wallets.forEach(function(w){ walletById[w.WalletID] = w; });

  var positions = rowsToObjs("Positions")
    .filter(function(p){ return (!leagueIds.length) || leagueIds.indexOf(p.LeagueID) !== -1; });

  var legs = rowsToObjs("Legs").filter(isExecuted);
  var legsByPos = {};
  positions.forEach(function(p){ legsByPos[p.PositionID] = []; });
  legs.forEach(function(l){ if (legsByPos[l.PositionID]) legsByPos[l.PositionID].push(l); });

  // Only count positions with open executed qty > 0
  var openExposure = 0, openCount = 0;
  Object.keys(legsByPos).forEach(function(pid){
    var L = legsByPos[pid];
    var Ein = L.filter(function(x){ return x.LegType==="Entry"; });
    var Eout= L.filter(function(x){ return x.LegType==="Exit";  });
    var qIn = Ein.reduce(function(a,x){ return a+Number(x.Qty||0); },0);
    var qOut= Eout.reduce(function(a,x){ return a+Number(x.Qty||0); },0);
    var openQty = qIn - qOut;
    if (openQty > 0) {
      var totIn = Ein.reduce(function(a,x){ return a+Number(x.Total||0); },0);
      var avgIn = qIn ? (totIn / qIn) : 0;
      openExposure += avgIn * openQty;
      openCount += 1;
    }
  });

  var maxExposure = 0, maxConcurrent = 0;
  leagues.forEach(function(l){
    var w = walletById[l.WalletID]; if (!w) return;
    var eq = Number(w.StartBalance || 0);
    maxExposure    += eq * Number(w.LeverageMultiple || 1);
    maxConcurrent  += Number(w.MaxConcurrentPositions || 0);
  });

  var block = (openCount >= maxConcurrent) || (openExposure > maxExposure);
  return {
    block: block,
    reason: block ? "Exposure/Concurrency limit" : "",
    openExposure: openExposure,
    maxExposure: maxExposure,
    openCount: openCount,
    maxConcurrent: maxConcurrent
  };
}


// 6) Create a new Position and its first Entry leg
function createPositionWithEntry(p) {
  // Validate inputs
  if (!p || !p.playerId)       throw new Error("Missing playerId");
  if (!p || !p.scripName)      throw new Error("Missing scrip name");
  if (!p || !p.side)           throw new Error("Missing side (Long/Short)");
  if (!p || !p.entry)          throw new Error("Missing entry price");

  // Resolve scrip by name (case-insensitive)
  var scrips = rowsToObjs("Scrips");
  var s = scrips.find(function(x){ return String(x.ScripName).toLowerCase() === String(p.scripName).toLowerCase(); });
  if (!s) throw new Error("Unknown scrip: " + p.scripName);

  // Resolve latest round among selected leagues
  var rounds = rowsToObjs("RoundsMeta").filter(function(r){ return (p.leagues || []).indexOf(r.LeagueID) !== -1; });
  if (!rounds.length) throw new Error("No active round for selected leagues");
  rounds.sort(function(a,b){ return new Date(b.StartDate) - new Date(a.StartDate); });
  var R = rounds[0];

  // Resolve player and team
  var players = rowsToObjs("Players");
  var pl = players.find(function(x){ return x.PlayerID === p.playerId; });
  if (!pl) throw new Error("Unknown player: " + p.playerId);
  var team = rowsToObjs("Teams").find(function(t){ return t.TeamID === pl.TeamID; });

  // Create position
  var positionId = generateId("POS");
  appendRowByObj("Positions", {
    PositionID: positionId,
    SeasonID: R.SeasonID,
    LeagueID: R.LeagueID,
    RoundNumber: R.RoundNumber,
    PlayerID: pl.PlayerID,
    TeamID: team ? team.TeamID : "",
    ScripID: s.ScripID,
    Side: p.side,
    PositionTP: p.positionTP || "",
    PositionSL: p.positionSL || "",
    Tags: Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags || ""),
    OpenTimestamp: nowISO(),
    CloseTimestamp: "",
    Status: "Open"
  });

  // First entry leg
  var qty   = (p.qty   != null && p.qty   !== "") ? String(p.qty)   : "0";
  var total = (p.total != null && p.total !== "") ? String(p.total) : String(Number(qty) * Number(p.entry || 0));
  var legId = generateId("LEG");

  var inOrder = !!p.inOrder; // if true -> place as pending order
  appendRowByObj("Legs", {
    LegID: legId,
    PositionID: positionId,
    LegType: "Entry",
    Qty: qty,
    Price: String(p.entry),
    Total: total,
    Timestamp: nowISO(),        // created time
    ExecTimestamp: inOrder ? "" : nowISO(), // when actually executed
    LegStatus: inOrder ? "InOrder" : "Executed",
    ExitType: "",
    RR: String(p.rr || ""),
    RealizedPnl: "",
    RealizedPnlPct: ""
  });

  return { ok: true, positionId: positionId, legId: legId };
}

// 7) Home data for index.html: open positions, last 5 exits, wallet + exposure
// ---------- Home data: open positions, last 5 exits, wallet snapshot(s)
// ---------- Home data: open positions, recent exits, wallet cards
function getHomeData(leagueIds) {
  // lookups
  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  var teams = rowsToObjs("Teams"); var teamById = {};
  teams.forEach(function(t){ teamById[t.TeamID] = t; });

  var players = rowsToObjs("Players"); var playerById = {};
  players.forEach(function(p){ playerById[p.PlayerID] = p; });

  var scrips = rowsToObjs("Scrips"); var scripById = {};
  scrips.forEach(function(s){ scripById[s.ScripID] = s; });

  // positions in selected leagues that are NOT 'Closed'
  var positions = rowsToObjs("Positions").filter(function(p){
    var inSel = (!leagueIds.length) || leagueIds.indexOf(p.LeagueID) !== -1;
    return inSel && String(p.Status) !== "Closed";
  });

  // for "lastExits" we consider ALL positions in selected leagues (even closed)
  var positionsAll = rowsToObjs("Positions").filter(function(p){
    return (!leagueIds.length) || leagueIds.indexOf(p.LeagueID) !== -1;
  });
  var posIdAllowed = {};
  positionsAll.forEach(function(p){ posIdAllowed[p.PositionID] = true; });

  // legs
  var legs = rowsToObjs("Legs");

  // group legs by position
  var legsByPos = {}; positions.forEach(function(p){ legsByPos[p.PositionID] = []; });
  legs.forEach(function(l){ if (legsByPos.hasOwnProperty(l.PositionID)) legsByPos[l.PositionID].push(l); });

  function sum(arr, f){ return arr.reduce(function(a,x){ return a + Number(f(x) || 0); }, 0); }

  var openPositions = positions.map(function(p){
    var L = legsByPos[p.PositionID] || [];
    var Eexec = L.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    var Xexec = L.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var qtyIn   = sum(Eexec, function(l){ return l.Qty; });
    var qtyOut  = sum(Xexec, function(l){ return l.Qty; });
    var openQty = qtyIn - qtyOut;

    var notional = sum(Eexec, function(l){ return l.Total; });
    var realized = sum(Xexec, function(l){ return l.RealizedPnl; });
    var realizedPct = notional ? (realized / notional) * 100 : 0;
    var avgEntry = qtyIn ? (notional / qtyIn) : 0;

    // expose ALL legs (entries + exits), with status field and an IsExit flag
    var orders = L.map(function(l){
      return {
        LegID: l.LegID,
        IsExit: String(l.LegType)==="Exit",
        LegType: l.LegType,
        Qty: Number(l.Qty || 0),
        Price: Number(l.Price || 0),
        Total: Number(l.Total || 0),
        LegStatus: String(l.LegStatus || (isExecuted(l) ? "Executed" : "InOrder")),
        Timestamp: l.Timestamp || "",
        ExecTimestamp: l.ExecTimestamp || "",
        ExitType: l.ExitType || "",
        RealizedPnl: Number(l.RealizedPnl || 0),
        RealizedPnlPct: Number(l.RealizedPnlPct || 0)
      };
    });

    return {
      PositionID: p.PositionID,
      LeagueID: p.LeagueID,
      LeagueName: (leagueById[p.LeagueID] && leagueById[p.LeagueID].LeagueName) || p.LeagueID,
      TeamID: p.TeamID,
      TeamName: (teamById[p.TeamID] && teamById[p.TeamID].TeamName) || p.TeamID,
      PlayerID: p.PlayerID,
      PlayerName: (playerById[p.PlayerID] && playerById[p.PlayerID].PlayerName) || p.PlayerID,
      ScripID: p.ScripID,
      ScripName: (scripById[p.ScripID] && scripById[p.ScripID].ScripName) || p.ScripID,
      Side: p.Side,
      Tags: p.Tags || "",
      PositionSL: p.PositionSL || "",
      PositionTP: p.PositionTP || "",
      OpenTimestamp: p.OpenTimestamp,
      CloseTimestamp: p.CloseTimestamp,
      Status: p.Status,
      AvgEntry: avgEntry,
      OpenQty: openQty,
      RealizedPnL: realized,
      RealizedPnLPct: realizedPct,
      Orders: orders
    };
  });

  // last 5 executed exits within selected leagues (any status)
  var lastExits = legs.filter(function(l){
    if (String(l.LegType) !== "Exit") return false;
    if (!isExecuted(l)) return false;
    return !!posIdAllowed[l.PositionID];
  }).map(function(l){
    var p = positionsAll.find(function(pp){ return String(pp.PositionID)===String(l.PositionID); }) || {};
    return {
      PositionID: l.PositionID,
      PlayerID: p.PlayerID || "",
      PlayerName: (playerById[p.PlayerID] && playerById[p.PlayerID].PlayerName) || (p.PlayerID || ""),
      ScripID: p.ScripID || "",
      ScripName: (scripById[p.ScripID] && scripById[p.ScripID].ScripName) || (p.ScripID || ""),
      Side: String(p.Side || "Long"),
      Timestamp: l.ExecTimestamp || l.Timestamp || "",
      ExitType: l.ExitType || "",
      RealizedPnl: Number(l.RealizedPnl || 0),
      RealizedPnlPct: Number(l.RealizedPnlPct || 0)
    };
  }).sort(function(a,b){ return new Date(b.Timestamp) - new Date(a.Timestamp); }).slice(0,5);

  // wallet cards via existing function
  var w = getWalletOverview(leagueIds);
  var wallets = (w && w.wallets) ? w.wallets : [];

  return { openPositions: openPositions, lastExits: lastExits, wallets: wallets };
}

function deletePosition(positionId) {
  if (!positionId) throw new Error("Missing positionId");

  // Delete all Legs for this position
  var sh = sheet("Legs");
  var rows = sh.getDataRange().getValues();
  var map = headerMap("Legs");
  var toDelete = [];
  for (var r=1; r<rows.length; r++) {
    if (String(rows[r][map["PositionID"]]) === String(positionId)) {
      toDelete.push(r+1); // 1-based
    }
  }
  // delete bottom-up
  for (var i=toDelete.length-1; i>=0; i--) {
    sh.deleteRow(toDelete[i]);
  }

  // Delete the Position row
  deleteRowByKey("Positions", "PositionID", positionId);

  return { ok: true, positionId: positionId };
}

// -------- Standings: returns teams & players tables sorted by PnL%
// scope: "league" -> values in league currency (per leagueIds)
//        "master" -> convert all PnL & notional to CONFIG.master-pnl-currency (e.g., INR)
// -------- Standings: teams + players
// scope: "league" (default) → aggregate within selected leagues
//        "master" → aggregate across selected leagues and convert to CONFIG.master-pnl-currency via FXRates
function getStandings(leagueIds, scope) {
  scope = scope || "league";

  // lookups
  var config = {};
  try {
    var cfg = readAll("CONFIG");
    for (var i=1;i<cfg.length;i++) config[cfg[i][0]] = cfg[i][1];
  } catch(e){}
  var baseCcy = String(config["master-pnl-currency"] || "INR").toUpperCase();

  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  var wallets = []; try { wallets = rowsToObjs("Wallets"); } catch(e){ wallets = []; }
  var walletById = {}; wallets.forEach(function(w){ walletById[w.WalletID] = w; });

  var teams = rowsToObjs("Teams"); var teamById = {};
  teams.forEach(function(t){ teamById[t.TeamID] = t; });

  var players = rowsToObjs("Players"); var playerById = {};
  players.forEach(function(p){ playerById[p.PlayerID] = p; });

  var positions = rowsToObjs("Positions").filter(function(p){
    return (!leagueIds.length) || leagueIds.indexOf(p.LeagueID)!==-1;
  });
  var legs = rowsToObjs("Legs");

  // FX map
  var fx = []; try { fx = rowsToObjs("FXRates"); } catch(e){ fx = []; }
  // Build quick lookup for direct pairs
  var fxMap = {}; // key "BASE>QUOTE" → rate
  fx.forEach(function(r){
    var k = String(r.Base).toUpperCase() + ">" + String(r.Quote).toUpperCase();
    fxMap[k] = Number(r.Rate || 0);
  });
  function convertAmt(amt, fromCcy, toCcy) {
    fromCcy = String(fromCcy||"").toUpperCase();
    toCcy   = String(toCcy||"").toUpperCase();
    if (!isFinite(amt) || !amt || fromCcy===toCcy) return Number(amt||0);
    var k1 = fromCcy + ">" + toCcy;
    if (fxMap[k1]) return amt * fxMap[k1];
    var k2 = toCcy + ">" + fromCcy;
    if (fxMap[k2]) return amt / fxMap[k2];
    // try a simple USD bridge if available
    if (fromCcy!=="USD" && toCcy!=="USD") {
      var kA = fromCcy + ">USD", kB = "USD>" + toCcy;
      if (fxMap[kA] && fxMap[kB]) return amt * fxMap[kA] * fxMap[kB];
      var kA2 = "USD>" + fromCcy, kB2 = toCcy + ">USD";
      if (fxMap[kA2] && fxMap[kB2]) return amt / fxMap[kA2] / fxMap[kB2];
    }
    // no rate found → return as-is (best effort)
    return Number(amt||0);
  }
  function leagueCurrency(lid) {
    var L = leagueById[lid] || {};
    var c = (L.Currency || "").toString().trim();
    if (!c && L.WalletID && walletById[L.WalletID]) c = walletById[L.WalletID].Currency || "";
    return (c || "USDT").toUpperCase();
  }

  // group legs by position
  var legsByPos = {}; positions.forEach(function(p){ legsByPos[p.PositionID] = []; });
  legs.forEach(function(l){ if (legsByPos.hasOwnProperty(l.PositionID)) legsByPos[l.PositionID].push(l); });

  // aggregators
  var teamAgg = {}; // teamId → stats
  var playerAgg = {}; // playerId → stats
  function ensureTeam(tid) {
    if (!teamAgg[tid]) teamAgg[tid] = { TeamID: tid, TeamName: (teamById[tid]&&teamById[tid].TeamName)||tid,
      TT:0,Wins:0,Losses:0,_notional:0,_pnl:0, PnL:0,PnLPct:0, WinPct:0 };
    return teamAgg[tid];
  }
  function ensurePlayer(pid) {
    var pl = playerById[pid] || {};
    if (!playerAgg[pid]) playerAgg[pid] = { PlayerID: pid, PlayerName: pl.PlayerName || pid, TeamID: pl.TeamID || "",
      TeamName: (teamById[pl.TeamID] && teamById[pl.TeamID].TeamName) || pl.TeamID || "",
      TT:0,Wins:0,Losses:0,_notional:0,_pnl:0, PnL:0,PnLPct:0, WinPct:0 };
    return playerAgg[pid];
  }

  // walk positions → count a trade if it has ≥1 Entry
  for (var i=0;i<positions.length;i++){
    var p = positions[i];
    var Ls = legsByPos[p.PositionID] || [];
    var E  = Ls.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!E.length) continue;
    var X  = Ls.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var lid  = p.LeagueID;
    var ccy  = leagueCurrency(lid);

    var notional = E.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = X.reduce(function(a,l){ return a + Number(l.RealizedPnl||0); }, 0);

    // optionally convert to base currency for "master" scope
    var N = notional, P = pnl;
    if (scope === "master") {
      N = convertAmt(notional, ccy, baseCcy);
      P = convertAmt(pnl,      ccy, baseCcy);
    }

    // team
    var TA = ensureTeam(p.TeamID || "");
    TA.TT += 1; if (pnl>0) TA.Wins+=1; else if (pnl<0) TA.Losses+=1;
    TA._notional += N; TA._pnl += P;

    // player
    var PA = ensurePlayer(p.PlayerID || "");
    PA.TT += 1; if (pnl>0) PA.Wins+=1; else if (pnl<0) PA.Losses+=1;
    PA._notional += N; PA._pnl += P;
  }

  function finalize(obj) {
    var arr = Object.values(obj).map(function(x){
      var tot = x.Wins + x.Losses;
      x.WinPct = tot ? (x.Wins / tot) * 100 : 0;
      x.PnL    = x._pnl;
      x.PnLPct = x._notional ? (x._pnl / x._notional) * 100 : 0;
      delete x._pnl; delete x._notional;
      return x;
    }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });
    arr.forEach(function(x,i){ x.RankByPnLPct = i+1; });
    return arr;
  }

  var teamsOut   = finalize(teamAgg);
  var playersOut = finalize(playerAgg);

  return {
    scope: scope,
    baseCurrency: (scope==="master" ? baseCcy : ""),
    teams: teamsOut,
    players: playersOut
  };
}


// -------- Scrips: per-scrip stats (TT, W%, LW%, SW%, PnL, PnL%) sorted by PnL%
function getScripsStats(leagueIds) {
  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  var scrips = rowsToObjs("Scrips"); var scripById = {};
  scrips.forEach(function(s){ scripById[s.ScripID] = s; });

  var posAll = rowsToObjs("Positions").filter(function(p){
    return (!leagueIds.length) || leagueIds.indexOf(p.LeagueID) !== -1;
  });
  var legsAll = rowsToObjs("Legs");

  // group legs by position
  var legsByPos = {}; posAll.forEach(function(p){ legsByPos[p.PositionID] = []; });
  legsAll.forEach(function(l){ if (legsByPos.hasOwnProperty(l.PositionID)) legsByPos[l.PositionID].push(l); });

  // aggregator per scrip
  var S = {}; // keyed by ScripID
  function ensure(id) {
    if (!S[id]) S[id] = {
      ScripID: id, ScripName: (scripById[id] && scripById[id].ScripName) || id,
      TT:0, Wins:0, Losses:0, WinPct:0,
      LongTT:0, LongWins:0, LongLosses:0, LongWinPct:0,
      ShortTT:0, ShortWins:0, ShortLosses:0, ShortWinPct:0,
      PnL:0, PnLPct:0, _notional:0, _pnl:0
    };
    return S[id];
  }

  for (var i=0;i<posAll.length;i++) {
    var p = posAll[i];
    var id = p.ScripID;
    var A = ensure(id);

    var ls = legsByPos[p.PositionID] || [];
    var entries = ls.filter(function(l){ return l.LegType === "Entry" && isExecuted(l); });
    if (!entries.length) continue; // count trades with at least one entry
    var exits = ls.filter(function(l){ return l.LegType === "Exit" && isExecuted(l); });
    var notional = entries.reduce(function(a,l){ return a + Number(l.Total || 0); }, 0);
    var pnl      = exits.reduce(function(a,l){ return a + Number(l.RealizedPnl || 0); }, 0);

    // overall
    A.TT += 1;
    if (pnl > 0) A.Wins += 1; else if (pnl < 0) A.Losses += 1;
    A._notional += notional;
    A._pnl      += pnl;

    // by side
    var side = String(p.Side || "Long");
    if (side === "Short") {
      A.ShortTT += 1;
      if (pnl > 0) A.ShortWins += 1; else if (pnl < 0) A.ShortLosses += 1;
    } else {
      A.LongTT += 1;
      if (pnl > 0) A.LongWins += 1; else if (pnl < 0) A.LongLosses += 1;
    }
  }

  // finalize and sort
  var arr = Object.values(S);
  arr.forEach(function(x){
    var tot = x.Wins + x.Losses;
    x.WinPct = tot ? (x.Wins / tot) * 100 : 0;

    var ltot = x.LongWins + x.LongLosses;
    x.LongWinPct = ltot ? (x.LongWins / ltot) * 100 : 0;

    var stot = x.ShortWins + x.ShortLosses;
    x.ShortWinPct = stot ? (x.ShortWins / stot) * 100 : 0;

    x.PnL = x._pnl;
    x.PnLPct = x._notional ? (x._pnl / x._notional) * 100 : 0;

    delete x._pnl; delete x._notional;
  });

  arr.sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });
  arr.forEach(function(x,i){ x.RankByPnLPct = i+1; });

  return { scrips: arr };
}
// -------- Scrip Single: chips + totals + side stats + trade history (cards)
function getScripDetail(scripId, leagueIds) {
  var config = {};
  try {
    var rows = readAll("CONFIG"); for (var i=1;i<rows.length;i++) config[rows[i][0]] = rows[i][1];
  } catch(e) {}
  var chipMax = Number(config["scrip-chip-count"] || 12);

  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  var players = rowsToObjs("Players"); var playerById = {};
  players.forEach(function(p){ playerById[p.PlayerID] = p; });

  var teams = rowsToObjs("Teams"); var teamById = {};
  teams.forEach(function(t){ teamById[t.TeamID] = t; });

  var scrips = rowsToObjs("Scrips"); var scripById = {};
  scrips.forEach(function(s){ scripById[s.ScripID] = s; });

  var positionsAll = rowsToObjs("Positions").filter(function(p){
    return (!leagueIds.length) || leagueIds.indexOf(p.LeagueID) !== -1;
  });
  var legsAll = rowsToObjs("Legs");

  // ---- Build scrip leaderboard (for chips)
  var legsByPosAll = {}; positionsAll.forEach(function(p){ legsByPosAll[p.PositionID] = []; });
  legsAll.forEach(function(l){ if (legsByPosAll.hasOwnProperty(l.PositionID)) legsByPosAll[l.PositionID].push(l); });

  var agg = {}; // per scrip
  function ensureAgg(id) {
    if (!agg[id]) agg[id] = {_notional:0,_pnl:0,TT:0,Wins:0,Losses:0,LongTT:0,LongW:0,ShortTT:0,ShortW:0};
    return agg[id];
  }

  for (var i=0;i<positionsAll.length;i++) {
    var p = positionsAll[i];
    var ls = legsByPosAll[p.PositionID] || [];
    var entries = ls.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!entries.length) continue;
    var exits = ls.filter(function(l){ return l.LegType==="Exit" && isExecuted(l); });
    var notional = entries.reduce(function(a,l){ return a + Number(l.Total || 0); }, 0);
    var pnl      = exits.reduce(function(a,l){ return a + Number(l.RealizedPnl || 0); }, 0);

    var A = ensureAgg(p.ScripID);
    A._notional += notional; A._pnl += pnl; A.TT += 1;
    if (pnl > 0) A.Wins += 1; else if (pnl < 0) A.Losses += 1;
    if (String(p.Side||"Long") === "Short") { A.ShortTT += 1; if (pnl>0) A.ShortW += 1; }
    else { A.LongTT += 1; if (pnl>0) A.LongW += 1; }
  }

  var leaderboard = Object.keys(agg).map(function(id){
    var a = agg[id];
    var winPct = (a.Wins + a.Losses) ? (a.Wins/(a.Wins+a.Losses))*100 : 0;
    var longWin = a.LongTT ? (a.LongW/a.LongTT)*100 : 0;
    var shortWin = a.ShortTT ? (a.ShortW/a.ShortTT)*100 : 0;
    var pnlPct = a._notional ? (a._pnl/a._notional)*100 : 0;
    return {
      ScripID: id,
      ScripName: (scripById[id] && scripById[id].ScripName) || id,
      TT: a.TT, WinPct: winPct, LongWinPct: longWin, ShortWinPct: shortWin,
      PnL: a._pnl, PnLPct: pnlPct
    };
  });
  leaderboard.sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });

  // default scrip if none provided
  if (!scripId) scripId = leaderboard[0] ? leaderboard[0].ScripID : "";

  // ---- Build details for selected scrip
  var pos = positionsAll.filter(function(p){ return p.ScripID === scripId; });
  var legsByPos = {}; pos.forEach(function(p){ legsByPos[p.PositionID] = []; });
  legsAll.forEach(function(l){ if (legsByPos.hasOwnProperty(l.PositionID)) legsByPos[l.PositionID].push(l); });

  var totals = { TT:0, Wins:0, Losses:0, WinPct:0, PnL:0, PnLPct:0, LongTT:0, LongWinPct:0, ShortTT:0, ShortWinPct:0, _notional:0, _pnl:0 };
  var trades = [];

  function computeRR(side, avgEntry, SL, TP) {
    var e = Number(avgEntry||0), s = Number(SL||0), t = Number(TP||0);
    if (!e || !s || !t) return "";
    if (String(side||"Long")==="Long") {
      var risk = e - s, reward = t - e;
      if (risk<=0 || reward<=0) return "";
      return (reward/risk).toFixed(2);
    } else {
      var risk2 = s - e, reward2 = e - t;
      if (risk2<=0 || reward2<=0) return "";
      return (reward2/risk2).toFixed(2);
    }
  }

  for (var j=0;j<pos.length;j++) {
    var p = pos[j];
    var ls = legsByPos[p.PositionID] || [];
    var entries = ls.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!entries.length) continue;
    var exits   = ls.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var qtyIn   = entries.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var qtyOut  = exits.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var openQty = qtyIn - qtyOut;

    var notional = entries.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = exits.reduce(function(a,l){ return a + Number(l.RealizedPnl||0); }, 0);
    var avgEntry = qtyIn ? (notional / qtyIn) : 0;
    var pnlPct   = notional ? (pnl / notional) * 100 : 0;

    totals.TT += 1;
    if (pnl > 0) totals.Wins += 1; else if (pnl < 0) totals.Losses += 1;
    totals._notional += notional; totals._pnl += pnl;
    if (String(p.Side||"Long")==="Short") { totals.ShortTT += 1; if (pnl>0) totals.ShortWinPct += 1; }
    else { totals.LongTT += 1; if (pnl>0) totals.LongWinPct += 1; }

    trades.push({
      PositionID: p.PositionID,
      PlayerID: p.PlayerID,
      PlayerName: (playerById[p.PlayerID] && playerById[p.PlayerID].PlayerName) || p.PlayerID,
      TeamID: p.TeamID,
      TeamName: (teamById[p.TeamID] && teamById[p.TeamID].TeamName) || p.TeamID,
      Side: String(p.Side||"Long"),
      OpenTimestamp: p.OpenTimestamp,
      CloseTimestamp: p.CloseTimestamp,
      Status: p.Status,
      avgEntry: avgEntry,
      openQty: openQty,
      realizedPnl: pnl,
      realizedPnlPct: pnlPct,
      rr: computeRR(String(p.Side||"Long"), avgEntry, p.PositionSL, p.PositionTP),
      legs: ls
    });
  }

  var totWL = totals.Wins + totals.Losses;
  totals.WinPct = totWL ? (totals.Wins/totWL)*100 : 0;
  totals.PnL = totals._pnl;
  totals.PnLPct = totals._notional ? (totals._pnl/totals._notional)*100 : 0;
  totals.LongWinPct = totals.LongTT ? (totals.LongWinPct / totals.LongTT)*100 : 0;
  totals.ShortWinPct= totals.ShortTT ? (totals.ShortWinPct/ totals.ShortTT)*100 : 0;
  delete totals._pnl; delete totals._notional;

  // top N chips
  var scripChips = leaderboard.slice(0, chipMax).map(function(r){ return { ScripID:r.ScripID, ScripName:r.ScripName }; });

  return {
    selected: { ScripID: scripId, ScripName: (scripById[scripId] && scripById[scripId].ScripName) || scripId },
    totals: totals,
    trades: trades,
    scripChips: scripChips
  };
}
// ---- Wallet overview: per selected leagues' wallets
// Returns wallet cards (equity, stats, sparkline), player balances, and recent txns.
function getWalletOverview(leagueIds) {
  var tz = "Asia/Kolkata";
  try {
    var cfg = readAll("CONFIG");
    for (var i=1;i<cfg.length;i++) if (String(cfg[i][0])==="timezone") tz = cfg[i][1] || tz;
  } catch(e){}

  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  // which leagues are selected?
  var sel = leagues.filter(function(l){ return (!leagueIds.length) || leagueIds.indexOf(l.LeagueID)!==-1; });
  // group selected leagues by wallet
  var walletToLeagues = {};
  sel.forEach(function(l){
    if (!l.WalletID) return;
    if (!walletToLeagues[l.WalletID]) walletToLeagues[l.WalletID] = [];
    walletToLeagues[l.WalletID].push(l.LeagueID);
  });

  var wallets = rowsToObjs("Wallets"); var walletById = {};
  wallets.forEach(function(w){ walletById[w.WalletID] = w; });

  var players = rowsToObjs("Players"); var playerById = {};
  players.forEach(function(p){ playerById[p.PlayerID] = p; });
  var teams = rowsToObjs("Teams"); var teamById = {};
  teams.forEach(function(t){ teamById[t.TeamID] = t; });

  var positions = rowsToObjs("Positions");
  var legs = rowsToObjs("Legs");
  var txns = []; try { txns = rowsToObjs("WalletTxns"); } catch(e){ txns = []; }

  // helper to IST date string "yyyy-MM-dd"
  function dayIST(iso) {
    if (!iso) return "";
    return Utilities.formatDate(new Date(iso), tz, "yyyy-MM-dd");
  }

  // Build wallet cards
  var cards = [];
  Object.keys(walletToLeagues).forEach(function(walletId){
    var w = walletById[walletId]; if (!w) return;
    var leagueIdsForWallet = walletToLeagues[walletId];

    // events impacting equity = manual txns + realized PnL from exits in those leagues
    var events = [];

    // manual txns (positive/negative as stored)
    txns.forEach(function(t){
      if (t.WalletID !== walletId) return;
      var amt = Number(t.Amount || 0);
      var ts = t.AsOf || t.Timestamp || nowISO();
      events.push({ ts: ts, amount: amt, kind: "TXN", note: t.Type || "", playerId: t.PlayerID || "" });
    });

    // realized trade PnL from EXIT legs
    var posById = {}; positions.forEach(function(p){
      if (leagueIdsForWallet.indexOf(p.LeagueID)!==-1) posById[p.PositionID] = p;
    });
    legs.forEach(function(l){
    if (l.LegType !== "Exit" || !isExecuted(l)) return;
      var p = posById[l.PositionID]; if (!p) return;
      var amt = Number(l.RealizedPnl || 0);
      var ts = l.ExecTimestamp || l.Timestamp || nowISO();
      events.push({ ts: ts, amount: amt, kind: "TRADE", note: "Realized PnL", playerId: p.PlayerID || "" });
    });

    // sort by time, accumulate equity
    events.sort(function(a,b){ return new Date(a.ts) - new Date(b.ts); });
    var equity = Number(w.StartBalance || 0);
    var curve = [{ ts: null, equity: equity }]; // initial point
    for (var i=0;i<events.length;i++){
      equity += Number(events[i].amount || 0);
      curve.push({ ts: events[i].ts, equity: equity });
    }

    // sparkline points (last N)
    var N = 30;
    try {
      var cfg2 = readAll("CONFIG");
      for (var k=1;k<cfg2.length;k++) if (String(cfg2[k][0])==="sparkline-points") N = Number(cfg2[k][1] || 30);
    } catch(e){}
    var lastPoints = curve.slice(-N).map(function(pt){ return pt.equity; });
    if (!lastPoints.length) lastPoints = [Number(w.StartBalance || 0)];

    // last impact
    var lastEvt = events[events.length - 1] || null;
    var lastImpact = lastEvt ? Number(lastEvt.amount || 0) : 0;

    // period sums (today, week, month) from events
    var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    var startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 6);
    var weekStr = Utilities.formatDate(startOfWeek, tz, "yyyy-MM-dd");
    var startOfMonth = new Date(); startOfMonth.setDate(1);
    var monthStr = Utilities.formatDate(startOfMonth, tz, "yyyy-MM-dd");

    var pnlToday = 0, pnlWeek = 0, pnlMonth = 0, pnlAll = 0;
    for (var j=0;j<events.length;j++){
      var d = dayIST(events[j].ts);
      var amt2 = Number(events[j].amount || 0);
      pnlAll += amt2;
      if (d >= monthStr) pnlMonth += amt2;
      if (d >= weekStr)  pnlWeek  += amt2;
      if (d === todayStr) pnlToday += amt2;
    }
    var seed = Number(w.StartBalance || 0);
    var overallPct = seed ? (pnlAll / seed) * 100 : 0;

    cards.push({
      WalletID: w.WalletID,
      WalletName: w.WalletName,
      Currency: w.Currency,
      StartBalance: seed,
      EquityNow: equity,
      LastImpact: lastImpact,
      Spark: lastPoints,
      Stats: {
        Today: pnlToday, Week: pnlWeek, Month: pnlMonth, Overall: pnlAll, OverallPct: overallPct
      }
    });
  });

  // player "balances" (realized pnl + player-tagged txns) for the selected wallets
  var selectedWalletIds = Object.keys(walletToLeagues);
  var playerAgg = {};
  players.forEach(function(pl){
    playerAgg[pl.PlayerID] = { PlayerID: pl.PlayerID, PlayerName: pl.PlayerName, TeamID: pl.TeamID, Balance: 0 };
  });

  // realized pnl from exits in selected leagues
  var posOK = {}; positions.forEach(function(p){
    var lid = p.LeagueID;
    // include only positions whose league maps to one of the selected wallets
    for (var wid in walletToLeagues) {
      if (walletToLeagues[wid].indexOf(lid)!==-1) { posOK[p.PositionID] = true; break; }
    }
  });
  legs.forEach(function(l){
    if (l.LegType !== "Exit" || !isExecuted(l)) return;
    if (!posOK[l.PositionID]) return;
    var p = positions.find(function(pp){ return pp.PositionID === l.PositionID; });
    if (!p) return;
    if (!playerAgg[p.PlayerID]) return;
    playerAgg[p.PlayerID].Balance += Number(l.RealizedPnl || 0);
  });

  // player-tagged wallet txns in selected wallets
  txns.forEach(function(t){
    if (selectedWalletIds.indexOf(t.WalletID)===-1) return;
    var pid = t.PlayerID || "";
    if (pid && playerAgg[pid]) playerAgg[pid].Balance += Number(t.Amount || 0);
  });

  var playerBalances = Object.values(playerAgg).map(function(x){
    x.TeamName = (teamById[x.TeamID] && teamById[x.TeamID].TeamName) || x.TeamID;
    return x;
  }).sort(function(a,b){ return (b.Balance||0) - (a.Balance||0); });

  // recent transactions for selected wallets (last 20)
  var recentTxns = txns.filter(function(t){ return selectedWalletIds.indexOf(t.WalletID)!==-1; });
  recentTxns.sort(function(a,b){ return new Date(b.AsOf || b.Timestamp) - new Date(a.AsOf || a.Timestamp); });
  recentTxns = recentTxns.slice(0,20);

  return { wallets: cards, players: playerBalances, txns: recentTxns };
}

// ---- Add a wallet transaction (Add / Adjust / Withdraw)
function addWalletTxn(p) {
  if (!p || !p.walletId) throw new Error("Missing walletId");
  var type = String(p.type || "").trim(); // "Add", "Adjust", "Withdraw"
  if (!type) throw new Error("Missing type");
  var amt = Number(p.amount || 0);
  if (!isFinite(amt) || !amt) throw new Error("Invalid amount");

  // convention: Withdraw → force negative
  if (type === "Withdraw" && amt > 0) amt = -amt;

  var obj = {
    WalletTxnID: generateId("WTX"),
    WalletID: p.walletId,
    Type: type,
    Amount: amt,
    PlayerID: p.playerId || "",
    Tag: p.tag || "",
    Note: p.note || "",
    AsOf: nowISO()
  };
  appendRowByObj("WalletTxns", obj);

  return { ok: true, walletTxnId: obj.WalletTxnID };
}

// ---------- Add a leg (Entry or Exit) from Home cards
// ---------- Add a leg (Entry or Exit) — supports pending orders via Legs.Status
// ---------- Add a leg (Entry or Exit) — uses LegStatus/ExecTimestamp
function addLeg(p) {
  if (!p || !p.positionId) throw new Error("Missing positionId");

  // find position
  var positions = rowsToObjs("Positions");
  var pos = positions.find(function(x){ return String(x.PositionID)===String(p.positionId); });
  if (!pos) throw new Error("Unknown position");

  // existing executed legs (for avg & open checks)
  var legsAll = rowsToObjs("Legs").filter(function(l){ return String(l.PositionID)===String(pos.PositionID); });
  var entriesExec = legsAll.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
  var exitsExec   = legsAll.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

  function avgEntryExec() {
    var qty = entriesExec.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var tot = entriesExec.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    return qty ? (tot / qty) : 0;
  }
  function openQtyExec() {
    var qIn  = entriesExec.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var qOut = exitsExec.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    return qIn - qOut;
  }

  var legType = String(p.legType||"Entry");
  var qty     = Number(p.qty||0);
  var price   = Number(p.price||0);
  if (!qty || !price) throw new Error("Invalid qty/price");

  // pending order?
  var inOrder = String(p.status||"") === "InOrder";

  // guard: executing an Exit cannot exceed open executed qty
  if (!inOrder && legType==="Exit") {
    var oq = openQtyExec();
    if (qty > oq) throw new Error("Exit qty exceeds open executed qty");
  }

  var total = Number(p.total||0) || (qty * price);

  var obj = {
    LegID: generateId("LEG"),
    PositionID: pos.PositionID,
    LegType: legType,
    Qty: qty,
    Price: price,
    Total: total,
    Timestamp: nowISO(),                   // created/last-updated time
    ExecTimestamp: inOrder ? "" : nowISO(),// when the trade actually executed
    LegStatus: inOrder ? "InOrder" : "Executed",
    ExitType: "",
    RR: "",
    RealizedPnl: "",
    RealizedPnlPct: ""
  };

  if (!inOrder && legType==="Exit") {
    var avg = avgEntryExec();
    var side = String(pos.Side||"Long");
    var pnl  = (side==="Long") ? (price - avg) * qty : (avg - price) * qty;
    var base = avg * qty;
    obj.RealizedPnl    = pnl;
    obj.RealizedPnlPct = base ? (pnl/base)*100 : 0;
    obj.ExitType       = p.exitType || "Manual";
  }

  appendRowByObj("Legs", obj);

  return { ok: true, legId: obj.LegID, positionId: pos.PositionID };
}



// ---------- Close a position (when all legs are done)
function closePosition(positionId) {
  if (!positionId) throw new Error("Missing positionId");
  updateRowByObj("Positions", "PositionID", positionId, { Status: "Closed", CloseTimestamp: nowISO() });
  return { ok: true };
}
function deletePosition(positionId) {
  if (!positionId) throw new Error("Missing positionId");
  // delete legs first
  var legs = rowsToObjs("Legs");
  legs.forEach(function(l){
    if (String(l.PositionID) === String(positionId)) {
      deleteRowByKey("Legs","LegID", l.LegID);
    }
  });
  var ok = deleteRowByKey("Positions","PositionID", positionId);
  if (!ok) throw new Error("Position not found");
  return { ok:true };
}

function updatePosition(p) {
  if (!p || !p.positionId) throw new Error("Missing positionId");
  var updates = {};
  // Accept PositionSL / PositionTP / Tags if provided (empty string allowed)
  if (p.hasOwnProperty("PositionSL")) updates.PositionSL = p.PositionSL;
  if (p.hasOwnProperty("PositionTP")) updates.PositionTP = p.PositionTP;
  if (p.hasOwnProperty("Tags"))       updates.Tags       = p.Tags;

  if (Object.keys(updates).length === 0) return { ok: true, note: "Nothing to update" };

  var ok = updateRowByObj("Positions", "PositionID", p.positionId, updates);
  if (!ok) throw new Error("Position not found");
  return { ok: true };
}

// -------- Player Single: overall + per-league stats, rank, RR stats, best scrips, trade cards
function getPlayerDetail(playerId, leagueIds) {
  if (!playerId) throw new Error("Missing playerId");

  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  var players = rowsToObjs("Players"); var playerById = {};
  players.forEach(function(p){ playerById[p.PlayerID] = p; });
  var me = playerById[playerId];
  if (!me) throw new Error("Unknown player");

  var teams = rowsToObjs("Teams"); var teamById = {};
  teams.forEach(function(t){ teamById[t.TeamID] = t; });

  var scrips = rowsToObjs("Scrips"); var scripById = {};
  scrips.forEach(function(s){ scripById[s.ScripID] = s; });

  var positionsAll = rowsToObjs("Positions").filter(function(p){
    return (!leagueIds.length || leagueIds.indexOf(p.LeagueID)!==-1);
  });
  var legsAll = rowsToObjs("Legs");

  // ----- Build per-player aggregates across selected leagues (for rank)
  var legsByPosAll = {}; positionsAll.forEach(function(p){ legsByPosAll[p.PositionID] = []; });
  legsAll.forEach(function(l){ if (legsByPosAll.hasOwnProperty(l.PositionID)) legsByPosAll[l.PositionID].push(l); });

  var P = {}; // per player (for rank)
  players.forEach(function(pl){
    P[pl.PlayerID] = { PlayerID: pl.PlayerID, TT:0, Wins:0, Losses:0, _notional:0, _pnl:0, PnLPct:0 };
  });

  function entriesOf(posId) { return (legsByPosAll[posId]||[]).filter(function(l){ return l.LegType==="Entry" && isExecuted(l); }); }
  function exitsOf(posId)   { return (legsByPosAll[posId]||[]).filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); }); }

  for (var i=0;i<positionsAll.length;i++){
    var p = positionsAll[i];
    var E = entriesOf(p.PositionID);
    if (!E.length) continue;
    var X = exitsOf(p.PositionID);

    var notional = E.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = X.reduce(function(a,l){ return a + Number(l.RealizedPnl||0); }, 0);

    var pb = P[p.PlayerID];
    if (!pb) pb = P[p.PlayerID] = { PlayerID: p.PlayerID, TT:0, Wins:0, Losses:0, _notional:0, _pnl:0, PnLPct:0 };
    pb.TT += 1; if (pnl>0) pb.Wins += 1; else if (pnl<0) pb.Losses += 1;
    pb._notional += notional; pb._pnl += pnl;
  }
  var playersArr = Object.values(P).map(function(x){
    x.PnLPct = x._notional ? (x._pnl/x._notional)*100 : 0;
    return x;
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });
  var rank = playersArr.findIndex(function(x){ return String(x.PlayerID)===String(playerId); });
  var currentRank = (rank>=0 ? rank+1 : "");

  // ----- This player's details
  var myPositions = positionsAll.filter(function(p){ return String(p.PlayerID)===String(playerId); });
  var legsByMyPos = {}; myPositions.forEach(function(p){ legsByMyPos[p.PositionID] = []; });
  legsAll.forEach(function(l){ if (legsByMyPos.hasOwnProperty(l.PositionID)) legsByMyPos[l.PositionID].push(l); });

  var overall = { TT:0, Wins:0, Losses:0, WinPct:0, PnL:0, PnLPct:0, _notional:0, _pnl:0 };
  var rrVals = [];
  var perLeague = {}; // lid → stats
  var bestScripsMap = {}; // sid → stats

  function computeAvgEntry(legs) {
    var ent = legs.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    var qty = ent.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var tot = ent.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    return qty ? (tot/qty) : 0;
  }
  function computeRR(side, avgEntry, SL, TP) {
    var e = Number(avgEntry||0), s = Number(SL||0), t = Number(TP||0);
    if (!e || !s || !t) return null;
    if (String(side||"Long")==="Long") {
      var risk=e-s, rew=t-e; if (risk<=0||rew<=0) return null; return rew/risk;
    } else {
      var risk2=s-e, rew2=e-t; if (risk2<=0||rew2<=0) return null; return rew2/risk2;
    }
  }

  for (var j=0;j<myPositions.length;j++){
    var p = myPositions[j];
    var L = legsByMyPos[p.PositionID] || [];
    var E = L.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!E.length) continue;
    var X = L.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var notional = E.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = X.reduce(function(a,l){ return a + Number(l.RealizedPnl || 0); }, 0);

    overall.TT += 1; if (pnl>0) overall.Wins += 1; else if (pnl<0) overall.Losses += 1;
    overall._notional += notional; overall._pnl += pnl;

    // per league
    var lid = p.LeagueID;
    if (!perLeague[lid]) perLeague[lid] = { LeagueID: lid, LeagueName: (leagueById[lid] && leagueById[lid].LeagueName)||lid, TT:0,Wins:0,Losses:0,_notional:0,_pnl:0 };
    perLeague[lid].TT += 1; if (pnl>0) perLeague[lid].Wins+=1; else if (pnl<0) perLeague[lid].Losses+=1;
    perLeague[lid]._notional += notional; perLeague[lid]._pnl += pnl;

    // best scrips map
    var sid = p.ScripID;
    if (!bestScripsMap[sid]) bestScripsMap[sid] = { ScripID: sid, TT:0, Wins:0, Losses:0, _notional:0, _pnl:0 };
    bestScripsMap[sid].TT += 1; if (pnl>0) bestScripsMap[sid].Wins+=1; else if (pnl<0) bestScripsMap[sid].Losses+=1;
    bestScripsMap[sid]._notional += notional; bestScripsMap[sid]._pnl += pnl;

    // RR per position
    var avgE = computeAvgEntry(L);
    var rr = computeRR(p.Side, avgE, p.PositionSL, p.PositionTP);
    if (rr && isFinite(rr)) rrVals.push(rr);
  }

  var wl = overall.Wins + overall.Losses;
  overall.WinPct = wl ? (overall.Wins/wl)*100 : 0;
  overall.PnL    = overall._pnl;
  overall.PnLPct = overall._notional ? (overall._pnl/overall._notional)*100 : 0;
  delete overall._pnl; delete overall._notional;

  var perLeaguesArr = Object.values(perLeague).map(function(x){
    var tot = x.Wins + x.Losses;
    x.WinPct = tot ? (x.Wins/tot)*100 : 0;
    x.PnL    = x._pnl;
    x.PnLPct = x._notional ? (x._pnl/x._notional)*100 : 0;
    delete x._pnl; delete x._notional;
    return x;
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });

  // RR summary (single, deduped)
  rrVals.sort(function(a,b){ return a-b; });
  var rrAvg   = rrVals.length ? rrVals.reduce(function(s,x){ return s+x; }, 0) / rrVals.length : 0;
  var rrMed   = rrVals.length ? rrVals[Math.floor(rrVals.length/2)] : 0;
  var rrBest  = rrVals.length ? rrVals[rrVals.length-1] : 0;
  var rrWorst = rrVals.length ? rrVals[0] : 0;

  // Best scrips (top 5 by PnL%)
  var bestScrips = Object.values(bestScripsMap).map(function(x){
    var sname = (scripById[x.ScripID] && scripById[x.ScripID].ScripName) || x.ScripID;
    var pnlpct = x._notional ? (x._pnl/x._notional)*100 : 0;
    var winpct = (x.Wins + x.Losses) ? (x.Wins/(x.Wins+x.Losses))*100 : 0;
    return { ScripID: x.ScripID, ScripName: sname, TT:x.TT, WinPct: winpct, PnL: x._pnl, PnLPct: pnlpct };
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); }).slice(0,5);

  // Trade history — last 20
  var trades = myPositions.map(function(p){
    var L = legsByMyPos[p.PositionID] || [];
    var E = L.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!E.length) return null;
    var X = L.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var qtyIn   = E.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var qtyOut  = X.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var openQty = qtyIn - qtyOut;

    var notional = E.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = X.reduce(function(a,l){ return a + Number(l.RealizedPnl||0); }, 0);
    var avgEntry = qtyIn ? (notional / qtyIn) : 0;
    var pnlPct   = notional ? (pnl / notional) * 100 : 0;

    var tags = (p.Tags||"").toString().split(",").map(function(s){return s.trim();}).filter(String);

    return {
      PositionID: p.PositionID,
      LeagueID: p.LeagueID,
      LeagueName: (leagueById[p.LeagueID] && leagueById[p.LeagueID].LeagueName) || p.LeagueID,
      TeamID: p.TeamID,
      TeamName: (teamById[p.TeamID] && teamById[p.TeamID].TeamName) || p.TeamID,
      ScripID: p.ScripID,
      ScripName: (scripById[p.ScripID] && scripById[p.ScripID].ScripName) || p.ScripID,
      Side: String(p.Side||"Long"),
      OpenTimestamp: p.OpenTimestamp,
      CloseTimestamp: p.CloseTimestamp,
      Status: p.Status,
      avgEntry: avgEntry,
      openQty: openQty,
      realizedPnl: pnl,
      realizedPnlPct: pnlPct,
      rr: computeRR(p.Side, avgEntry, p.PositionSL, p.PositionTP),
      tags: tags,
      legs: L
    };
  }).filter(Boolean).sort(function(a,b){ return new Date(b.OpenTimestamp) - new Date(a.OpenTimestamp); }).slice(0,20);

  return {
    player: {
      PlayerID: me.PlayerID,
      PlayerName: me.PlayerName,
      TeamID: me.TeamID,
      TeamName: (teamById[me.TeamID] && teamById[me.TeamID].TeamName) || me.TeamID,
      RiskTrait: me.RiskTrait || "",
      CurrentRank: currentRank
    },
    overall: overall,
    rr: { avg: rrAvg, med: rrMed, best: rrBest, worst: rrWorst, count: rrVals.length },
    perLeague: perLeaguesArr,
    bestScrips: bestScrips,
    trades: trades
  };
}


// ---- Update an existing leg (qty/price/total/exitType). Recomputes PnL for Exit legs.
function updateLeg(p) {
  if (!p || !p.legId) throw new Error("Missing legId");
  var legsRows = readAll("Legs");
  var map = headerMap("Legs");
  var idx = findRowIndexByKey("Legs","LegID",p.legId);
  if (idx < 0) throw new Error("Leg not found");
  var row = legsRows[idx-1].slice(); // current leg values
  function get(k){ return row[map[k]]; }
  var positionId = String(get("PositionID"));

  // current leg + its position
  var positions = rowsToObjs("Positions");
  var pos = positions.find(function(x){ return String(x.PositionID)===positionId; });
  if (!pos) throw new Error("Position not found");

  // Merge updates
  var newQty   = (p.qty   != null ? Number(p.qty)   : Number(get("Qty")||0));
  var newPrice = (p.price != null ? Number(p.price) : Number(get("Price")||0));
  var newTotal = (p.total != null ? Number(p.total) : Number(get("Total")||0));
  if (!newTotal) newTotal = newQty * newPrice;

  var updates = {
    Qty: newQty,
    Price: newPrice,
    Total: newTotal
  };

  var legType = String(get("LegType")||"");
  if (legType==="Exit") {
    // recompute realized PnL based on current avg entry
    var legsAll = rowsToObjs("Legs").filter(function(l){ return String(l.PositionID)===positionId; });
    var entries = legsAll.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    var qtyIn   = entries.reduce(function(a,l){return a+Number(l.Qty||0);},0);
    var totIn   = entries.reduce(function(a,l){return a+Number(l.Total||0);},0);
    var avg     = qtyIn ? (totIn/qtyIn) : 0;
    var side    = String(pos.Side||"Long");
    var pnl     = (side==="Long") ? (newPrice - avg)*newQty : (avg - newPrice)*newQty;
    var base    = avg * newQty;
    updates.RealizedPnl    = pnl;
    updates.RealizedPnlPct = base ? (pnl/base)*100 : 0;
    if (p.exitType != null) updates.ExitType = String(p.exitType||"");
  } else {
    // Entries shouldn't keep stale exit fields
    updates.RealizedPnl = ""; updates.RealizedPnlPct = ""; updates.ExitType = "";
  }

  updates.Timestamp = nowISO(); // set to "last edited" time

  updateRowByObj("Legs","LegID",p.legId,updates);
  recomputePositionStatus(positionId);
  return { ok:true, legId: p.legId, positionId: positionId };
}

// ---- Delete a leg completely, then recompute position status.
function deleteLeg(legId) {
  if (!legId) throw new Error("Missing legId");
  // read once to know which position this leg belongs to
  var legs = rowsToObjs("Legs");
  var leg = legs.find(function(l){ return String(l.LegID)===String(legId); });
  if (!leg) throw new Error("Leg not found");
  deleteRowByKey("Legs","LegID",legId);
  recomputePositionStatus(leg.PositionID);
  return { ok:true, legId: legId, positionId: leg.PositionID };
}
function executeLeg(legId) {
  if (!legId) throw new Error("Missing legId");
  var legs = rowsToObjs("Legs");
  var leg = legs.find(function(l){ return String(l.LegID)===String(legId); });
  if (!leg) throw new Error("Leg not found");
  if (String(leg.LegStatus || "Executed") === "Executed") return { ok:true, note:"Already executed" };
  if (String(leg.LegStatus) === "Canceled") throw new Error("Cannot execute a canceled leg");

  var positions = rowsToObjs("Positions");
  var pos = positions.find(function(p){ return String(p.PositionID)===String(leg.PositionID); });
  if (!pos) throw new Error("Position not found");

  var updates = { LegStatus: "Executed", ExecTimestamp: nowISO() };

  if (String(leg.LegType) === "Exit") {
    // validate open qty and compute realized PnL at execution time
    var allLegs = rowsToObjs("Legs").filter(function(x){ return String(x.PositionID)===String(pos.PositionID); });
    var execEntries = allLegs.filter(function(x){ return x.LegType==="Entry" && isExecuted(x); });
    var execExits   = allLegs.filter(function(x){ return x.LegType==="Exit"  && isExecuted(x); });
    var qIn  = execEntries.reduce(function(a,x){ return a + Number(x.Qty||0); }, 0);
    var qOut = execExits.reduce(function(a,x){ return a + Number(x.Qty||0); }, 0);
    var oq   = qIn - qOut;
    var qty  = Number(leg.Qty||0);
    if (qty > oq) throw new Error("Exit qty exceeds open qty at execution");

    var totIn = execEntries.reduce(function(a,x){ return a + Number(x.Total||0); }, 0);
    var avg   = qIn ? (totIn/qIn) : 0;
    var price = Number(leg.Price||0);
    var side  = String(pos.Side||"Long");
    var pnl   = (side==="Long") ? (price - avg)*qty : (avg - price)*qty;
    var base  = avg * qty;
    updates.RealizedPnl    = pnl;
    updates.RealizedPnlPct = base ? (pnl/base)*100 : 0;
  }

  updateRowByObj("Legs","LegID",legId,updates);
  recomputePositionStatus(pos.PositionID);
  return { ok:true, legId: legId, positionId: pos.PositionID };
}

function cancelLeg(legId) {
  if (!legId) throw new Error("Missing legId");
  var legs = rowsToObjs("Legs");
  var leg = legs.find(function(l){ return String(l.LegID)===String(legId); });
  if (!leg) throw new Error("Leg not found");
  if (String(leg.LegStatus || "Executed") === "Executed") throw new Error("Cannot cancel an executed leg");

  updateRowByObj("Legs","LegID",legId,{ LegStatus: "Canceled", ExecTimestamp: "" });
  return { ok:true, legId: legId, positionId: leg.PositionID };
}

// -------- Team Single: overall + per-league stats, rank, RR stats, roster, best scrips, recent trades
// -------- Team Single: overall + per-league stats, rank, RR stats, roster, best scrips, recent trades
function getTeamDetail(teamId, leagueIds) {
  if (!teamId) throw new Error("Missing teamId");

  var leagues = rowsToObjs("Leagues"); var leagueById = {};
  leagues.forEach(function(l){ leagueById[l.LeagueID] = l; });

  var teams = rowsToObjs("Teams"); var teamById = {};
  teams.forEach(function(t){ teamById[t.TeamID] = t; });
  var me = teamById[teamId];
  if (!me) throw new Error("Unknown team");

  var players = rowsToObjs("Players"); var playerById = {};
  players.forEach(function(p){ playerById[p.PlayerID] = p; });

  var scrips = rowsToObjs("Scrips"); var scripById = {};
  scrips.forEach(function(s){ scripById[s.ScripID] = s; });

  // Positions for THIS team (respect league filter)
  var positionsAll = rowsToObjs("Positions").filter(function(p){
    if (leagueIds.length && leagueIds.indexOf(p.LeagueID)===-1) return false;
    return String(p.TeamID) === String(teamId);
  });
  var legsAll = rowsToObjs("Legs");

  // ----- Ranking among ALL teams (within selected leagues)
  var positionsForRank = rowsToObjs("Positions").filter(function(p){
    return (!leagueIds.length || leagueIds.indexOf(p.LeagueID)!==-1);
  });
  var legsByPosRank = {}; positionsForRank.forEach(function(p){ legsByPosRank[p.PositionID] = []; });
  rowsToObjs("Legs").forEach(function(l){ if (legsByPosRank.hasOwnProperty(l.PositionID)) legsByPosRank[l.PositionID].push(l); });

  var T = {}; // team aggregates for rank
  teams.forEach(function(t){ T[t.TeamID] = { TeamID:t.TeamID, _notional:0, _pnl:0, PnLPct:0, TT:0, Wins:0, Losses:0 }; });

  positionsForRank.forEach(function(p){
    var L = legsByPosRank[p.PositionID] || [];
    var E = L.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!E.length) return;
    var X = L.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });
    var notional = E.reduce(function(a,l){return a+Number(l.Total||0);},0);
    var pnl      = X.reduce(function(a,l){return a+Number(l.RealizedPnl||0);},0);
    var agg = T[p.TeamID]; if (!agg) { agg = T[p.TeamID] = { TeamID:p.TeamID, _notional:0,_pnl:0,PnLPct:0,TT:0,Wins:0,Losses:0 }; }
    agg.TT += 1; if (pnl>0) agg.Wins+=1; else if (pnl<0) agg.Losses+=1;
    agg._notional += notional; agg._pnl += pnl;
  });
  var teamsRankArr = Object.values(T).map(function(x){
    x.PnLPct = x._notional ? (x._pnl/x._notional)*100 : 0;
    return x;
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });
  var rank = teamsRankArr.findIndex(function(x){ return String(x.TeamID)===String(teamId); });
  var currentRank = (rank>=0 ? rank+1 : "");

  // ----- THIS team’s details
  var legsByMyPos = {}; positionsAll.forEach(function(p){ legsByMyPos[p.PositionID] = []; });
  legsAll.forEach(function(l){ if (legsByMyPos.hasOwnProperty(l.PositionID)) legsByMyPos[l.PositionID].push(l); });

  var overall = { TT:0, Wins:0, Losses:0, WinPct:0, PnL:0, PnLPct:0, _notional:0, _pnl:0 };
  var rrVals = [];
  var perLeague = {}; // lid → stats
  var roster = {};    // pid → stats
  var bestScripsMap = {}; // sid → stats

  function computeAvgEntry(legs) {
    var ent = legs.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    var qty = ent.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var tot = ent.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    return qty ? (tot/qty) : 0;
  }
  function computeRR(side, avgEntry, SL, TP) {
    var e = Number(avgEntry||0), s = Number(SL||0), t = Number(TP||0);
    if (!e || !s || !t) return null;
    if (String(side||"Long")==="Long") {
      var risk=e-s, rew=t-e; if (risk<=0||rew<=0) return null; return rew/risk;
    } else {
      var risk2=s-e, rew2=e-t; if (risk2<=0||rew2<=0) return null; return rew2/risk2;
    }
  }

  positionsAll.forEach(function(p){
    var L = legsByMyPos[p.PositionID] || [];
    var E = L.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!E.length) return;
    var X = L.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var notional = E.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = X.reduce(function(a,l){ return a + Number(l.RealizedPnl||0); }, 0);

    overall.TT += 1; if (pnl>0) overall.Wins+=1; else if (pnl<0) overall.Losses+=1;
    overall._notional += notional; overall._pnl += pnl;

    var lid = p.LeagueID;
    if (!perLeague[lid]) perLeague[lid] = { LeagueID: lid, LeagueName: (leagueById[lid] && leagueById[lid].LeagueName)||lid, TT:0,Wins:0,Losses:0,_notional:0,_pnl:0 };
    perLeague[lid].TT += 1; if (pnl>0) perLeague[lid].Wins+=1; else if (pnl<0) perLeague[lid].Losses+=1;
    perLeague[lid]._notional += notional; perLeague[lid]._pnl += pnl;

    var pid = p.PlayerID;
    if (!roster[pid]) {
      var pl = playerById[pid] || {};
      roster[pid] = { PlayerID: pid, PlayerName: pl.PlayerName || pid, RiskTrait: pl.RiskTrait || "", TT:0,Wins:0,Losses:0,_notional:0,_pnl:0 };
    }
    roster[pid].TT += 1; if (pnl>0) roster[pid].Wins+=1; else if (pnl<0) roster[pid].Losses+=1;
    roster[pid]._notional += notional; roster[pid]._pnl += pnl;

    var sid = p.ScripID;
    if (!bestScripsMap[sid]) bestScripsMap[sid] = { ScripID: sid, TT:0, Wins:0, Losses:0, _notional:0, _pnl:0 };
    bestScripsMap[sid].TT += 1; if (pnl>0) bestScripsMap[sid].Wins+=1; else if (pnl<0) bestScripsMap[sid].Losses+=1;
    bestScripsMap[sid]._notional += notional; bestScripsMap[sid]._pnl += pnl;

    var avgE = computeAvgEntry(L);
    var rr = computeRR(p.Side, avgE, p.PositionSL, p.PositionTP);
    if (rr && isFinite(rr)) rrVals.push(rr);
  });

  var wl = overall.Wins + overall.Losses;
  overall.WinPct = wl ? (overall.Wins/wl)*100 : 0;
  overall.PnL    = overall._pnl;
  overall.PnLPct = overall._notional ? (overall._pnl/overall._notional)*100 : 0;
  delete overall._pnl; delete overall._notional;

  var perLeaguesArr = Object.values(perLeague).map(function(x){
    var tot = x.Wins + x.Losses;
    x.WinPct = tot ? (x.Wins/tot)*100 : 0;
    x.PnL    = x._pnl;
    x.PnLPct = x._notional ? (x._pnl/x._notional)*100 : 0;
    delete x._pnl; delete x._notional;
    return x;
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });

  var rosterArr = Object.values(roster).map(function(x){
    var tot = x.Wins + x.Losses;
    x.WinPct = tot ? (x.Wins/tot)*100 : 0;
    x.PnL    = x._pnl;
    x.PnLPct = x._notional ? (x._pnl/x._notional)*100 : 0;
    delete x._pnl; delete x._notional;
    return x;
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); });

  // ----- RR summary (this was missing and caused ReferenceError)
  rrVals.sort(function(a,b){ return a-b; });
  var rrAvg   = rrVals.length ? rrVals.reduce(function(s,x){ return s+x; }, 0) / rrVals.length : 0;
  var rrMed   = rrVals.length ? rrVals[Math.floor(rrVals.length/2)] : 0;
  var rrBest  = rrVals.length ? rrVals[rrVals.length-1] : 0;
  var rrWorst = rrVals.length ? rrVals[0] : 0;

  // Best scrips (top 5 by PnL%)
  var bestScrips = Object.values(bestScripsMap).map(function(x){
    var name = (scripById[x.ScripID] && scripById[x.ScripID].ScripName) || x.ScripID;
    var pnlpct = x._notional ? (x._pnl/x._notional)*100 : 0;
    var winpct = (x.Wins + x.Losses) ? (x.Wins/(x.Wins+x.Losses))*100 : 0;
    return { ScripID: x.ScripID, ScripName: name, TT:x.TT, WinPct: winpct, PnL: x._pnl, PnLPct: pnlpct };
  }).sort(function(a,b){ return (b.PnLPct||0) - (a.PnLPct||0); }).slice(0,5);

  // Recent trades (last 20)
  var trades = positionsAll.map(function(p){
    var L = legsByMyPos[p.PositionID] || [];
    var E = L.filter(function(l){ return l.LegType==="Entry" && isExecuted(l); });
    if (!E.length) return null;
    var X = L.filter(function(l){ return l.LegType==="Exit"  && isExecuted(l); });

    var qtyIn   = E.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var qtyOut  = X.reduce(function(a,l){ return a + Number(l.Qty||0); }, 0);
    var openQty = qtyIn - qtyOut;

    var notional = E.reduce(function(a,l){ return a + Number(l.Total||0); }, 0);
    var pnl      = X.reduce(function(a,l){ return a + Number(l.RealizedPnl||0); }, 0);
    var avgEntry = qtyIn ? (notional / qtyIn) : 0;
    var pnlPct   = notional ? (pnl / notional) * 100 : 0;

    var tags = (p.Tags||"").toString().split(",").map(function(s){return s.trim();}).filter(String);

    var pl = playerById[p.PlayerID] || {};
    return {
      PositionID: p.PositionID,
      LeagueID: p.LeagueID,
      LeagueName: (leagueById[p.LeagueID] && leagueById[p.LeagueID].LeagueName) || p.LeagueID,
      PlayerID: p.PlayerID,
      PlayerName: pl.PlayerName || p.PlayerID,
      ScripID: p.ScripID,
      ScripName: (scripById[p.ScripID] && scripById[p.ScripID].ScripName) || p.ScripID,
      Side: String(p.Side||"Long"),
      OpenTimestamp: p.OpenTimestamp,
      CloseTimestamp: p.CloseTimestamp,
      Status: p.Status,
      avgEntry: avgEntry,
      openQty: openQty,
      realizedPnl: pnl,
      realizedPnlPct: pnlPct,
      rr: computeRR(p.Side, avgEntry, p.PositionSL, p.PositionTP),
      tags: tags,
      legs: L
    };
  }).filter(Boolean).sort(function(a,b){ return new Date(b.OpenTimestamp) - new Date(a.OpenTimestamp); }).slice(0,20);

  return {
    team: { TeamID: me.TeamID, TeamName: me.TeamName, CurrentRank: currentRank },
    overall: overall,
    rr: { avg: rrAvg, med: rrMed, best: rrBest, worst: rrWorst, count: rrVals.length },
    perLeague: perLeaguesArr,
    roster: rosterArr,
    bestScrips: bestScrips,
    trades: trades
  };
}
