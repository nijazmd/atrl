// /assets/js/state.js
const AppState = {
    config: {},
    leagues: [],
    players: [],
    teams: [],
    scrips: [],
    seasons: [],
    selectedLeagues: [],
  
    setConfig(c) { this.config = c || {}; },
    setLookups(lk) {
      this.leagues = lk?.leagues || [];
      this.players = lk?.players || [];
      this.teams   = lk?.teams   || [];
      this.scrips  = lk?.scrips  || [];
      this.seasons = lk?.seasons || [];
    },
    initSelectedLeagues() {
      // preselect all active leagues by name
      const active = (this.leagues || []).filter(l => String(l.IsActive).toLowerCase() === "true");
      this.selectedLeagues = active.map(l => l.LeagueName);
      if (!this.selectedLeagues.length && this.leagues.length) {
        // fallback: select first by name
        this.selectedLeagues = [this.leagues[0].LeagueName];
      }
    }
  };
  