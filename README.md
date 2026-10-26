# Squish

A real-time, physics-flavoured culture of soft cells in dark water. Bots fill every empty slot.

## Quick start

1. Install [Node.js](https://nodejs.org) version 22.18 or newer (the LTS download is fine).
2. Download or clone this project.
3. Start the game:
   - Linux or macOS: run `./start.sh` in the project folder.
   - Windows: double-click `start.cmd`.
4. Open `http://localhost:5173` in your browser. Other devices on the same network can open `http://<this computer's address>:5173`.

The first start installs everything automatically. To only install, run `./setup.sh` or `setup.cmd`.

## Development

```sh
npm install
npm run dev
```

`npm run dev` starts the game server on port 5174 and the Vite dev server on port 5173 with hot reload; open `http://localhost:5173` or the network address Vite prints.

`npm start` builds the client and serves the build and the game from one server on port 5173. Pass `-- --port <number>` to use another port.

## Checks

`npm test` runs every check:

- `typecheck`: strict TypeScript for the server and the client.
- `lint`: ESLint with the strict type-checked rules, complexity 10, 400 lines per file, 60 lines per function, depth 4, 5 parameters.
- `lint:css`: Stylelint standard rules.
- `format:check`: Prettier.
- `spell`: cspell; project words live in `cspell.json`.
- `hygiene`: 400-line cap on every source file, no comments, kebab-case file names, no empty files.
- `shaders`: compiles every GLSL shader with glslangValidator so a shader error can never ship.
- `deadcode`: knip finds unused files, exports and dependencies.
- `duplicates`: jscpd fails on any repeated block of 5 or more lines in `src`, `tests` or `scripts`.
- `test:unit`: protocol round trips and a live server boot and join.

## Layout

- `src/shared`: math, the binary protocol and its codec, used by both sides.
- `src/server`: the authoritative simulation (players, bots, food, creatures, flow field) and the WebSocket and static server.
- `src/client`: the WebGL renderer, the per-cell soft body and interior fluid simulations, input, audio and HUD.

## Controls

- Desktop: move the pointer to steer, Space to split, W to attack (spit at level 1), Shift to boost, M to mute, N to toggle music, scroll to zoom.
- Touch: drag on the left side for the joystick; use Split, the attack button and Boost on the right.

## Notes

- The server is authoritative for cells, mass, eating, splitting, spitting and merging.
- Each cell has its own small liquid simulation; the cell body takes its colour from that fluid.
- Food preserves its size when it enters a cell.
- Cells that press together with compatible sizes fuse; their fluids and food merge.
- Growing levels you up (mass 200, 600, 1400, 3000): a needle injects new DNA and upgrades your attack from spit to trichocyst volley, toxicyst dart, osmotic pulse and lysosome bomb. Attacks cost mass, split rivals and wound bosses.
- Eating small creatures charges up to two boosts; eating diatoms, rotifers, Stentor and tardigrades gives a fading shield.
- Random events: four giant boss organisms with HP and a micropipette spotlight that drains or injects mass.
- Bots have personalities (hunter, grazer, coward, trickster, brawler, opportunist) and use the same mechanics as players.
- Admin panel: with `npm run dev` the server runs with `--admin`, and a player named DevL0rd gets an Admin button (or the backquote key) to force events, spawn things and test.
- Background music: a 6 minute seamless Opus loop in `public/music`.
