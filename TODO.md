# Squish · Queue

A living suspension of soft cells, liquid, dye and debris. Bots fill every unoccupied slot.

---

## Queue

### 1. Play test

**Details**

- The game is live on port 5173 and the app browser pane has been reloaded.
- Desktop and phone smoke tests pass with no console errors.
- Left-thumb joystick, right Split/Spit, food ingestion and split fluid have been exercised.
- Natural fusion happens when comparable cells press together; own cells repel until their merge timer expires.
- Food enters at the membrane at its real size and floats in the interior flow.
- Cell shader is a transparent membrane over the fluid; no nucleus or organelle overlays.
- Refraction is weighted to the membrane edge; dye wake is an offset halo behind moving cells.
- Food and debris use the regional colour field; water has ambient dye and suspended matter.

**Status**

- Ready for the person.

### 2. Future ideas

**Details**

- A softer intermediate fusion bridge if the union wants more shape.
- Optional bubble coalescence.

**Status**

- Not requested.

### 3. Hyper-real microscope pass

**Details**

- Starts after the cleanup (item 3) is finished.
- The game is meant to be an agar.io-like game but hyper realistic.
- Cells are true bounded membranes that merge and split; eaten things dissolve in the cell's internal fluid sim.
- Go over the code, find over-complications and make it truly physics based, or at least make it look that way; the current version over-fakes some things.
- Splits must be clean. Absorbing another cell must be clean. Cells sticking and squishing must be clean.
- Keep the graphics style the person loves: dark themed and premium looking.
- Increase realism of the little creatures, the cells and their light shading.
- Target look: a photorealistic view through a 4k microscope onto little cells.
- Cell organelles should be nicely detailed; the membrane should look like a real organism under a microscope.
- Cells should move like amoebas, squishing around and absorbing each other, not just little circular cells.
- Internal pressure and fluid sims must stay.
- Eating must look real: no deleting the food and adding it to the body; it is absorbed nicely and dissolves into the cell, spewing dye into the internal water sim.
- The coordinator may do what it thinks best and add any new features, as long as they look super real and stay dark and premium.
- Found during the cleanup: the GPU velocity advection pass never had any effect (its output was overwritten), so it was removed; real velocity advection belongs in this pass.
- Found during the cleanup: each cell interior's swirl phase never advances over time.

**Status**

- Next up.

### 4. Background music from a video

**Details**

- After the cleanup is done, take the video the person gave and turn it into an audio file.
- Format must sound nice but be small (plan: Opus audio).
- Play it as looping background music in the game.
- The person has not yet shared the video link or file.

**Status**

- Waiting for the video link.

### 5. Options page and music toggle

**Details**

- Add an options page that covers all settings a user may want.
- Add a quick audio toggle for the background music in the game UI.

**Status**

- Queued after item 3.
