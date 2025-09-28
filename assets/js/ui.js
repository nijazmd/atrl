// UI helpers: crypto stepper, qty<->total sync, autofocus
const UI = (() => {
  function attachCryptoStepper(wrapper) {
    // wrapper contains: <button data-step="-1">, <input>, <button data-step="+1">
    const minus = wrapper.querySelector('[data-step="-1"]');
    const plus  = wrapper.querySelector('[data-step="+1"]');
    const input = wrapper.querySelector("input");
    function step(delta) {
      input.value = Compute.stepRightMostDigit(input.value, delta);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    minus?.addEventListener("click", () => step(-1));
    plus?.addEventListener("click",  () => step(+1));
  }

  function twoWayQtyTotalSync({ qtyEl, priceEl, totalEl }) {
    function recalcFromQty() {
      const q = qtyEl.value || "0";
      const p = priceEl.value || "0";
      totalEl.value = Compute.mulStr(q, p);
    }
    function recalcFromTotal() {
      const t = totalEl.value || "0";
      const p = priceEl.value || "0";
      totalEl.value = t; // normalize
      qtyEl.value = p === "0" ? "0" : Compute.divStr(t, p, 8);
    }
    qtyEl.addEventListener("input", recalcFromQty);
    priceEl.addEventListener("input", () => {
      // if user typed total, keep it; else recompute from qty
      if (document.activeElement === totalEl) recalcFromTotal(); else recalcFromQty();
    });
    totalEl.addEventListener("input", recalcFromTotal);
  }

  function autofocusFirst(container) {
    const el = container.querySelector(".js-autofocus");
    if (el) el.focus();
  }

  return { attachCryptoStepper, twoWayQtyTotalSync, autofocusFirst };
})();
