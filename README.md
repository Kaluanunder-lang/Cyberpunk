# Cyberpunk Toolkit — an Owlbear Rodeo extension

A Cyberpunk RED / 2077-flavored toolkit for Owlbear Rodeo:

- ⚡ **Sandevistan condition** — right-click any token to jack in/out, with an
  optional round countdown and a floating status label on the token.
- 🔫 **Ammo counter** — track a magazine per weapon per token, with Fire/Reload
  buttons and a visual clip readout.
- 💥 **Damage counter** — give each weapon a damage rating (e.g. `3d6+1`) and
  roll it with one click; hits land in a shared combat log.
- 🚗 **Vehicles** — mark a token as a vehicle and board/disembark passengers.
  Boarded passengers are attached to the vehicle, so moving the vehicle moves
  everyone riding in it.

Everything is plain HTML/CSS/JS — no build step, no npm install required.

## 1. Host the files

Owlbear Rodeo loads extensions from a public HTTPS URL, so you need to host
this folder somewhere. The easiest free option is **GitHub Pages**:

1. Create a new GitHub repository and upload every file in this folder
   (`manifest.json`, `icon.svg`, `background.html`, `background.js`,
   `action.html`, `action.js`, `style.css`, and the `icons/` folder) to the
   repository root.
2. In the repo, go to **Settings → Pages**, set the source to your main
   branch (root folder), and save.
3. GitHub will give you a URL like
   `https://yourname.github.io/your-repo/`.
   Your manifest will then live at
   `https://yourname.github.io/your-repo/manifest.json`.

Any static host works the same way (Netlify, Vercel, Cloudflare Pages, your
own server) — just make sure `manifest.json` ends up at the root of the URL
you'll give to Owlbear Rodeo.

## 2. Install it in Owlbear Rodeo

1. Open your Owlbear Rodeo profile and click **Add Extension**.
2. Paste in the URL to your hosted `manifest.json`.
3. Open (or create) a room, and enable **Cyberpunk Toolkit** in the room's
   extension list.

## 3. Using it

- Click the extension's icon in the top-left action bar to open the panel
  (**Rounds / Armory / Sandy / Vehicles / Log** tabs).
- Right-click any token on the map for quick actions:
  - ⚡ **Jack In / Jack Out** — toggle Sandevistan directly from the map.
  - 🚗 **Mark / Unmark Vehicle**.
  - 🖥 **Open Cyberpunk Toolkit** — jumps straight to the panel.
- To track weapons for a token: select it on the map, open the **Armory**
  tab, click **Enable Loadout for Selected**, then add weapons with a name,
  a damage rating (dice notation like `2d6+1`), and a magazine size.
- To group a vehicle and its passengers: select the vehicle token, go to
  **Vehicles**, click **Mark Selected as Vehicle**. Then select one or more
  passenger tokens and click **Board Selected** on that vehicle's card.
  Dragging the vehicle around the map now drags its passengers with it.
  Click the ✕ on a passenger chip (or **Disembark All**) to let them out.
- **Rounds** ticks down every active Sandevistan timer by one each time you
  click **+1 Round**, auto-ending anyone who hits zero.

## Notes for developers

- All data is stored directly on Owlbear's scene/item metadata under the
  `com.cyberpunktoolkit.app/...` namespace — nothing leaves the room, and
  there's no external backend.
- If you fork this, consider changing the `ID` constant at the top of
  `background.js` and `action.js` to your own reverse-domain string, per
  Owlbear's [metadata convention](https://docs.owlbear.rodeo/extensions/reference/metadata/),
  to avoid clashing with anyone else's fork.
- The SDK is loaded straight from `esm.sh` in the browser
  (`https://esm.sh/@owlbear-rodeo/sdk@3.1.0`) so there's nothing to `npm
  install`. If you'd rather bundle it with Vite/React, the logic in
  `action.js` and `background.js` ports over directly — see Owlbear's
  [extension docs](https://docs.owlbear.rodeo/extensions/getting-started/).
- Damage rolls use simple `NdM+K` dice notation (e.g. `4d6`, `2d10-1`).
