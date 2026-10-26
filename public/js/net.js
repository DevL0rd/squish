export class Net {
  constructor(handlers) {
    this.handlers = handlers;
    this.ws = null;
    this.open = false;
    this.everJoined = false;
    this.pendingJoin = false;
    this.identity = null;
    this.retry = 0;
    this.closedByUs = false;
    this.connect();
  }

  connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${scheme}://${location.host}/ws`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('open', () => {
      this.open = true;
      this.retry = 0;
      this.handlers.onOpen?.();
      if ((this.pendingJoin || this.everJoined) && this.identity) {
        this.send({ t: 'join', name: this.identity.name, hue: this.identity.hue });
      }
    });
    this.ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.handleText(event.data);
      } else {
        this.handleBinary(event.data);
      }
    });
    this.ws.addEventListener('close', () => {
      this.open = false;
      this.handlers.onClose?.();
      if (!this.closedByUs) {
        const delay = Math.min(8000, 800 + this.retry * 1200);
        this.retry += 1;
        setTimeout(() => this.connect(), delay);
      }
    });
    this.ws.addEventListener('error', () => {
      this.handlers.onError?.();
    });
  }

  handleText(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.t === 'welcome') {
      this.everJoined = true;
      this.pendingJoin = false;
      this.identity = { name: message.name, hue: message.hue };
      this.handlers.onWelcome?.(message);
    } else if (message.t === 'roster') {
      this.handlers.onRoster?.(message.players);
    } else if (message.t === 'dead') {
      this.handlers.onDead?.(message.by);
    } else if (message.t === 'respawned') {
      this.handlers.onRespawned?.();
    } else if (message.t === 'full') {
      this.pendingJoin = false;
      this.handlers.onFull?.();
    }
  }

  handleBinary(buffer) {
    const view = new DataView(buffer);
    const type = view.getUint8(0);
    if (type === 1) {
      this.handlers.onSnapshot?.(this.readSnapshot(view));
    } else if (type === 2) {
      this.handlers.onFood?.(this.readFood(view));
    } else if (type === 3) {
      this.handlers.onCreature?.(this.readCreature(view));
    }
  }

  readCreature(view) {
    let offset = 1;
    offset += 2;
    const count = view.getUint16(offset, true);
    offset += 2;
    const creatures = [];
    for (let i = 0; i < count; i += 1) {
      creatures.push({
        id: view.getUint16(offset, true),
        x: view.getUint16(offset + 2, true),
        y: view.getUint16(offset + 4, true),
        radius: view.getUint8(offset + 6),
        kind: view.getUint8(offset + 7),
        angle: (view.getUint8(offset + 8) / 255) * Math.PI * 2 - Math.PI,
        color: [view.getUint8(offset + 9) / 255, view.getUint8(offset + 10) / 255, view.getUint8(offset + 11) / 255],
        phase: view.getUint8(offset + 12) / 24
      });
      offset += 13;
    }
    return { tick: 0, creatures };
  }

  readSnapshot(view) {
    let offset = 1;
    const tick = view.getUint16(offset, true);
    offset += 2;
    const playerCount = view.getUint8(offset);
    offset += 1;
    const players = [];
    for (let i = 0; i < playerCount; i += 1) {
      const id = view.getUint16(offset, true);
      offset += 2;
      const cellCount = view.getUint8(offset);
      offset += 1;
      const cells = [];
      for (let j = 0; j < cellCount; j += 1) {
        const cell = {
          id: view.getUint16(offset, true),
          x: view.getUint16(offset + 2, true),
          y: view.getUint16(offset + 4, true),
          mass: view.getFloat32(offset + 6, true),
          vx: view.getFloat32(offset + 10, true),
          vy: view.getFloat32(offset + 14, true),
          mergeReady: view.getUint8(offset + 18) === 1
        };
        offset += 19;
        cells.push(cell);
      }
      players.push({ id, cells });
    }
    const eventCount = view.getUint16(offset, true);
    offset += 2;
    const events = [];
    for (let i = 0; i < eventCount; i += 1) {
      events.push({
        cellId: view.getUint16(offset, true),
        predatorId: view.getUint16(offset + 2, true),
        x: view.getUint16(offset + 4, true),
        y: view.getUint16(offset + 6, true),
        color: [view.getUint8(offset + 8) / 255, view.getUint8(offset + 9) / 255, view.getUint8(offset + 10) / 255],
        kind: view.getUint8(offset + 11)
      });
      offset += 12;
    }
    return { tick, players, events };
  }

  readFood(view) {
    let offset = 1;
    const tick = view.getUint16(offset, true);
    offset += 2;
    const count = view.getUint16(offset, true);
    offset += 2;
    const food = [];
    for (let i = 0; i < count; i += 1) {
      food.push({
        id: view.getUint16(offset, true),
        x: view.getUint16(offset + 2, true),
        y: view.getUint16(offset + 4, true),
        radius: view.getUint8(offset + 6),
        color: [view.getUint8(offset + 7) / 255, view.getUint8(offset + 8) / 255, view.getUint8(offset + 9) / 255],
        ejecta: view.getUint8(offset + 10) === 1
      });
      offset += 11;
    }
    return { tick, food };
  }

  send(object) {
    if (this.open && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(object));
    }
  }

  join(name, hue) {
    this.identity = { name, hue };
    this.pendingJoin = true;
    this.send({ t: 'join', name, hue });
  }

  input(x, y) {
    this.send({ t: 'input', x: Math.round(x), y: Math.round(y) });
  }

  view(x, y) {
    this.send({ t: 'view', x: Math.round(x), y: Math.round(y) });
  }

  split() {
    this.send({ t: 'split' });
  }

  eject() {
    this.send({ t: 'eject' });
  }

  respawn() {
    this.send({ t: 'respawn' });
  }

  close() {
    this.closedByUs = true;
    this.ws?.close();
  }
}
