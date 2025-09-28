// /assets/js/api.js  (LOCKED, SIMPLE)
const API = (() => {
    // 🔒 Use your real Apps Script URL only. Nothing else can override this.
    const ENDPOINT = "https://script.google.com/macros/s/AKfycby0z_edMf5wjn7yGx4vF4IU8GarSeQSjiZFVuwiglV2_p9I8rCUaIyoDxZ93B9_iEaVjw/exec";
    console.log("API endpoint (locked):", ENDPOINT);
  
    async function post(mode, payload = {}) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        // No custom headers → no CORS preflight
        body: JSON.stringify({ mode, payload }),
      });
      if (!res.ok) throw new Error(`API ${mode} failed: ${res.status}`);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error(`Bad JSON from Apps Script: ${text}`);
      }
      if (data.error) throw new Error(data.error);
      return data;
    }
  
    return {
      getConfig: () => post("getConfig"),
      getLookups: () => post("getLookups"),
      getRoundsMeta: (leagueIds) => post("getRoundsMeta", { leagueIds }),
      getAddPageInit: (leagueIds) => post("getAddPageInit", { leagueIds }),
      createPositionWithEntry: (payload) => post("createPositionWithEntry", payload),
      getExposureSummary: (leagueIds) => post("getExposureSummary", { leagueIds }),
      getHomeData: (leagueIds) => post("getHomeData", { leagueIds }),
      getStandings: (leagueIds, scope) => post("getStandings", { leagueIds, scope }),
      getScripsStats: (leagueIds) => post("getScripsStats", { leagueIds }),
      getScripDetail: (scripId, leagueIds) => post("getScripDetail", { scripId, leagueIds }),
      getWalletOverview: (leagueIds) => post("getWalletOverview", { leagueIds }),
      addWalletTxn: (payload) => post("addWalletTxn", payload),
      getHomeData: (leagueIds) => post("getHomeData", { leagueIds }),
      addLeg: (payload) => post("addLeg", payload),
      closePosition: (positionId) => post("closePosition", { positionId }),
      updatePosition: (payload) => post("updatePosition", payload),
      getPlayerDetail: (playerId, leagueIds) => post("getPlayerDetail", { playerId, leagueIds }),
      updateLeg: (payload) => post("updateLeg", payload),
      getTeamDetail: (teamId, leagueIds) => post("getTeamDetail", { teamId, leagueIds }),
    };
  })();
  