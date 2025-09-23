const API_URL = "https://script.google.com/macros/s/AKfycbxe_aqoQxqVaegrls1R9xylSJj6QeR7FJmOU8eL6vz5qmEOkPjI2dRc1g5CHQVTy4mxSg/exec";
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

const raw = v => (v===undefined || v===null || v==="") ? "—" : String(v);
const fmt2 = n => Number(n||0).toFixed(2);
const toneColor = n => (Number(n||0) >= 0) ? "#4ade80" : "#f87171";

function badge(txt, tone="neutral"){
  const color = tone==="pos" ? "#4ade80" : tone==="neg" ? "#f87171" : tone==="neutral2" ? "#f59e0b" : "#a5b4fc";
  return `<span style="display:inline-block;padding:.2rem .5rem;border-radius:6px;background:rgba(255,255,255,0.06);color:${color};font-weight:650;">${txt}</span>`;
}

async function load(){
  const c = document.getElementById("activeTrades");
  c.innerHTML = "Loading...";
  try {
    const res = await fetch(`${API_URL}?action=getActiveGroupedTrades`);
    // Be defensive in case the web app returns text (e.g., "Invalid request")
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch (e) {
      throw new Error(`Non-JSON response from server: ${text.slice(0,120)}…`);
    }

    const positions = j.positions || [];
    c.innerHTML = "";
    positions.forEach(p => c.appendChild(renderCard(p)));
    if (!positions.length) c.innerHTML = "<div class='empty' style='opacity:.8;margin:1rem;'>No active trades.</div>";

    const h = document.querySelector("h2");
    if (h) h.textContent = `Active Trades (${positions.length})`;
  } catch (e) {
    console.error(e);
    c.innerHTML = "<div class='error' style='color:#f87171;margin:1rem;'>Failed to load active trades.</div>";
  }
}

function renderCard(p){
  const card = document.createElement("div");
  card.className = "trade-card";
  card.style = "background:#1c1f4a;border-radius:14px;padding:1rem;margin:1rem;box-shadow:0 2px 8px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:1rem;animation:fadeIn .4s ease;";

  const isLong = String(p.PositionType).toLowerCase()==="long";
  const sideColor = isLong ? "#4ade80" : "#f87171";

  card.appendChild(html(`
    <div class="trade-header" style="display:flex;justify-content:space-between;align-items:center;background:transparent;margin:0;padding:0;">
      <div>
        <div style="font-weight:700;color:#fff;">${escapeHtml(p.Team)} • ${escapeHtml(p.Player)}</div>
        <div style="opacity:.8;font-size:.9rem;">Round ${raw(p.RoundNumber)} • ${escapeHtml(p.Scrip)}</div>
      </div>
      <div style="font-weight:800;color:${sideColor};text-transform:uppercase;">${escapeHtml(p.PositionType)}</div>
    </div>
  `));

  /* ==================== ENTRIES ==================== */
  const entries = document.createElement("div");
  entries.innerHTML = `
    <div>Entries</div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th style="text-align:left;">#</th>
          <th style="text-align:right;">Qty</th>
          <th style="text-align:right;">Entry</th>
          <th style="text-align:right;">Entry Total</th>
          <th style="text-align:right;"></th>
        </tr></thead>
        <tbody>
          ${p.legs.map((l,idx)=>`
            <tr data-row="${l.RowIndex}">
              <td class="idx-cell">${idx+1}</td>
              <td style="text-align:right;" class="v-qty">${raw(l.Qty)}</td>
              <td style="text-align:right;" class="v-entry">${raw(l.EntryPrice)}</td>
              <td style="text-align:right;" class="v-total">${raw(l.EntryTotal)}</td>
              <td style="text-align:right;"><button class="edit-entry">Edit</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  card.appendChild(entries);

  $$("button.edit-entry", entries).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tr = btn.closest("tr");
      const rowIndex = Number(tr.getAttribute("data-row"));
      const vQty = $(".v-qty", tr).textContent;
      const vEntry = $(".v-entry", tr).textContent;
      tr.innerHTML = `
        <td colspan="5">
          <div style="display:flex;gap:.6rem;align-items:end;flex-wrap:wrap;justify-content:space-between;">
            <div><label>Qty<br><input type="number" step="any" class="iq" value="${vQty}" style="width:8rem;"></label></div>
            <div><label>Entry<br><input type="number" step="any" class="ie" value="${vEntry}" style="width:8rem;"></label></div>
            <div style="align-self:flex-end;opacity:.85;">Est. Total: <strong class="est-entry-row">0</strong></div>
            <div>
              <button class="save-entry">Save</button>
              <button class="cancel-entry" style="background:#374151;">Cancel</button>
            </div>
          </div>
        </td>
      `;
      const recalc = ()=>{
        const q = Number($(".iq", tr).value||0);
        const e = Number($(".ie", tr).value||0);
        $(".est-entry-row", tr).textContent = (q>0 && e>0) ? String(q*e) : "0";
      };
      $(".iq", tr).addEventListener("input", recalc);
      $(".ie", tr).addEventListener("input", recalc);
      recalc();

      $(".save-entry", tr).addEventListener("click", async ()=>{
        const Qty = Number($(".iq", tr).value || 0);
        const EntryPrice = Number($(".ie", tr).value || 0);
        if (Qty<=0 || EntryPrice<=0) return alert("Qty and Entry must be > 0.");
        const body = new URLSearchParams({ action:"updateTradeLeg", RowIndex: rowIndex, Qty, EntryPrice });
        const res = await fetch(API_URL, { method:"POST", body });
        const j = await res.json();
        if (!j.ok) return alert(j.error || "Update failed.");
        load();
      });
      $(".cancel-entry", tr).addEventListener("click", load);
    });
  });

  // add entry leg (if allowed)
  if (p.LegsCount < 4 && Number(p.RemainingCapital||0) > 0) {
    const add = document.createElement("div");
    add.style = "display:flex;gap:.6rem;align-items:end;flex-wrap:wrap;";
    add.innerHTML = `
      <div style="font-weight:700;width:100%;">Add Entry</div>
      <div><label>Qty<br><input type="number" step="any" class="aq" style="width:8rem;"></label></div>
      <div><label>Entry<br><input type="number" step="any" class="ae" style="width:8rem;"></label></div>
      <div style="align-self:flex-end;opacity:.85;">Est. Total: <strong class="est-entry-total">0</strong></div>
      <button class="add">Add Leg</button>
      <div>Remaining Capital: <strong>${raw(p.RemainingCapital)}</strong></div>
    `;
    card.appendChild(add);

    const updEst = ()=>{
      const q = Number($(".aq", add).value||0);
      const e = Number($(".ae", add).value||0);
      $(".est-entry-total", add).textContent = (q>0 && e>0) ? String(q*e) : "0";
    };
    $(".aq", add).addEventListener("input", updEst);
    $(".ae", add).addEventListener("input", updEst);

    $(".add", add).addEventListener("click", async ()=>{
      const Qty = Number($(".aq", add).value || 0);
      const EntryPrice = Number($(".ae", add).value || 0);
      if (Qty<=0 || EntryPrice<=0) return alert("Qty and Entry must be > 0.");
      const body = new URLSearchParams({ action:"addTradeLeg", TradeID: p.TradeID, Qty, EntryPrice });
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Add leg failed.");
      load();
    });
  }

  /* ==================== EXITS ==================== */
  const exitsWrap = document.createElement("div");
  exitsWrap.dataset.section = "exits";
  const exits = (p.Exits || []).map((e,i)=>({
    ...e,
    ExitNumber: e.ExitNumber || (i+1),
    IsExecuted: (String(e.IsExecuted).toUpperCase()==="TRUE")
  }));

  exitsWrap.innerHTML = `
    <div style="font-weight:700;">Exits</div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th style="text-align:left;">#</th>
          <th style="text-align:right;">Qty</th>
          <th style="text-align:right;">Exit Price</th>
          <th style="text-align:right;">SL</th>
          <th style="text-align:right;">Exit Total</th>
          <th style="text-align:right;"></th>
        </tr></thead>
        <tbody>
          ${exits.map((e)=> e.IsExecuted
            ? renderExitTextRowHTML(e)
            : renderExitEditableRowHTML(e)
          ).join("")}
        </tbody>
      </table>
    </div>
  `;
  card.appendChild(exitsWrap);

  bindExitEditableHandlers(exitsWrap, card, p);
  bindExitExecutedHandlers(exitsWrap, card, p);

  // Add exit plan
  const totalQty = Number(p.TotalQty||0);
  const plannedExitQty = exits.reduce((a,e)=>a + Number(e.Qty||0), 0);
  const remainingQty = Math.max(0, totalQty - plannedExitQty);

  if ((p.ExitsCount || 0) < 4 && remainingQty > 0) {
    const addX = document.createElement("div");
    addX.style = "display:flex;gap:.6rem;align-items:end;flex-wrap:wrap;";
    addX.innerHTML = `
      <div style="font-weight:700;width:100%;">Add Exit</div>
      <div><label>Qty (required)<br><input type="number" step="any" class="xaq" value="${raw(remainingQty)}" style="width:8rem;"></label></div>
      <div><label>Exit Price (optional)<br><input type="number" step="any" class="xae" style="width:8rem;"></label></div>
      <div><label>SL (optional)<br><input type="number" step="any" class="xas" style="width:8rem;"></label></div>
      <div style="align-self:flex-end;opacity:.85;">
        Target Total: <strong class="est-exit-target">0</strong>
        &nbsp;•&nbsp;
        SL Total: <strong class="est-exit-sl">0</strong>
      </div>
      <button class="add-exit">Add Exit</button>
      <div style="margin-left:auto;opacity:.8;">Remaining Qty: <strong class="remain-qty">${raw(remainingQty)}</strong></div>
    `;
    card.appendChild(addX);

    const updExitEst = ()=>{
      const q  = Number($(".xaq", addX).value||0);
      const ep = Number($(".xae", addX).value||0);
      const sl = Number($(".xas", addX).value||0);
      $(".est-exit-target", addX).textContent = (q>0 && ep>0) ? String(q*ep) : "0";
      $(".est-exit-sl", addX).textContent     = (q>0 && sl>0) ? String(q*sl) : "0";
    };
    $(".xaq", addX).addEventListener("input", updExitEst);
    $(".xae", addX).addEventListener("input", updExitEst);
    $(".xas", addX).addEventListener("input", updExitEst);
    updExitEst();

    $(".add-exit", addX).addEventListener("click", async ()=>{
      const Qty = Number($(".xaq", addX).value || 0);
      const ExitPrice = $(".xae", addX).value === "" ? "" : Number($(".xae", addX).value);
      const StopLoss = $(".xas", addX).value === "" ? "" : $(".xas", addX).value;
      if (Qty<=0) return alert("Qty is required and must be > 0.");
      const body = new URLSearchParams({ action:"addExitPlan", TradeID: p.TradeID, Qty });
      if (ExitPrice !== "") body.append("ExitPrice", ExitPrice);
      if (StopLoss !== "") body.append("StopLoss", StopLoss);
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Add exit failed.");
      load();
    });
  }

  /* ==================== TOTALS + PNL ==================== */
  const totals = document.createElement("div");
  totals.style = "padding-top:.25rem;border-top:1px dashed #3f4280;display:flex;gap:1rem;flex-wrap:wrap;align-items:center;";
  totals.innerHTML = `
    <div>${badge(`Entry • Qty ${raw(p.TotalQty||0)} • Avg ${raw(p.AvgEntryPrice||0)} • Total ${raw(p.TotalEntryValue||0)}`)}</div>
    <div>${badge(`Exit • Qty <span class="exit-qty">0</span> • Avg <span class="exit-avg">0</span> • Total <span class="exit-total">0</span>`)}</div>
    <div>${badge(`Remaining Qty <span class="remaining-qty">0</span>`)}</div>
    <div style="flex-basis:100%;display:flex;gap:.75rem;flex-wrap:wrap;">
      <span style="font-weight:700;color:#e5e7eb;">Exit PnL:</span>
      <span class="pnl-exit" style="font-weight:800;color:${toneColor(0)};">${fmt2(0)}% (${fmt2(0)})</span>
      <span style="opacity:.6;">|</span>
      <span style="font-weight:700;color:#e5e7eb;">SL PnL:</span>
      <span class="pnl-sl" style="font-weight:800;color:${toneColor(0)};">${fmt2(0)}% (${fmt2(0)})</span>
    </div>
  `;
  card.appendChild(totals);

  const actions = document.createElement("div");
  actions.style = "display:flex;gap:.6rem;justify-content:flex-end;align-items:center;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close Trade";
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  updateTotalsFromDOM(card, p, closeBtn);

  closeBtn.addEventListener("click", async ()=>{
    if (!confirm("Close this grouped trade? This finalizes P&L and removes the active rows.")) return;
    const body = new URLSearchParams({ action:"closeGroupedTrade", TradeID: p.TradeID });
    const res = await fetch(API_URL, { method:"POST", body });
    const j = await res.json();
    if (!j.ok) return alert(j.error || "Close failed.");
    alert(`Closed. Total PnL: ${raw(j.PnL)}`);
    load();
  });

  return card;
}

/* =============== Exit row renderers & binders =============== */
function renderExitEditableRowHTML(e){
  return `
    <tr data-row="${e.RowIndex}">
      <td class="exit-idx">${raw(e.ExitNumber)}</td>
      <td style="text-align:right;"><input type="number" step="any" class="xq" value="${raw(e.Qty)}" style="width:7.5rem;"></td>
      <td style="text-align:right;"><input type="number" step="any" class="xp" value="${raw(e.ExitPrice)}" style="width:7.5rem;"></td>
      <td style="text-align:right;"><input type="number" step="any" class="xs" value="${e.StopLoss||""}" style="width:7.5rem;"></td>
      <td style="text-align:right;" class="xt">${raw(e.ExitTotal)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="upd-exit">Update</button>
        <button class="exec-exit" style="margin-left:.35rem;background:#10b981;">Execute @ Target</button>
        <button class="exec-sl" style="margin-left:.35rem;background:#f59e0b;">Execute @ SL</button>
        <button class="del-exit" style="margin-left:.35rem;background:#ef4444;">Delete</button>
      </td>
    </tr>
  `;
}

function renderExitTextRowHTML(e){
  const q  = Number(e.Qty||0);
  const px = (e.ExitPrice===""||e.ExitPrice==null) ? undefined : Number(e.ExitPrice);
  const sl = (e.StopLoss==="" ||e.StopLoss==null) ? undefined : Number(e.StopLoss);
  const total = (e.ExitTotal===""||e.ExitTotal==null) ? undefined : Number(e.ExitTotal);
  const near = (a,b)=> (isFinite(a)&&isFinite(b) && Math.abs(a-b) <= Math.max(1e-8, 1e-8*Math.abs(a)));

  let executedVia = e.ExecMode || null;
  if (!executedVia) {
    if (sl!==undefined && total!==undefined && near(total, q*sl) && !(px!==undefined && near(total, q*px))) executedVia = "sl";
    else executedVia = "target";
  }

  const targetStyle = executedVia==="target" ? "box-shadow:0 0 0 2px rgba(74,222,128,.5) inset;border-radius:6px;padding:.2rem .4rem;" : "";
  const slStyle     = executedVia==="sl"     ? "box-shadow:0 0 0 2px rgba(245,158,11,.6) inset;border-radius:6px;padding:.2rem .4rem;" : "";
  const tag = executedVia==="sl" ? badge("executed • SL","neutral2") : badge("executed • Target","pos");
  return `
    <tr data-row="${e.RowIndex}">
      <td class="exit-idx">${raw(e.ExitNumber)} ${tag}</td>
      <td style="text-align:right;" class="tq">${raw(e.Qty)}</td>
      <td style="text-align:right;${targetStyle}" class="tp">${(px===undefined ? "—" : raw(px))}</td>
      <td style="text-align:right;${slStyle}" class="ts">${(sl===undefined ? "—" : raw(sl))}</td>
      <td style="text-align:right;" class="tt">${raw(e.ExitTotal)}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="edit-executed">Edit</button>
        <button class="del-exit" style="margin-left:.35rem;background:#ef4444;">Delete</button>
      </td>
    </tr>
  `;
}

function bindExitEditableHandlers(exitsWrap, card, p){
  $$("button.upd-exit", exitsWrap).forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const tr = btn.closest("tr");
      const RowIndex = Number(tr.getAttribute("data-row"));
      const Qty = Number($(".xq", tr).value || 0);
      const ExitPrice = $(".xp", tr).value === "" ? "" : Number($(".xp", tr).value);
      const StopLoss = $(".xs", tr).value === "" ? "" : $(".xs", tr).value;
      if (Qty<=0) return alert("Qty must be > 0.");
      const body = new URLSearchParams({ action:"updateExitPlan", RowIndex, Qty });
      if (ExitPrice !== "") body.append("ExitPrice", ExitPrice);
      if (StopLoss !== "") body.append("StopLoss", StopLoss);
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Update failed.");
      load();
    });
  });

  $$("button.exec-exit", exitsWrap).forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const tr = btn.closest("tr");
      const RowIndex = Number(tr.getAttribute("data-row"));
      const qtyVal = $(".xq", tr).value;
      const priceVal = $(".xp", tr).value;
      const slVal = $(".xs", tr).value;
      if (priceVal === "" || Number(priceVal) <= 0) {
        return alert("Please enter the actual Exit Price to execute @ Target.");
      }
      if (!confirm("Execute this exit @ Target?")) return;
      const body = new URLSearchParams({ action:"markExitExecuted", RowIndex });
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Could not execute @ Target.");
      tr.innerHTML = renderExitTextRowHTML({
        RowIndex, ExitNumber: $(".exit-idx", tr)?.textContent?.trim() || "",
        Qty: qtyVal, ExitPrice: priceVal, StopLoss: slVal,
        ExitTotal: (qtyVal!=="" && priceVal!=="") ? String(Number(qtyVal)*Number(priceVal)) : "",
        ExecMode: "target"
      });
      bindExitExecutedHandlersOnRow(tr, card, p);
      updateTotalsFromDOM(card, p);
    });
  });

  $$("button.exec-sl", exitsWrap).forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const tr = btn.closest("tr");
      const RowIndex = Number(tr.getAttribute("data-row"));
      const qtyVal = $(".xq", tr).value;
      const priceValBefore = $(".xp", tr).value;
      const slVal = $(".xs", tr).value;
      if (slVal === "" || Number(slVal) <= 0) {
        return alert("Please enter a valid SL to execute @ SL.");
      }
      if (!confirm("Execute this exit @ SL?")) return;
      const body = new URLSearchParams({ action:"markExitExecutedAtSL", RowIndex });
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Could not execute @ SL.");
      tr.innerHTML = renderExitTextRowHTML({
        RowIndex, ExitNumber: $(".exit-idx", tr)?.textContent?.trim() || "",
        Qty: qtyVal, ExitPrice: priceValBefore, StopLoss: slVal,
        ExitTotal: (qtyVal!=="" && slVal!=="") ? String(Number(qtyVal)*Number(slVal)) : "",
        ExecMode: "sl"
      });
      bindExitExecutedHandlersOnRow(tr, card, p);
      updateTotalsFromDOM(card, p);
    });
  });

  $$("button.del-exit", exitsWrap).forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if (!confirm("Delete this exit plan?")) return;
      const tr = btn.closest("tr");
      const RowIndex = Number(tr.getAttribute("data-row"));
      const body = new URLSearchParams({ action:"deleteExitPlan", RowIndex });
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Delete failed.");
      load();
    });
  });
}

function bindExitExecutedHandlers(exitsWrap, card, p){
  $$("button.edit-executed", exitsWrap).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tr = btn.closest("tr");
      const RowIndex = Number(tr.getAttribute("data-row"));
      const numCell = $(".exit-idx", tr).textContent.trim();
      const Q = $(".tq", tr).textContent.trim();
      const P = $(".tp", tr).textContent.trim();
      const S = $(".ts", tr).textContent.trim();
      tr.innerHTML = renderExitEditableRowHTML({
        RowIndex, ExitNumber: numCell, Qty: Q, ExitPrice: P==="—"? "":P, StopLoss: (S==="—"?"":S), ExitTotal: ""
      });
      bindExitEditableHandlersOnRow(tr, card, p);
    });
  });

  $$("button.del-exit", exitsWrap).forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      if (!confirm("Delete this exit plan?")) return;
      const tr = btn.closest("tr");
      const RowIndex = Number(tr.getAttribute("data-row"));
      const body = new URLSearchParams({ action:"deleteExitPlan", RowIndex });
      const res = await fetch(API_URL, { method:"POST", body });
      const j = await res.json();
      if (!j.ok) return alert(j.error || "Delete failed.");
      load();
    });
  });
}

function bindExitExecutedHandlersOnRow(tr, card, p){
  $(".edit-executed", tr).addEventListener("click", ()=>{
    const RowIndex = Number(tr.getAttribute("data-row"));
    const numCell = $(".exit-idx", tr).textContent.trim();
    const Q = $(".tq", tr).textContent.trim();
    const P = $(".tp", tr).textContent.trim();
    const S = $(".ts", tr).textContent.trim();
    tr.innerHTML = renderExitEditableRowHTML({
      RowIndex, ExitNumber: numCell, Qty: Q, ExitPrice: P==="—"?"":P, StopLoss: (S==="—"?"":S), ExitTotal: ""
    });
    bindExitEditableHandlersOnRow(tr, card, p);
  });
  $(".del-exit", tr).addEventListener("click", async ()=>{
    if (!confirm("Delete this exit plan?")) return;
    const RowIndex = Number(tr.getAttribute("data-row"));
    const body = new URLSearchParams({ action:"deleteExitPlan", RowIndex });
    const res = await fetch(API_URL, { method:"POST", body });
    const j = await res.json();
    if (!j.ok) return alert(j.error || "Delete failed.");
    load();
  });
}
function bindExitEditableHandlersOnRow(tr, card, p){
  $(".upd-exit", tr).addEventListener("click", async ()=>{
    const RowIndex = Number(tr.getAttribute("data-row"));
    const Qty = Number($(".xq", tr).value || 0);
    const ExitPrice = $(".xp", tr).value === "" ? "" : Number($(".xp", tr).value);
    const StopLoss = $(".xs", tr).value === "" ? "" : $(".xs", tr).value;
    if (Qty<=0) return alert("Qty must be > 0.");
    const body = new URLSearchParams({ action:"updateExitPlan", RowIndex, Qty });
    if (ExitPrice !== "") body.append("ExitPrice", ExitPrice);
    if (StopLoss !== "") body.append("StopLoss", StopLoss);
    const res = await fetch(API_URL, { method:"POST", body });
    const j = await res.json();
    if (!j.ok) return alert(j.error || "Update failed.");
    load();
  });
  $(".exec-exit", tr).addEventListener("click", async ()=>{
    const RowIndex = Number(tr.getAttribute("data-row"));
    const qtyVal = $(".xq", tr).value;
    const priceVal = $(".xp", tr).value;
    const slVal = $(".xs", tr).value;
    if (priceVal === "" || Number(priceVal) <= 0) {
      return alert("Please enter the actual Exit Price to execute @ Target.");
    }
    if (!confirm("Execute this exit @ Target?")) return;
    const body = new URLSearchParams({ action:"markExitExecuted", RowIndex });
    const res = await fetch(API_URL, { method:"POST", body });
    const j = await res.json();
    if (!j.ok) return alert(j.error || "Could not execute @ Target.");
    tr.innerHTML = renderExitTextRowHTML({
      RowIndex, ExitNumber: $(".exit-idx", tr)?.textContent?.trim() || "",
      Qty: qtyVal, ExitPrice: priceVal, StopLoss: slVal,
      ExitTotal: (qtyVal!=="" && priceVal!=="") ? String(Number(qtyVal)*Number(priceVal)) : "",
      ExecMode: "target"
    });
    bindExitExecutedHandlersOnRow(tr, card, p);
    updateTotalsFromDOM(card, p);
  });
  $(".exec-sl", tr).addEventListener("click", async ()=>{
    const RowIndex = Number(tr.getAttribute("data-row"));
    const qtyVal = $(".xq", tr).value;
    const priceValBefore = $(".xp", tr).value;
    const slVal = $(".xs", tr).value;
    if (slVal === "" || Number(slVal) <= 0) {
      return alert("Please enter a valid SL to execute @ SL.");
    }
    if (!confirm("Execute this exit @ SL?")) return;
    const body = new URLSearchParams({ action:"markExitExecutedAtSL", RowIndex });
    const res = await fetch(API_URL, { method:"POST", body });
    const j = await res.json();
    if (!j.ok) return alert(j.error || "Could not execute @ SL.");
    tr.innerHTML = renderExitTextRowHTML({
      RowIndex, ExitNumber: $(".exit-idx", tr)?.textContent?.trim() || "",
      Qty: qtyVal, ExitPrice: priceValBefore, StopLoss: slVal,
      ExitTotal: (qtyVal!=="" && slVal!=="") ? String(Number(qtyVal)*Number(slVal)) : "",
      ExecMode: "sl"
    });
    bindExitExecutedHandlersOnRow(tr, card, p);
    updateTotalsFromDOM(card, p);
  });
  $(".del-exit", tr).addEventListener("click", async ()=>{
    if (!confirm("Delete this exit plan?")) return;
    const RowIndex = Number(tr.getAttribute("data-row"));
    const body = new URLSearchParams({ action:"deleteExitPlan", RowIndex });
    const res = await fetch(API_URL, { method:"POST", body });
    const j = await res.json();
    if (!j.ok) return alert(j.error || "Delete failed.");
    load();
  });
}

/* ==================== Totals & Close button logic ==================== */
function updateTotalsFromDOM(card, p, closeBtnOpt){
  const isLong = String(p.PositionType).toLowerCase()==="long";
  const sign = isLong ? 1 : -1;

  const exitsSection = card.querySelector('[data-section="exits"]');
  const exitRows = exitsSection ? Array.from(exitsSection.querySelectorAll('tbody tr')) : [];

  let exitQtyTotal = 0;
  let exitValueTotal = 0;
  let exitQtyWithPrice = 0;
  let pnlExit = 0;
  let pnlSL = 0;
  let exitQtyWithSL = 0;

  const totalQty = Number(p.TotalQty||0);
  const avgEntry = totalQty ? Number(p.TotalEntryValue||0)/totalQty : 0;

  exitRows.forEach(tr=>{
    let q;
    const qInput = $(".xq", tr);
    if (qInput) q = Number(qInput.value || 0);
    else q = Number(($(".tq", tr)?.textContent || "0").trim());
    if (!isNaN(q)) exitQtyTotal += q;

    let px;
    const pInput = $(".xp", tr);
    if (pInput && pInput.value!=="") px = Number(pInput.value);
    else {
      const tp = $(".tp", tr)?.textContent?.trim();
      px = (tp && tp!=="—") ? Number(tp) : undefined;
    }
    if (px!==undefined && !isNaN(px)) {
      exitValueTotal += q * px;
      exitQtyWithPrice += q;
      pnlExit += q * (px - avgEntry) * sign;
    }

    let sl;
    const sInput = $(".xs", tr);
    if (sInput && sInput.value!=="") sl = Number(sInput.value);
    else {
      const ts = $(".ts", tr)?.textContent?.trim();
      sl = (ts && ts!=="—") ? Number(ts) : undefined;
    }
    if (sl!==undefined && !isNaN(sl)) {
      exitQtyWithSL += q;
      pnlSL += q * (sl - avgEntry) * sign;
    }
  });

  const avgExit = exitQtyWithPrice>0 ? (exitValueTotal/exitQtyWithPrice) : 0;
  const remain = Math.max(0, totalQty - exitQtyTotal);

  $(".exit-qty", card).textContent = raw(exitQtyTotal);
  $(".exit-total", card).textContent = raw(exitValueTotal);
  $(".exit-avg", card).textContent = raw(avgExit);
  $(".remaining-qty", card).textContent = raw(remain);

  const baseExit = (avgEntry * exitQtyWithPrice) || 0;
  const baseSL = (avgEntry * exitQtyWithSL) || 0;
  const pctExit = baseExit ? (pnlExit / baseExit) * 100 : 0;
  const pctSL = baseSL ? (pnlSL / baseSL) * 100 : 0;

  const pnlExitSpan = $(".pnl-exit", card);
  const pnlSlSpan = $(".pnl-sl", card);
  pnlExitSpan.textContent = `${fmt2(pctExit)}% (${fmt2(pnlExit)})`;
  pnlExitSpan.style.color = toneColor(pnlExit);
  pnlSlSpan.textContent = `${fmt2(pctSL)}% (${fmt2(pnlSL)})`;
  pnlSlSpan.style.color = toneColor(pnlSL);

  // Each exit row must be "executable": has Target OR SL OR already executed (has total)
  const allExitsExecutable = exitRows.every(tr=>{
    const q = $(".xq", tr)
      ? Number($(".xq", tr).value || 0)
      : Number(($(".tq", tr)?.textContent || "0").trim());
    if (!q) return true;

    const hasTarget = $(".xp", tr)
      ? ($(".xp", tr).value !== "" && Number($(".xp", tr).value) > 0)
      : (() => { const tp = $(".tp", tr)?.textContent?.trim(); return (tp && tp !== "—" && Number(tp) > 0); })();

    const hasSL = $(".xs", tr)
      ? ($(".xs", tr).value !== "" && Number($(".xs", tr).value) > 0)
      : (() => { const ts = $(".ts", tr)?.textContent?.trim(); return (ts && ts !== "—" && Number(ts) > 0); })();

    const tt = $(".tt", tr)?.textContent?.trim();
    const hasExecutedTotal = !!tt && tt !== "—" && !isNaN(Number(tt)) && Number(tt) > 0;

    return hasTarget || hasSL || hasExecutedTotal;
  });

  const closeBtn = closeBtnOpt || $$("button", card).find(b => b.textContent==="Close Trade");
  if (closeBtn) closeBtn.disabled = !(totalQty>0 && exitQtyTotal===totalQty && allExitsExecutable);
}

/* DOM utils */
function html(str){ const d=document.createElement("div"); d.innerHTML=str.trim(); return d.firstElementChild; }
function escapeHtml(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

load();
