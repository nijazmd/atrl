// /assets/js/format.js
const Fmt = {
    compact(n) {
      const num = Number(n || 0);
      if (!isFinite(num)) return "0";
      // Indian-style grouping for INR-ish display; keep this simple
      return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    },
    dateTime(isoLike) {
      if (!isoLike) return "";
      const d = new Date(isoLike);
      if (isNaN(d)) return String(isoLike);
      // IST display as requested (frontend formatting)
      return d.toLocaleString("en-GB", { hour12: false });
    }
  };
  