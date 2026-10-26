import type { ByteReader } from './bytes.ts';
import { ByteWriter } from './bytes.ts';
import { clamp, TAU } from './math.ts';
import { Packet, type HazardPacket, type WireBoss, type WireJoint, type WireSpot } from './protocol.ts';

function coordinate(value: number): number {
  return clamp(Math.round(value), 0, 65535);
}

function unit(value: number): number {
  return clamp(Math.round(value * 255), 0, 255);
}

function size(packet: HazardPacket): number {
  const joints = packet.boss?.chains.reduce((sum, chain) => sum + chain.length, 0) ?? 0;
  const chains = packet.boss?.chains.length ?? 0;
  return 3 + (packet.spot ? 14 : 0) + (packet.boss ? 5 + chains + joints * 6 : 0);
}

function writeSpot(writer: ByteWriter, spot: WireSpot): void {
  writer.u16(coordinate(spot.x));
  writer.u16(coordinate(spot.y));
  writer.u16(coordinate(spot.radius));
  writer.u8(spot.phase);
  writer.u8(unit(spot.progress));
  writer.u32(spot.target);
  writer.u8(spot.tool);
  writer.u8(Math.round(((((spot.angle % TAU) + TAU) % TAU) / TAU) * 255));
}

function writeBoss(writer: ByteWriter, boss: WireBoss): void {
  writer.u8(boss.kind);
  writer.u8(boss.state);
  writer.u8(unit(boss.progress));
  writer.u8(unit(boss.health));
  writer.u8(boss.chains.length);
  for (const chain of boss.chains) {
    writer.u8(chain.length);
    for (const joint of chain) {
      writer.u16(coordinate(joint.x));
      writer.u16(coordinate(joint.y));
      writer.u16(clamp(Math.round(joint.r), 0, 65535));
    }
  }
}

export function encodeHazards(packet: HazardPacket): Uint8Array {
  const writer = new ByteWriter(size(packet));
  writer.u8(Packet.Hazard);
  writer.u8(packet.spot ? 1 : 0);
  if (packet.spot) writeSpot(writer, packet.spot);
  writer.u8(packet.boss ? 1 : 0);
  if (packet.boss) writeBoss(writer, packet.boss);
  return writer.bytes();
}

function readSpot(reader: ByteReader): WireSpot {
  return {
    x: reader.u16(),
    y: reader.u16(),
    radius: reader.u16(),
    phase: reader.u8(),
    progress: reader.u8() / 255,
    target: reader.u32(),
    tool: reader.u8(),
    angle: (reader.u8() / 255) * TAU,
  };
}

function readChain(reader: ByteReader): WireJoint[] {
  const count = reader.u8();
  return Array.from({ length: count }, () => ({ x: reader.u16(), y: reader.u16(), r: reader.u16() }));
}

function readBoss(reader: ByteReader): WireBoss {
  const kind = reader.u8();
  const state = reader.u8();
  const progress = reader.u8() / 255;
  const health = reader.u8() / 255;
  const count = reader.u8();
  return { kind, state, progress, health, chains: Array.from({ length: count }, () => readChain(reader)) };
}

export function decodeHazards(reader: ByteReader): HazardPacket {
  const spot = reader.u8() ? readSpot(reader) : null;
  const boss = reader.u8() ? readBoss(reader) : null;
  return { spot, boss };
}
