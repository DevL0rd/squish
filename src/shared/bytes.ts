export class ByteWriter {
  private readonly view: DataView;
  private offset = 0;

  constructor(size: number) {
    this.view = new DataView(new ArrayBuffer(size));
  }

  u8(value: number): void {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  u16(value: number): void {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  u32(value: number): void {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
  }

  f32(value: number): void {
    this.view.setFloat32(this.offset, value, true);
    this.offset += 4;
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.view.buffer, 0, this.offset);
  }
}

export class ByteReader {
  private offset = 0;
  private readonly view: DataView;

  constructor(view: DataView) {
    this.view = view;
  }

  u8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32(): number {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  unitRgb(): [number, number, number] {
    return [this.u8() / 255, this.u8() / 255, this.u8() / 255];
  }
}
