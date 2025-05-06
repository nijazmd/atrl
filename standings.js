const API_URL = "https://script.google.com/macros/s/AKfycbyTfKUqTt1bN3WFRyQlWWMh7tAX4af0qasvb2bhoNoJ98eImhqP0IPyMojneD7dL0nIjw/exec";

fetch(API_URL + "?action=getClosedTrades")
  .then(response => response.json())
  .then(data => {
    const tbody = document.getElementById("standingsTable").querySelector("tbody");
    tbody.innerHTML = ""; // clear previous rows

    const playerStats = {};

    // Loop through trades data and accumulate PnL and win/loss count for each player (only for closed trades)
    data.trades.forEach(trade => {
      if (!trade.IsClosed) return;

      const team = trade.Team;
      const player = trade.Player;
      const position = trade.PositionType;
      const qty = parseFloat(trade.Qty);
      const entryPrice = parseFloat(trade.EntryPrice);
      const exitPrice = parseFloat(trade.ExitPrice);
      
      let pnl = 0;
      if (position.toLowerCase() === "long") {
        pnl = (exitPrice - entryPrice) * qty;
      } else if (position.toLowerCase() === "short") {
        pnl = (entryPrice - exitPrice) * qty;
      }

      if (!playerStats[player]) {
        playerStats[player] = {
          team: team,
          totalPnL: 0,
          wins: 0,
          losses: 0,
          totalTrades: 0
        };
      }

      playerStats[player].totalPnL += pnl;
      playerStats[player].totalTrades += 1;

      if (pnl > 0) {
        playerStats[player].wins += 1;
      } else if (pnl < 0) {
        playerStats[player].losses += 1;
      }
    });

    // Sort players by total PnL
    const sortedPlayers = Object.keys(playerStats).sort((a, b) => playerStats[b].totalPnL - playerStats[a].totalPnL);

    // Add sorted players to the table
    sortedPlayers.forEach((player, index) => {
      const stats = playerStats[player];
      const winPercentage = (stats.wins / stats.totalTrades * 100).toFixed(2);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${player}</td>
        <td>${stats.team}</td>
        <td>${winPercentage}%</td>
        <td>${stats.totalPnL.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    });

    // ✅ Team Stats: Move inside here
    const teamStats = {};

    Object.keys(playerStats).forEach(player => {
      const { team, totalPnL, wins, losses, totalTrades } = playerStats[player];

      if (!teamStats[team]) {
        teamStats[team] = {
          totalPnL: 0,
          totalTrades: 0,
          wins: 0,
          losses: 0
        };
      }

      teamStats[team].totalPnL += totalPnL;
      teamStats[team].totalTrades += totalTrades;
      teamStats[team].wins += wins;
      teamStats[team].losses += losses;
    });

    const sortedTeams = Object.keys(teamStats).sort((a, b) => teamStats[b].totalPnL - teamStats[a].totalPnL);

    const teamTbody = document.getElementById("teamStandingsTable").querySelector("tbody");
    teamTbody.innerHTML = ""; // Clear previous

    sortedTeams.forEach((team, index) => {
      const stats = teamStats[team];
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${team}</td>
        <td>${stats.totalPnL.toFixed(2)}</td>
        <td>${stats.totalTrades}</td>
        <td>${stats.wins}</td>
        <td>${stats.losses}</td>
      `;
      teamTbody.appendChild(row);
    });

  })
  .catch(error => {
    console.error("Failed to load standings:", error);
  });
