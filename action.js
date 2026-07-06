import OBR, { buildLabel } from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";

const ID = "com.cyberpunktoolkit.app";
const SANDEVISTAN_KEY = `${ID}/sandevistan`;
const VEHICLE_KEY = `${ID}/vehicle`;
const LOADOUT_KEY = `${ID}/loadout`;
const ROUND_KEY = `${ID}/round`;
const LOG_KEY = `${ID}/log`;
const MAX_LOG_ENTRIES = 25;
const DEFAULT_SANDEVISTAN_ROUNDS = 3;

/** In-memory mirror of scene state, refreshed from OBR events. */
const state = {
  ready: false,
  items: [],
  sceneMetadata: {},
  selection: [],
};

let currentTab = "rounds";
let renderQueued = false;

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

OBR.onReady(async () => {
  wireStaticUI();

  OBR.scene.onReadyChange(async (ready) => {
    state.ready = ready;
    if (ready) await loadEverything();
    scheduleRender();
  });

  const sceneReady = await OBR.scene.isReady();
  state.ready = sceneReady;
  if (sceneReady) await loadEverything();

  OBR.scene.items.onChange((items) => {
    state.items = items;
    scheduleRender();
  });

  OBR.scene.onMetadataChange((metadata) => {
    state.sceneMetadata = metadata;
    scheduleRender();
  });

  OBR.player.onChange(async () => {
    state.selection = (await OBR.player.getSelection()) || [];
    scheduleRender();
  });

  scheduleRender();
});

async function loadEverything() {
  const [items, metadata, selection] = await Promise.all([
    OBR.scene.items.getItems(),
    OBR.scene.getMetadata(),
    OBR.player.getSelection(),
  ]);
  state.items = items;
  state.sceneMetadata = metadata;
  state.selection = selection || [];
}

// ---------------------------------------------------------------------
// Rendering plumbing
// ---------------------------------------------------------------------

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function withFocusPreserved(fn) {
  const active = document.activeElement;
  const id = active && active.id;
  const selStart = active && "selectionStart" in active ? active.selectionStart : null;
  const value = active && "value" in active ? active.value : null;
  fn();
  if (id) {
    const el = document.getElementById(id);
    if (el) {
      if (value !== null) el.value = value;
      el.focus();
      if (selStart !== null && el.setSelectionRange) {
        try { el.setSelectionRange(selStart, selStart); } catch {}
      }
    }
  }
}

function render() {
  withFocusPreserved(() => {
    renderStatus();
    renderRounds();
    renderArmory();
    renderSandevistan();
    renderVehicles();
    renderLog();
  });
}

function renderStatus() {
  const el = document.getElementById("scene-status");
  el.textContent = state.ready
    ? `${state.selection.length} token${state.selection.length === 1 ? "" : "s"} selected`
    : "Open a scene to jack in.";
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------

function wireStaticUI() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.toggle("active", p.dataset.tabPanel === currentTab));
    });
  });

  document.getElementById("main").addEventListener("click", onMainClick);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function itemById(id) {
  return state.items.find((i) => i.id === id);
}

function displayName(item) {
  return item.name && item.name.trim() ? item.name : "Unnamed token";
}

async function getDpiSafe() {
  try {
    return await OBR.scene.grid.getDpi();
  } catch {
    return 150;
  }
}

async function pushLog(text) {
  const metadata = await OBR.scene.getMetadata();
  const existing = Array.isArray(metadata[LOG_KEY]) ? metadata[LOG_KEY] : [];
  const entry = { text, t: Date.now() };
  const updated = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
  await OBR.scene.setMetadata({ [LOG_KEY]: updated });
}

function rollDamage(diceStr) {
  const match = String(diceStr || "").trim().match(/^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/i);
  if (!match) return null;
  const count = Math.min(parseInt(match[1], 10) || 1, 50);
  const sides = Math.max(parseInt(match[2], 10) || 6, 1);
  const sign = match[3] === "-" ? -1 : 1;
  const mod = match[4] ? sign * parseInt(match[4], 10) : 0;
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + mod;
  return { rolls, mod, total };
}

// ---------------------------------------------------------------------
// Event delegation
// ---------------------------------------------------------------------

function onMainClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const handler = actions[action];
  if (handler) handler(btn);
}

const actions = {
  "advance-round": advanceRound,
  "reset-round": resetRound,

  "enable-loadout": enableLoadoutForSelection,
  "add-weapon": addWeaponFromForm,
  "remove-weapon": removeWeapon,
  "fire-weapon": fireWeapon,
  "reload-weapon": reloadWeapon,
  "roll-damage": rollDamageFromRow,
  "remove-loadout": removeLoadout,

  "jack-in-selected": jackInSelected,
  "jack-out": jackOutItem,

  "mark-vehicle": markSelectedAsVehicle,
  "unmark-vehicle": unmarkVehicle,
  "board-vehicle": boardVehicle,
  "disembark": disembarkPassenger,
  "disembark-all": disembarkAll,

  "clear-log": clearLog,
};

// ---------------------------------------------------------------------
// ROUNDS TAB
// ---------------------------------------------------------------------

function renderRounds() {
  const round = state.sceneMetadata[ROUND_KEY] || 0;
  const el = document.getElementById("tab-rounds");
  if (!state.ready) {
    el.innerHTML = `<div class="empty-state">No scene is open yet. Open a scene in Owlbear Rodeo to start tracking rounds, ammo, and conditions.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-title-row">
        <span class="card-title">Combat Round</span>
      </div>
      <div class="round-display">${round}</div>
      <div class="row" style="margin-top:10px;">
        <button class="btn primary" data-action="advance-round">+1 Round</button>
        <button class="btn" data-action="reset-round">Reset</button>
      </div>
      <p style="color:var(--text-dim); font-size:11px; margin:10px 0 0;">
        Advancing the round ticks down every active Sandevistan timer and auto-jacks-out
        anyone who hits zero.
      </p>
    </div>
    <div class="card">
      <div class="card-title-row"><span class="card-title">Quick Reference</span></div>
      <p style="color:var(--text-dim); font-size:11.5px; line-height:1.6; margin:0;">
        Right-click any token on the map for quick actions:<br/>
        ⚡ <strong style="color:var(--text)">Jack In / Jack Out</strong> — toggle Sandevistan<br/>
        🚗 <strong style="color:var(--text)">Mark / Unmark Vehicle</strong> — designate a mount or ride<br/>
        🖥 <strong style="color:var(--text)">Open Cyberpunk Toolkit</strong> — opens this panel
      </p>
    </div>
  `;
}

async function advanceRound() {
  const metadata = await OBR.scene.getMetadata();
  const round = (metadata[ROUND_KEY] || 0) + 1;
  await OBR.scene.setMetadata({ [ROUND_KEY]: round });

  const withSandevistan = await OBR.scene.items.getItems(
    (item) => Boolean(item.metadata[SANDEVISTAN_KEY])
  );
  if (!withSandevistan.length) return;

  const expiredLabelIds = [];
  const labelUpdates = [];

  await OBR.scene.items.updateItems(
    withSandevistan.map((i) => i.id),
    (items) => {
      for (const item of items) {
        const s = item.metadata[SANDEVISTAN_KEY];
        if (!s || typeof s.rounds !== "number") continue;
        s.rounds -= 1;
        if (s.rounds <= 0) {
          if (s.labelId) expiredLabelIds.push(s.labelId);
          delete item.metadata[SANDEVISTAN_KEY];
        } else if (s.labelId) {
          labelUpdates.push({ labelId: s.labelId, rounds: s.rounds });
        }
      }
    }
  );

  if (expiredLabelIds.length) {
    await OBR.scene.items.deleteItems(expiredLabelIds);
  }
  for (const { labelId, rounds } of labelUpdates) {
    await OBR.scene.items.updateItems([labelId], (labels) => {
      for (const label of labels) {
        if (label.text) label.text.plainText = `⚡ SANDEVISTAN (${rounds})`;
      }
    });
  }
}

async function resetRound() {
  await OBR.scene.setMetadata({ [ROUND_KEY]: 0 });
}

// ---------------------------------------------------------------------
// ARMORY TAB (ammo + damage)
// ---------------------------------------------------------------------

function renderArmory() {
  const el = document.getElementById("tab-armory");
  if (!state.ready) {
    el.innerHTML = `<div class="empty-state">Open a scene to manage weapons.</div>`;
    return;
  }

  const loadoutItems = state.items.filter((i) => i.metadata[LOADOUT_KEY]);

  const enableCard = `
    <div class="card">
      <div class="card-title-row"><span class="card-title">Add a Loadout</span></div>
      <p style="color:var(--text-dim); font-size:11.5px; margin:0 0 8px;">
        Select one or more tokens on the map, then enable a loadout to start tracking their weapons.
      </p>
      <button class="btn primary" data-action="enable-loadout" ${state.selection.length ? "" : "disabled"}>
        Enable Loadout for Selected (${state.selection.length})
      </button>
    </div>
  `;

  const cards = loadoutItems.map(renderLoadoutCard).join("");

  el.innerHTML =
    enableCard +
    (loadoutItems.length
      ? cards
      : `<div class="empty-state">No tokens have a loadout yet. Select a token above to get started.</div>`);
}

function renderLoadoutCard(item) {
  const data = item.metadata[LOADOUT_KEY] || { weapons: [] };
  const weapons = Array.isArray(data.weapons) ? data.weapons : [];

  const weaponRows = weapons
    .map((w) => {
      const cur = Number.isFinite(w.cur) ? w.cur : 0;
      const max = Number.isFinite(w.max) && w.max > 0 ? w.max : Math.max(cur, 1);
      const pips = Array.from({ length: Math.min(max, 30) })
        .map((_, i) => `<span class="pip${i < cur ? " loaded" : ""}"></span>`)
        .join("");
      const empty = cur <= 0;
      return `
        <div class="weapon-row" data-weapon-id="${w.id}">
          <div class="row between">
            <span class="weapon-name">${escapeHtml(w.name)}</span>
            <span class="weapon-dmg">${escapeHtml(w.dmg || "—")}</span>
          </div>
          <div class="clip">${pips}</div>
          <div class="row between">
            <span class="ammo-readout${empty ? " empty" : ""}">${cur}/${max}${empty ? "  EMPTY — RELOAD" : ""}</span>
            <span class="row">
              <button class="btn small" data-action="fire-weapon" data-item="${item.id}" data-weapon="${w.id}">Fire</button>
              <button class="btn small cyan" data-action="reload-weapon" data-item="${item.id}" data-weapon="${w.id}">Reload</button>
              <button class="btn small" data-action="roll-damage" data-item="${item.id}" data-weapon="${w.id}">Roll Dmg</button>
              <button class="icon-btn" data-action="remove-weapon" data-item="${item.id}" data-weapon="${w.id}" title="Remove weapon">✕</button>
            </span>
          </div>
          <div class="roll-out" id="roll-${w.id}"></div>
        </div>
      `;
    })
    .join("");

  const formId = `weapon-form-${item.id}`;

  return `
    <div class="card">
      <div class="card-title-row">
        <span class="card-title">${escapeHtml(displayName(item))}</span>
        <button class="icon-btn" data-action="remove-loadout" data-item="${item.id}" title="Remove loadout tracking">✕</button>
      </div>
      ${weaponRows || `<p style="color:var(--text-dim); font-size:11.5px; margin:4px 0;">No weapons yet.</p>`}
      <div class="row wrap" id="${formId}" style="margin-top:8px; border-top:1px solid var(--line); padding-top:8px;">
        <input type="text" id="${formId}-name" placeholder="Weapon (e.g. Militech Arms)" style="flex:1; min-width:110px;" />
        <input type="text" id="${formId}-dmg" placeholder="Dmg (2d6+1)" style="width:82px;" />
        <input type="number" id="${formId}-max" placeholder="Mag" min="1" style="width:56px;" />
        <button class="btn small primary" data-action="add-weapon" data-item="${item.id}" data-form="${formId}">Add</button>
      </div>
    </div>
  `;
}

async function enableLoadoutForSelection() {
  if (!state.selection.length) return;
  await OBR.scene.items.updateItems(state.selection, (items) => {
    for (const item of items) {
      if (!item.metadata[LOADOUT_KEY]) item.metadata[LOADOUT_KEY] = { weapons: [] };
    }
  });
}

async function removeLoadout(btn) {
  const itemId = btn.dataset.item;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) delete item.metadata[LOADOUT_KEY];
  });
}

async function addWeaponFromForm(btn) {
  const itemId = btn.dataset.item;
  const formId = btn.dataset.form;
  const nameInput = document.getElementById(`${formId}-name`);
  const dmgInput = document.getElementById(`${formId}-dmg`);
  const maxInput = document.getElementById(`${formId}-max`);

  const name = (nameInput?.value || "").trim() || "Unnamed Weapon";
  const dmg = (dmgInput?.value || "").trim();
  const max = Math.max(1, parseInt(maxInput?.value, 10) || 12);

  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const data = item.metadata[LOADOUT_KEY] || (item.metadata[LOADOUT_KEY] = { weapons: [] });
      if (!Array.isArray(data.weapons)) data.weapons = [];
      data.weapons.push({
        id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        dmg,
        cur: max,
        max,
      });
    }
  });
}

async function removeWeapon(btn) {
  const { item: itemId, weapon: weaponId } = btn.dataset;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const data = item.metadata[LOADOUT_KEY];
      if (data?.weapons) data.weapons = data.weapons.filter((w) => w.id !== weaponId);
    }
  });
}

async function fireWeapon(btn) {
  const { item: itemId, weapon: weaponId } = btn.dataset;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const w = item.metadata[LOADOUT_KEY]?.weapons?.find((w) => w.id === weaponId);
      if (w && w.cur > 0) w.cur -= 1;
    }
  });
}

async function reloadWeapon(btn) {
  const { item: itemId, weapon: weaponId } = btn.dataset;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) {
      const w = item.metadata[LOADOUT_KEY]?.weapons?.find((w) => w.id === weaponId);
      if (w) w.cur = w.max;
    }
  });
}

async function rollDamageFromRow(btn) {
  const { item: itemId, weapon: weaponId } = btn.dataset;
  const item = itemById(itemId);
  const weapon = item?.metadata[LOADOUT_KEY]?.weapons?.find((w) => w.id === weaponId);
  if (!weapon) return;

  const result = rollDamage(weapon.dmg);
  const out = document.getElementById(`roll-${weaponId}`);

  if (!result) {
    if (out) out.innerHTML = `<span class="roll-result" style="color:var(--red)">Damage must look like "2d6+1"</span>`;
    return;
  }

  if (out) {
    out.innerHTML = `<span class="roll-result">➜ ${result.total} dmg [${result.rolls.join(", ")}${result.mod ? (result.mod > 0 ? `+${result.mod}` : result.mod) : ""}]</span>`;
  }

  await pushLog(`${escapeHtml(displayName(item))}'s ${escapeHtml(weapon.name)} hits for ${result.total} dmg`);
}

// ---------------------------------------------------------------------
// SANDEVISTAN TAB
// ---------------------------------------------------------------------

function renderSandevistan() {
  const el = document.getElementById("tab-sandevistan");
  if (!state.ready) {
    el.innerHTML = `<div class="empty-state">Open a scene to manage Sandevistan states.</div>`;
    return;
  }

  const active = state.items.filter((i) => i.metadata[SANDEVISTAN_KEY]?.active);

  const controlCard = `
    <div class="card">
      <div class="card-title-row"><span class="card-title">Jack In</span></div>
      <p style="color:var(--text-dim); font-size:11.5px; margin:0 0 8px;">
        Select one or more tokens, set a duration, and go loud. Leave duration blank to run
        until manually ended.
      </p>
      <div class="row">
        <input type="number" id="sandy-rounds" min="1" placeholder="${DEFAULT_SANDEVISTAN_ROUNDS}" style="width:70px;" />
        <button class="btn primary" data-action="jack-in-selected" ${state.selection.length ? "" : "disabled"}>
          Jack In Selected (${state.selection.length})
        </button>
      </div>
    </div>
  `;

  const list = active
    .map((item) => {
      const s = item.metadata[SANDEVISTAN_KEY];
      const badge =
        typeof s.rounds === "number"
          ? `<span class="sandy-badge">⚡ ${s.rounds} round${s.rounds === 1 ? "" : "s"} left</span>`
          : `<span class="sandy-badge">⚡ active — manual</span>`;
      return `
        <div class="card">
          <div class="row between">
            <div>
              <div class="card-title" style="font-size:13px;">${escapeHtml(displayName(item))}</div>
              ${badge}
            </div>
            <button class="btn small danger" data-action="jack-out" data-item="${item.id}">Jack Out</button>
          </div>
        </div>
      `;
    })
    .join("");

  el.innerHTML =
    controlCard +
    (active.length ? list : `<div class="empty-state">No one is currently overclocked.</div>`);
}

async function jackInSelected() {
  if (!state.selection.length) return;
  const input = document.getElementById("sandy-rounds")?.value;
  const rounds = input && input.trim() !== "" ? Math.max(1, parseInt(input, 10)) : null;

  const targets = state.selection.map(itemById).filter(Boolean);
  if (!targets.length) return;

  const dpi = await getDpiSafe();

  const labels = targets.map((item) =>
    buildLabel()
      .position({ x: item.position.x, y: item.position.y - dpi * 0.65 })
      .attachedTo(item.id)
      .plainText(rounds ? `⚡ SANDEVISTAN (${rounds})` : "⚡ SANDEVISTAN")
      .fontWeight(700)
      .fontSize(dpi * 0.16)
      .fillColor("#FCEE0A")
      .backgroundColor("#0d0d0f")
      .backgroundOpacity(0.9)
      .pointerHeight(0)
      .disableHit(true)
      .locked(true)
      .build()
  );

  await OBR.scene.items.addItems(labels);

  await OBR.scene.items.updateItems(
    targets.map((t) => t.id),
    (items) => {
      items.forEach((item, index) => {
        item.metadata[SANDEVISTAN_KEY] = { active: true, rounds, labelId: labels[index].id };
      });
    }
  );
}

async function jackOutItem(btn) {
  const itemId = btn.dataset.item;
  const item = itemById(itemId);
  const labelId = item?.metadata[SANDEVISTAN_KEY]?.labelId;

  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) delete item.metadata[SANDEVISTAN_KEY];
  });

  if (labelId) await OBR.scene.items.deleteItems([labelId]);
}

// ---------------------------------------------------------------------
// VEHICLES TAB
// ---------------------------------------------------------------------

function renderVehicles() {
  const el = document.getElementById("tab-vehicles");
  if (!state.ready) {
    el.innerHTML = `<div class="empty-state">Open a scene to manage vehicles.</div>`;
    return;
  }

  const vehicles = state.items.filter((i) => i.metadata[VEHICLE_KEY]?.isVehicle);

  const controlCard = `
    <div class="card">
      <div class="card-title-row"><span class="card-title">New Vehicle</span></div>
      <p style="color:var(--text-dim); font-size:11.5px; margin:0 0 8px;">
        Select a car, bike, or AV token, then mark it as a vehicle. Passengers attached to it
        will move together automatically.
      </p>
      <button class="btn primary" data-action="mark-vehicle" ${state.selection.length ? "" : "disabled"}>
        Mark Selected as Vehicle
      </button>
    </div>
  `;

  const cards = vehicles.map((vehicle) => renderVehicleCard(vehicle)).join("");

  el.innerHTML =
    controlCard +
    (vehicles.length ? cards : `<div class="empty-state">No vehicles yet. Mark one above to get rolling.</div>`);
}

function renderVehicleCard(vehicle) {
  const passengers = state.items.filter((i) => i.attachedTo === vehicle.id);
  const name = vehicle.metadata[VEHICLE_KEY]?.name || displayName(vehicle);

  const chips = passengers
    .map(
      (p) => `
      <span class="passenger-chip">
        ${escapeHtml(displayName(p))}
        <button class="icon-btn" data-action="disembark" data-item="${p.id}" title="Disembark">✕</button>
      </span>`
    )
    .join("");

  return `
    <div class="card">
      <div class="card-title-row">
        <span class="card-title">🚗 ${escapeHtml(name)} <span class="tag">${passengers.length} aboard</span></span>
        <button class="icon-btn" data-action="unmark-vehicle" data-item="${vehicle.id}" title="Unmark vehicle">✕</button>
      </div>
      <div>${chips || `<span style="color:var(--text-dim); font-size:11.5px;">Empty ride.</span>`}</div>
      <div class="row" style="margin-top:8px;">
        <button class="btn small primary" data-action="board-vehicle" data-item="${vehicle.id}"
          ${state.selection.length ? "" : "disabled"}>
          Board Selected (${state.selection.length})
        </button>
        ${passengers.length ? `<button class="btn small danger" data-action="disembark-all" data-item="${vehicle.id}">Disembark All</button>` : ""}
      </div>
    </div>
  `;
}

async function markSelectedAsVehicle() {
  if (!state.selection.length) return;
  const target = itemById(state.selection[0]);
  const name = window.prompt("Vehicle name:", target ? displayName(target) : "Vehicle");
  if (name === null) return;
  await OBR.scene.items.updateItems([state.selection[0]], (items) => {
    for (const item of items) {
      item.metadata[VEHICLE_KEY] = { isVehicle: true, name: name.trim() || item.name };
    }
  });
}

async function unmarkVehicle(btn) {
  const vehicleId = btn.dataset.item;
  const passengers = state.items.filter((i) => i.attachedTo === vehicleId);
  if (passengers.length) {
    await OBR.scene.items.updateItems(
      passengers.map((p) => p.id),
      (items) => {
        for (const item of items) item.attachedTo = undefined;
      }
    );
  }
  await OBR.scene.items.updateItems([vehicleId], (items) => {
    for (const item of items) delete item.metadata[VEHICLE_KEY];
  });
}

async function boardVehicle(btn) {
  const vehicleId = btn.dataset.item;
  const passengerIds = state.selection.filter((id) => id !== vehicleId);
  if (!passengerIds.length) return;
  await OBR.scene.items.updateItems(passengerIds, (items) => {
    for (const item of items) item.attachedTo = vehicleId;
  });
}

async function disembarkPassenger(btn) {
  const itemId = btn.dataset.item;
  await OBR.scene.items.updateItems([itemId], (items) => {
    for (const item of items) item.attachedTo = undefined;
  });
}

async function disembarkAll(btn) {
  const vehicleId = btn.dataset.item;
  const passengers = state.items.filter((i) => i.attachedTo === vehicleId);
  if (!passengers.length) return;
  await OBR.scene.items.updateItems(
    passengers.map((p) => p.id),
    (items) => {
      for (const item of items) item.attachedTo = undefined;
    }
  );
}

// ---------------------------------------------------------------------
// LOG TAB
// ---------------------------------------------------------------------

function renderLog() {
  const el = document.getElementById("tab-log");
  if (!state.ready) {
    el.innerHTML = `<div class="empty-state">Open a scene to see the combat log.</div>`;
    return;
  }

  const log = Array.isArray(state.sceneMetadata[LOG_KEY]) ? state.sceneMetadata[LOG_KEY] : [];

  const entries = log
    .map(
      (entry) => `
      <div class="log-entry">
        ${entry.text}
        <span class="t">${new Date(entry.t).toLocaleTimeString()}</span>
      </div>`
    )
    .join("");

  el.innerHTML = `
    <div class="card">
      <div class="card-title-row">
        <span class="card-title">Damage Log</span>
        ${log.length ? `<button class="btn small" data-action="clear-log">Clear</button>` : ""}
      </div>
      ${entries || `<div class="empty-state">Roll damage from the Armory tab to see hits here.</div>`}
    </div>
  `;
}

async function clearLog() {
  await OBR.scene.setMetadata({ [LOG_KEY]: [] });
}
