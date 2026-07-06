import OBR, { buildLabel } from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";

// Reverse-domain namespace for all metadata this extension writes.
// Change this if you fork/rehost the extension under your own domain.
export const ID = "com.cyberpunktoolkit.app";

export const SANDEVISTAN_KEY = `${ID}/sandevistan`;
export const VEHICLE_KEY = `${ID}/vehicle`;
export const LOADOUT_KEY = `${ID}/loadout`;

const DEFAULT_SANDEVISTAN_ROUNDS = 3;

OBR.onReady(() => {
  setupSandevistanToggle();
  setupVehicleToggle();
  setupOpenPanel();
});

/**
 * Quick right-click toggle to jack a token in/out of Sandevistan overdrive.
 * Shows a small floating label on the token while active, with an optional
 * round countdown that the action panel's "Advance Round" button ticks down.
 */
function setupSandevistanToggle() {
  OBR.contextMenu.create({
    id: `${ID}/context-sandevistan`,
    icons: [
      {
        icon: "/icons/sandevistan-on.svg",
        label: "Jack Out (end Sandevistan)",
        filter: {
          every: [{ key: ["metadata", SANDEVISTAN_KEY, "active"], value: true }],
        },
      },
      {
        icon: "/icons/sandevistan-off.svg",
        label: "Jack In (Sandevistan)",
      },
    ],
    async onClick(context) {
      const anyActive = context.items.some(
        (item) => item.metadata[SANDEVISTAN_KEY]?.active
      );

      if (anyActive) {
        const labelIds = context.items
          .map((item) => item.metadata[SANDEVISTAN_KEY]?.labelId)
          .filter(Boolean);

        await OBR.scene.items.updateItems(context.items, (items) => {
          for (const item of items) {
            delete item.metadata[SANDEVISTAN_KEY];
          }
        });

        if (labelIds.length) {
          await OBR.scene.items.deleteItems(labelIds);
        }
      } else {
        const input = window.prompt(
          "Sandevistan duration in rounds (leave blank to run until you jack out manually):",
          String(DEFAULT_SANDEVISTAN_ROUNDS)
        );
        // Cancel -> do nothing
        if (input === null) return;
        const rounds = input.trim() === "" ? null : Math.max(1, parseInt(input, 10) || DEFAULT_SANDEVISTAN_ROUNDS);

        const dpi = await getDpiSafe();
        const labels = context.items.map((item) =>
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

        await OBR.scene.items.updateItems(context.items, (items) => {
          items.forEach((item, index) => {
            item.metadata[SANDEVISTAN_KEY] = {
              active: true,
              rounds,
              labelId: labels[index].id,
            };
          });
        });
      }
    },
  });
}

/**
 * Quick right-click toggle to mark/unmark a token as a Vehicle.
 * Unmarking a vehicle releases (disembarks) any attached passengers.
 */
function setupVehicleToggle() {
  OBR.contextMenu.create({
    id: `${ID}/context-vehicle`,
    icons: [
      {
        icon: "/icons/vehicle-on.svg",
        label: "Unmark Vehicle",
        filter: {
          max: 1,
          every: [{ key: ["metadata", VEHICLE_KEY, "isVehicle"], value: true }],
        },
      },
      {
        icon: "/icons/vehicle-off.svg",
        label: "Mark as Vehicle",
        filter: {
          max: 1,
        },
      },
    ],
    async onClick(context) {
      const vehicle = context.items[0];
      const isVehicle = Boolean(vehicle.metadata[VEHICLE_KEY]?.isVehicle);

      if (isVehicle) {
        const passengers = await OBR.scene.items.getItems(
          (item) => item.attachedTo === vehicle.id
        );
        if (passengers.length) {
          await OBR.scene.items.updateItems(
            passengers.map((p) => p.id),
            (items) => {
              for (const item of items) item.attachedTo = undefined;
            }
          );
        }
        await OBR.scene.items.updateItems([vehicle.id], (items) => {
          for (const item of items) delete item.metadata[VEHICLE_KEY];
        });
      } else {
        const name = window.prompt("Vehicle name:", vehicle.name || "Vehicle");
        if (name === null) return;
        await OBR.scene.items.updateItems([vehicle.id], (items) => {
          for (const item of items) {
            item.metadata[VEHICLE_KEY] = {
              isVehicle: true,
              name: name.trim() || vehicle.name,
            };
          }
        });
      }
    },
  });
}

/** A menu entry that just opens the main Cyberpunk Toolkit panel. */
function setupOpenPanel() {
  OBR.contextMenu.create({
    id: `${ID}/context-open-panel`,
    icons: [
      {
        icon: "/icons/panel.svg",
        label: "Open Cyberpunk Toolkit",
      },
    ],
    async onClick() {
      await OBR.action.open();
    },
  });
}

async function getDpiSafe() {
  try {
    return await OBR.scene.grid.getDpi();
  } catch {
    return 150;
  }
}
