# Squish

A real-time, physics-flavoured culture of soft cells in dark water. Bots fill every empty slot.

## Run

```sh
npm start
```

The game opens on port 5173. Open `http://localhost:5173` locally, or use the hub address from another device on the same network.

## Controls

- Desktop: move the pointer to steer, Space to split, W to spit, M to mute.
- Phone: touch and drag on the left side for the joystick; use Split and Spit on the right.

## Notes

- The server is authoritative for cells, mass, eating, splitting, spitting and merging.
- Each cell has its own small liquid simulation; the cell body takes its colour from that fluid.
- Food preserves its size when it enters a cell.
- Cells that press together with compatible sizes fuse; their fluids and food merge.
