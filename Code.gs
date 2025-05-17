// Refactored ATrL Apps Script using column headers throughout

const ACTIVE_TRADES_SHEET = "ActiveTrades";
const TEAM_PLAYER_MAP_SHEET = "TeamPlayerMap";

function doGet(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === "getPlayers" && e.parameter.team) {
    const sheet = ss.getSheetByName(TEAM_PLAYER_MAP_SHEET);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const teamIndex = headers.indexOf("Team");
    const playerIdIndex = headers.indexOf("PlayerID");
    const playerNameIndex = headers.indexOf("PlayerName");

    const players = data.slice(1)
      .filter(row => row[teamIndex] === e.parameter.team)
      .map(row => ({
        PlayerID: row[playerIdIndex],
        PlayerName: row[playerNameIndex]
      }));

    return ContentService.createTextOutput(JSON.stringify({ players }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "getTrades" || action === "getClosedTrades") {
    const sheet = ss.getSheetByName(ACTIVE_TRADES_SHEET);
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

if (action === "getQueueStatus") {
  const roundsMeta = ss.getSheetByName("RoundsMeta").getDataRange().getValues();
  const latestRound = roundsMeta[roundsMeta.length - 1][0];

  const playerSheet = ss.getSheetByName("TeamPlayerMap");
  const activeSheet = ss.getSheetByName("ActiveTrades");
  const standingsSheet = ss.getSheetByName("StandingsPlayer");

  const players = playerSheet.getDataRange().getValues();
  const active = activeSheet.getDataRange().getValues();
  const standings = standingsSheet.getDataRange().getValues();

  const playerHeaders = players[0];
  const activeHeaders = active[0];
  const standingsHeaders = standings[0];

  const idIndex = playerHeaders.indexOf("PlayerID");
  const nameIndex = playerHeaders.indexOf("PlayerName");
  const teamIndex = playerHeaders.indexOf("Team");
  const queueIndex = playerHeaders.indexOf("PlayerOrder");

  const walletIndex = standingsHeaders.indexOf("WalletBalance");
  const standingsIdIndex = standingsHeaders.indexOf("PlayerID");

  const activeRoundIndex = activeHeaders.indexOf("RoundNumber");
  const activePlayerIdIndex = activeHeaders.indexOf("PlayerID");

  // ✅ Exclude players in ActiveTrades of this round — no matter closed or not
  const tradedPlayers = new Set(
    active.slice(1)
      .filter(row => row[activeRoundIndex] === latestRound)
      .map(row => String(row[activePlayerIdIndex]))
  );

  const walletMap = {};
  standings.slice(1).forEach(row => {
    walletMap[row[standingsIdIndex]] = parseFloat(row[walletIndex]) || 0;
  });

  const queueEntries = [];

  players.slice(1).forEach(row => {
    const id = String(row[idIndex]);
    if (!tradedPlayers.has(id)) {
      queueEntries.push({
        PlayerID: id,
        PlayerName: row[nameIndex],
        Team: row[teamIndex],
        QueueNumber: parseInt(row[queueIndex]),
        WalletBalance: walletMap[id] || 0
      });
    }
  });

  queueEntries.sort((a, b) => a.QueueNumber - b.QueueNumber);

  return ContentService.createTextOutput(JSON.stringify({
    round: latestRound,
    queue: queueEntries.slice(0, 5)
  })).setMimeType(ContentService.MimeType.JSON);
}


if (action === "getPlayerInfo" && e.parameter.id) {
  const playerId = e.parameter.id;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const playerSheet = ss.getSheetByName("TeamPlayerMap").getDataRange().getValues();
  const standingsSheet = ss.getSheetByName("StandingsPlayer").getDataRange().getValues();
  const completedSheet = ss.getSheetByName("CompletedTrades").getDataRange().getValues();

  const playerHeaders = playerSheet[0];
  const standingsHeaders = standingsSheet[0];
  const completedHeaders = completedSheet[0];

  // Get player details
  const playerRow = playerSheet.find(row => String(row[playerHeaders.indexOf("PlayerID")]) === playerId);
  if (!playerRow) {
    return ContentService.createTextOutput("Player not found").setMimeType(ContentService.MimeType.TEXT);
  }

  const playerName = playerRow[playerHeaders.indexOf("PlayerName")];
  const team = playerRow[playerHeaders.indexOf("Team")];

  // Get wallet balance
  const standingsRow = standingsSheet.find(row => String(row[standingsHeaders.indexOf("PlayerID")]) === playerId);
  const walletBalance = standingsRow ? parseFloat(standingsRow[standingsHeaders.indexOf("WalletBalance")]) || 0 : 0;

  // Get completed trades for this player
  const trades = completedSheet.slice(1).filter(row =>
    String(row[completedHeaders.indexOf("PlayerID")]) === playerId
  ).map(row => {
    return Object.fromEntries(completedHeaders.map((h, i) => [h, row[i]]));
  });

  return ContentService.createTextOutput(JSON.stringify({
    PlayerID: playerId,
    PlayerName: playerName,
    Team: team,
    WalletBalance: walletBalance,
    Trades: trades
  })).setMimeType(ContentService.MimeType.JSON);
}

if (action === "getPlayerStats") {
  const sheet = ss.getSheetByName("StandingsPlayer");
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


  return ContentService.createTextOutput("Invalid request").setMimeType(ContentService.MimeType.TEXT);

}

function doPost(e) {
  const action = e.parameter.action;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getSheetByName("ActiveTrades");
  const completedSheet = ss.getSheetByName("CompletedTrades");
  const standingsSheet = ss.getSheetByName("StandingsPlayer");

  if (action === "closeTrade") {
    const tradeId = e.parameter.TradeID;
    const exitPrice = parseFloat(e.parameter.ExitPrice);

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
            const completedRow = completedHeaders.map(header => {
            if (header in e.parameter) {
              // Format PnLPercent if needed
              if (header === "PnLPercent") {
                return parseFloat(e.parameter[header]).toFixed(2);
              }
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

            return ContentService.createTextOutput("Trade closed and wallet updated.");
          }
        }
        return ContentService.createTextOutput("Player not found in standings.");
      }
    }
    return ContentService.createTextOutput("Trade ID not found.");
  }

  if (action === "startNextRound") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roundsSheet = ss.getSheetByName("RoundsMeta");
  const standingsSheet = ss.getSheetByName("StandingsPlayer");

  const capital = parseFloat(e.parameter.capital);
  if (isNaN(capital) || capital <= 0) {
    return ContentService.createTextOutput("Invalid capital value.");
  }

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
    if (action === "nextRound") {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const roundsSheet = ss.getSheetByName("RoundsMeta");
    const standingsSheet = ss.getSheetByName("StandingsPlayer");

    const roundsData = roundsSheet.getDataRange().getValues();
    const lastRound = parseInt(roundsData[roundsData.length - 1][0]);
    const newRound = lastRound + 1;
    const capitalPerPlayer = parseFloat(roundsData[roundsData.length - 1][2]);

    // Add new round to RoundsMeta
    const today = new Date();
    roundsSheet.appendRow([newRound, today, capitalPerPlayer]);

    // Update wallets
    const standingsData = standingsSheet.getDataRange().getValues();
    const headers = standingsData[0];
    const walletIndex = headers.indexOf("WalletBalance");

    for (let i = 1; i < standingsData.length; i++) {
      let currentWallet = parseFloat(standingsData[i][walletIndex]) || 0;
      let updatedWallet = currentWallet + capitalPerPlayer;
      standingsSheet.getRange(i + 1, walletIndex + 1).setValue(updatedWallet);
    }

    return ContentService.createTextOutput("Next round added and wallets updated.");
  }

  return ContentService.createTextOutput("Trade added and wallet updated.");
}

function testSheetExists() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("RoundsMeta");
  Logger.log(sheet);
}
