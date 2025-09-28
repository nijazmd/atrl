// Precise helpers: RR, qty-total sync, right-most-digit stepper, exposure gates
const Compute = (() => {
  // string-safe add/sub on decimals
  function toParts(str) {
    const s = String(str || "0").trim();
    const neg = s.startsWith("-");
    const [i="0", f=""] = (neg ? s.slice(1) : s).split(".");
    return { neg, i, f };
  }
  function normalize(a, b) {
    const la = a.f.length, lb = b.f.length;
    const L = Math.max(la, lb);
    const af = a.f.padEnd(L, "0"), bf = b.f.padEnd(L, "0");
    return { L, af, bf };
  }
  function addStr(x, y) {
    const a = toParts(x), b = toParts(y);
    // handle signs via BigNumber-ish approach
    if (a.neg && !b.neg) return subStr(y, x.slice(1));
    if (!a.neg && b.neg) return subStr(x, y.slice(1));
    const { L, af, bf } = normalize(a, b);
    // integer add
    let carry = 0, frac = "";
    for (let k = L-1; k >= 0; k--) {
      const s = (+af[k]) + (+bf[k]) + carry;
      frac = (s % 10) + frac;
      carry = Math.floor(s / 10);
    }
    let ia = a.i.split("").reverse(), ib = b.i.split("").reverse();
    const len = Math.max(ia.length, ib.length);
    let int = "", c = carry;
    for (let k = 0; k < len; k++) {
      const s = (+ia[k]||0) + (+ib[k]||0) + c;
      int = (s % 10) + int;
      c = Math.floor(s / 10);
    }
    if (c) int = c + int;
    const out = int + (L ? "." + frac.replace(/0+$/,"") : "");
    return (a.neg && b.neg && out !== "0") ? "-" + out : out;
  }
  function subStr(x, y) {
    // x - y
    const a = toParts(x), b = toParts(y);
    if (a.neg && !b.neg) return "-" + addStr(a.i+(a.f?'.'+a.f:''), b.i+(b.f?'.'+b.f:''));
    if (!a.neg && b.neg) return addStr(x, y.slice(1));
    // ensure |a| >= |b|; otherwise compute and negate
    const cmp = compareAbs(a, b);
    if (cmp === 0) return "0";
    const neg = (cmp < 0) ? !a.neg : a.neg;
    const big = (cmp >= 0) ? a : b, small = (cmp >= 0) ? b : a;
    const { L, af, bf } = normalize(big, small);
    // frac
    let borrow = 0, frac = "";
    for (let k = L-1; k >= 0; k--) {
      let d = (+af[k]) - (+bf[k]) - borrow;
      if (d < 0) { d += 10; borrow = 1; } else borrow = 0;
      frac = d + frac;
    }
    // int
    let ia = big.i.split("").reverse(), ib = small.i.split("").reverse();
    let int = "";
    for (let k = 0; k < ia.length; k++) {
      let d = (+ia[k]) - (+ib[k]||0) - borrow;
      if (d < 0) { d += 10; borrow = 1; } else borrow = 0;
      int = d + int;
    }
    int = int.replace(/^0+(?=\d)/,"");
    const out = int + (L ? "." + frac.replace(/0+$/,"") : "");
    return (neg && out !== "0") ? "-" + out : out;
  }
  function compareAbs(a, b) {
    if (a.i.length !== b.i.length) return a.i.length > b.i.length ? 1 : -1;
    if (a.i !== b.i) return a.i > b.i ? 1 : -1;
    const L = Math.max(a.f.length, b.f.length);
    const af = a.f.padEnd(L, "0"), bf = b.f.padEnd(L, "0");
    if (af === bf) return 0;
    return af > bf ? 1 : -1;
  }
  function mulStr(x, y) {
    // simple via BigInt on scaled integers
    const ax = String(x); const ay = String(y);
    const dx = (ax.split(".")[1]||"").length;
    const dy = (ay.split(".")[1]||"").length;
    const sx = BigInt(ax.replace(".","")); 
    const sy = BigInt(ay.replace(".",""));
    const prod = sx * sy;
    const scale = dx + dy;
    const s = prod.toString();
    if (scale === 0) return s;
    const pad = s.padStart(scale+1, "0");
    const int = pad.slice(0, -scale).replace(/^0+(?=\d)/, "") || "0";
    const frac = pad.slice(-scale).replace(/0+$/,"");
    return frac ? `${int}.${frac}` : int;
  }
  function divStr(x, y, decimals = 8) {
    const ax = String(x); const ay = String(y);
    const dx = (ax.split(".")[1]||"").length;
    const dy = (ay.split(".")[1]||"").length;
    const sx = BigInt(ax.replace(".",""));
    const sy = BigInt(ay.replace(".",""));
    if (sy === 0n) return "0";
    // scale to preserve precision
    const scale = BigInt(10 ** decimals);
    const num = sx * scale * BigInt(10 ** dy);
    const den = sy * BigInt(10 ** dx);
    const q = num / den;
    const s = q.toString();
    if (decimals === 0) return s;
    const pad = s.padStart(decimals+1, "0");
    const int = pad.slice(0, -decimals).replace(/^0+(?=\d)/,"") || "0";
    const frac = pad.slice(-decimals).replace(/0+$/,"");
    return frac ? `${int}.${frac}` : int;
  }

  // Right-most digit stepper (+/- 1 on the last numeric digit)
  function stepRightMostDigit(valueStr, delta = +1) {
    let s = String(valueStr || "0").trim();
    if (!s) s = "0";
    const sign = s.startsWith("-") ? "-" : "";
    if (sign) s = s.slice(1);
    if (!/^\d+(\.\d+)?$/.test(s)) return (sign + s) || "0";
    // ensure there is at least one digit after dot to step if dot exists
    const hasDot = s.includes(".");
    if (hasDot) {
      // increment last fractional digit
      let [i, f] = s.split(".");
      if (f.length === 0) f = "0";
      let arr = (i + f).split("").map(c=>+c);
      let pos = arr.length - 1;
      arr[pos] = Math.max(0, Math.min(9, arr[pos] + delta));
      // handle carry/borrow
      for (let k = pos; k >= 0; k--) {
        if (arr[k] > 9) { arr[k] -= 10; if (k-1 >= 0) arr[k-1] += 1; else arr.unshift(1); }
        if (arr[k] < 0)  { arr[k] += 10; if (k-1 >= 0) arr[k-1] -= 1; else { arr.unshift(0);} }
      }
      const full = arr.join("");
      const left = full.slice(0, i.length) || "0";
      const right = full.slice(i.length).replace(/0+$/,"");
      return sign + (right ? `${left}.${right}` : left);
    } else {
      // no dot: step integer last digit
      let arr = s.split("").map(c=>+c);
      let pos = arr.length - 1;
      arr[pos] = Math.max(0, Math.min(9, arr[pos] + delta));
      for (let k = pos; k >= 0; k--) {
        if (arr[k] > 9) { arr[k] -= 10; if (k-1 >= 0) arr[k-1] += 1; else arr.unshift(1); }
        if (arr[k] < 0)  { arr[k] += 10; if (k-1 >= 0) arr[k-1] -= 1; else { arr.unshift(0);} }
      }
      return sign + arr.join("").replace(/^0+(?=\d)/,"");
    }
  }

  // RR from entry/SL/TP (side-aware)
  function rr(entry, sl, tp, side /* 'Long' | 'Short' */) {
    const e = String(entry||"0"), s = String(sl||"0"), t = String(tp||"0");
    if (side === "Long") {
      const risk = subStr(e, s);      // entry - SL
      const reward = subStr(t, e);    // TP - entry
      if (compareAbs(toParts(risk), toParts("0")) <= 0) return "0";
      return divStr(reward, risk, 4);
    } else {
      const risk = subStr(s, e);      // SL - entry
      const reward = subStr(e, t);    // entry - TP
      if (compareAbs(toParts(risk), toParts("0")) <= 0) return "0";
      return divStr(reward, risk, 4);
    }
  }

  return { addStr, subStr, mulStr, divStr, stepRightMostDigit, rr };
})();
