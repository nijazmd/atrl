const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";

fetch(API_URL + "?action=getClosedTrades")
  .then(response => response.json())
  .then(data => {
    const tbody = document.getElementById("standingsTable").querySelector("tbody");
    tbody.innerHTML = "";

    const playerStats = {};

    data.trades.forEach(trade => {
      const playerId = trade.PlayerID;
      const playerName = trade.Player;
      const team = trade.Team;
      const pnl = parseFloat(trade.PnL);
    
      if (!playerStats[playerId]) {
        playerStats[playerId] = {
          PlayerName: playerName,
          team: team,
          totalPnL: 0,
          wins: 0,
          losses: 0,
          totalTrades: 0
        };
      }
    
      playerStats[playerId].totalPnL += pnl;
      playerStats[playerId].totalTrades += 1;
    
      if (pnl > 0) {
        playerStats[playerId].wins += 1;
      } else if (pnl < 0) {
        playerStats[playerId].losses += 1;
      }
    
      
    });

    const sortedPlayers = Object.keys(playerStats).sort((a, b) => playerStats[b].totalPnL - playerStats[a].totalPnL);
    sortedPlayers.forEach((playerId, index) => {
      const stats = playerStats[playerId];
      const winPercentage = (stats.wins / stats.totalTrades * 100).toFixed(2);
    
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="player-single.html?id=${playerId}">${stats.PlayerName}</a></td>
        <td>${stats.team}</td>
        <td>${winPercentage}%</td>
        <td>${stats.totalPnL.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    });
    

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
    teamTbody.innerHTML = "";

    sortedTeams.forEach((team, index) => {
      const stats = teamStats[team];
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><a href="team-single.html?team=${team}">${team}</a></td>
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
