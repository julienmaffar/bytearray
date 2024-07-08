// @ts-ignore
import { AMF0 } from "amf0-ts";
// @ts-ignore
import { AMF3 } from "amf3-ts";
import { encodingExists, decode, encode } from "iconv-lite";
import { deflateSync, deflateRawSync, inflateSync, inflateRawSync } from "zlib";
import { LZMA } from "lzma-native";

enum Endian {
  LITTLE_ENDIAN = "LE",
  BIG_ENDIAN = "BE",
}

enum ObjectEncoding {
  AMF0 = 0,
  AMF3 = 3,
}

enum CompressionAlgorithm {
  DEFLATE = "deflate",
  LZMA = "lzma",
  ZLIB = "zlib",
}

/**
 * @description Helper function that converts data types to a buffer
 */
const convert = (v: Buffer | Array<number> | number): Buffer =>
  Buffer.isBuffer(v)
    ? v
    : Array.isArray(v)
    ? Buffer.from(v)
    : Number.isInteger(v)
    ? Buffer.alloc(v)
    : Buffer.alloc(0);

export class ByteArray {
  /**
   * The current position
   */
  private position: number;
  /**
   * The byte order
   */
  private endian: string;
  /**
   * The object encoding
   */
  private objectEncoding: number;
  /**
   * The buffer
   */
  private buffer: Buffer;

  constructor(buffer: Buffer | Array<number> | number) {
    this.buffer = convert(buffer);
    this.position = 0;
    this.endian = Endian.BIG_ENDIAN;
    this.objectEncoding = ObjectEncoding.AMF3;
  }

  /**
   * @description  Registers a class alias
   */
  static registerClassAlias(
    encoding: number,
    aliasName: string,
    classObject: ObjectEncoding
  ) {
    if (encoding === ObjectEncoding.AMF0)
      AMF0.registerClassAlias(aliasName, classObject);
    else if (encoding === ObjectEncoding.AMF3)
      AMF3.registerClassAlias(aliasName, classObject);
    else throw new Error(`Unknown object encoding: '${encoding}'.`);
  }

  /**
   * @description Override for Object.prototype.toString.call
   */
  get [Symbol.toStringTag]() {
    return "ByteArray";
  }

  /**
   * @description Returns the current position
   */
  getPosition(): number {
    return this.position;
  }

  /**
   * @description Sets the position
   */
  setPosition(value: number) {
    if (value >= 0) this.position = value;
    else throw new TypeError(`Invalid value for position: '${value}'.`);
  }

  /**
   * @description Returns the byte order
   */
  getEndian(): string {
    return this.endian;
  }

  /**
   * @description Set the byte order
   */
  setEndian(value: string) {
    if (value === "LE" || value === "BE") this.endian = value;
    else throw new TypeError(`Invalid value for endian: '${value}'.`);
  }

  /**
   * @description Returns the object encoding
   */
  getObjectEncoding(): number {
    return this.objectEncoding;
  }

  /**
   * @description Sets the object encoding
   */
  setObjectEncoding(encoding: ObjectEncoding) {
    if (encoding === ObjectEncoding.AMF0 || encoding === ObjectEncoding.AMF3)
      this.objectEncoding = encoding;
    else throw new Error(`Unknown object encoding: '${encoding}'.`);
  }

  /**
   * @description Returns the length of the buffer
   */
  getLength(): number {
    return this.buffer.length;
  }

  /**
   * @description Sets the length of the buffer
   */
  setLength(value: number) {
    if (!Number.isInteger(value) || value < 0)
      throw new TypeError(`Invalid value for length: '${value}'.`);

    if (value === 0) this.clear();
    else if (value !== this.getLength()) {
      if (value < this.getLength()) {
        this.buffer = this.buffer.slice(0, value);
        this.position = this.getLength();
      } else this.expand(value);
    }
  }

  /**
   * @description Returns the amount of bytes available
   */
  getBytesAvailable(): number {
    return this.getLength() - this.position;
  }

  /**
   * @description Expands the buffer when needed
   */
  private expand(value: number) {
    if (this.getBytesAvailable() < value) {
      const old = this.buffer;
      const size = old.length + (value - this.getBytesAvailable());

      this.buffer = Buffer.alloc(size);
      old.copy(this.buffer);
    }
  }

  /**
   * @description Simulates signed overflow
   */
  signedOverflow(value: number, bits: number): number {
    const sign = 1 << (bits - 1);
    return (value & (sign - 1)) - (value & sign);
  }

  /**
   * @description Clears the buffer and sets the position to 0
   */
  clear() {
    this.buffer = Buffer.alloc(0);
    this.position = 0;
  }

  /**
   * @description Compresses the buffer
   */
  async compress(algorithm: string = CompressionAlgorithm.ZLIB) {
    if (this.getLength() === 0) return;

    algorithm = algorithm.toLowerCase();

    if (algorithm === CompressionAlgorithm.ZLIB)
      this.buffer = deflateSync(this.buffer, { level: 9 });
    else if (algorithm === CompressionAlgorithm.DEFLATE)
      this.buffer = deflateRawSync(this.buffer);
    else if (algorithm === CompressionAlgorithm.LZMA) {
      LZMA().compress(this.buffer, 1, (buffer) => {
        this.buffer = buffer;
      });
    } else throw new Error(`Invalid compression algorithm: '${algorithm}'.`);

    this.position = this.getLength();
  }

  /**
   * @description Reads a boolean
   */
  readBoolean(): boolean {
    return this.readByte() !== 0;
  }

  /**
   * @description Reads a signed byte
   */
  readByte(): number {
    return this.buffer.readInt8(this.position++);
  }

  /**
   * @description Reads multiple signed bytes from a ByteArray
   */
  readBytes(bytes: ByteArray, offset: number = 0, length: number = 0) {
    if (length === 0) length = this.getBytesAvailable();

    if (length > this.getBytesAvailable())
      throw new RangeError("End of buffer was encountered.");

    if (bytes.getLength() < offset + length) bytes.expand(offset + length);

    for (let i = 0; i < length; i++)
      bytes.buffer[i + offset] = this.buffer[i + this.position];

    this.position += length;
  }

  /**
   * @description Reads a double
   */
  readDouble(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = this.buffer.readDoubleBE(this.position);
    else value = this.buffer.readDoubleLE(this.position);

    this.position += 8;
    return value;
  }

  /**
   * @description Reads a float
   */
  readFloat(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = this.buffer.readFloatBE(this.position);
    else value = this.buffer.readFloatLE(this.position);

    this.position += 4;
    return value;
  }

  /**
   * @description Reads a signed int
   */
  readInt(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = this.buffer.readInt32BE(this.position);
    else value = this.buffer.readInt32LE(this.position);

    this.position += 4;
    return value;
  }

  /**
   * @description Reads a signed long
   */
  readLong(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = Number(this.buffer.readBigInt64BE(this.position));
    else value = Number(this.buffer.readBigInt64LE(this.position));

    this.position += 4;
    return value;
  }

  /**
   * @description Reads a multibyte string
   */
  readMultiByte(length: number, charset: string = "utf8"): string {
    const position = this.position;
    this.position += length;

    if (encodingExists(charset)) {
      const b = this.buffer.slice(position, this.position);
      const stripBOM =
        (charset === "utf8" || charset === "utf-8") &&
        b.length >= 3 &&
        b[0] === 0xef &&
        b[1] === 0xbb &&
        b[2] === 0xbf;
      const value = decode(b, charset, { stripBOM });

      stripBOM ? (length -= 3) : 0;

      if (Buffer.byteLength(value) !== length)
        throw new RangeError("End of buffer was encountered.");

      return value;
    } else throw new Error(`Invalid character set: '${charset}'.`);
  }

  /**
   * @description Reads an object
   */
  readObject(): object {
    const [position, value] =
      this.objectEncoding === ObjectEncoding.AMF0
        ? AMF0.parse(this.buffer, this.position)
        : AMF3.parse(this.buffer, this.position);
    this.position += position;

    return value;
  }

  /**
   * @description Reads a signed short
   */
  readShort(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = this.buffer.readInt16BE(this.position);
    else value = this.buffer.readInt16LE(this.position);

    this.position += 2;
    return value;
  }

  /**
   * @description Reads an unsigned byte
   */
  readUnsignedByte(): number {
    return this.buffer.readUInt8(this.position++);
  }

  /**
   * @description Reads an unsigned int
   */
  readUnsignedInt(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = this.buffer.readUInt32BE(this.position);
    else value = this.buffer.readUInt32LE(this.position);

    this.position += 4;
    return value;
  }

  /**
   * @description Reads an unsigned short
   */
  readUnsignedShort(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = this.buffer.readUInt16BE(this.position);
    else value = this.buffer.readUInt16LE(this.position);

    this.position += 2;
    return value;
  }

  /**
   * @description Reads an unsigned long
   */
  readUnsignedLong(): number {
    let value = 0;
    if (this.getEndian() === Endian.BIG_ENDIAN)
      value = Number(this.buffer.readBigUInt64BE(this.position));
    else value = Number(this.buffer.readBigUInt64LE(this.position));

    this.position += 8;
    return value;
  }

  /**
   * @description Reads a UTF-8 string
   */
  readUTF(): string {
    return this.readMultiByte(this.readUnsignedShort());
  }

  /**
   * @description Reads UTF-8 bytes
   */
  readUTFBytes(length: number): string {
    return this.readMultiByte(length);
  }

  /**
   * @description Converts the buffer to JSON
   */
  toJSON(): object {
    return Object.assign({}, this.buffer.toJSON().data);
  }

  /**
   * @description Converts the buffer to a string
   */
  toString(charset: string = "utf8"): string {
    if (encodingExists(charset)) return decode(this.buffer, charset);
    else throw new Error(`Invalid character set: '${charset}'.`);
  }

  /**
   * @description Decompresses the buffer
   */
  async uncompress(algorithm: string = CompressionAlgorithm.ZLIB) {
    if (this.getLength() === 0) return;

    algorithm = algorithm.toLowerCase();

    if (algorithm === CompressionAlgorithm.ZLIB)
      this.buffer = inflateSync(this.buffer, { level: 9 });
    else if (algorithm === CompressionAlgorithm.DEFLATE)
      this.buffer = inflateRawSync(this.buffer);
    else if (algorithm === CompressionAlgorithm.LZMA)
      LZMA().decompress(this.buffer, (buffer) => {
        this.buffer = buffer;
      });
    else throw new Error(`Invalid decompression algorithm: '${algorithm}'.`);

    this.position = 0;
  }

  /**
   * @description Writes a boolean
   */
  writeBoolean(value: boolean) {
    this.writeByte(value ? 1 : 0);
  }

  /**
   * @description Writes a signed byte
   * @param {Number} value
   */
  writeByte(value: number) {
    this.expand(1);
    this.buffer.writeInt8(this.signedOverflow(value, 8), this.position++);
  }

  /**
   * @description Writes multiple signed bytes to a ByteArray
   */
  writeBytes(bytes: ByteArray, offset: number = 0, length: number = 0) {
    if (length === 0) length = bytes.getLength() - offset;

    this.expand(length);

    for (let i = 0; i < length; i++) {
      this.buffer[i + this.position] = bytes.buffer[i + offset];
    }

    this.position += length;
  }

  /**
   * @description Writes a double
   */
  writeDouble(value: number) {
    this.expand(8);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeDoubleBE(value, this.position);
    else this.buffer.writeDoubleLE(value, this.position);
    this.position += 8;
  }

  /**
   * @description Writes a float
   */
  writeFloat(value: number) {
    this.expand(4);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeFloatBE(value, this.position);
    else this.buffer.writeFloatLE(value, this.position);
    this.position += 4;
  }

  /**
   * @description Writes a signed int
   */
  writeInt(value: number) {
    this.expand(4);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeFloatBE(this.signedOverflow(value, 32), this.position);
    else
      this.buffer.writeFloatLE(this.signedOverflow(value, 32), this.position);
    this.position += 4;
  }

  /**
   * @description Writes a signed long
   */
  writeLong(value: number) {
    this.expand(8);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeBigInt64BE(BigInt(value), this.position);
    else this.buffer.writeBigInt64LE(BigInt(value), this.position);
    this.position += 8;
  }

  /**
   * @description Writes a multibyte string
   */
  writeMultiByte(value: string, charset: string = "utf8") {
    this.position += Buffer.byteLength(value);

    if (encodingExists(charset))
      this.buffer = Buffer.concat([this.buffer, encode(value, charset)]);
    else throw new Error(`Invalid character set: '${charset}'.`);
  }

  /**
   * @description Writes an object
   */
  writeObject(value: object) {
    const bytes =
      this.objectEncoding === ObjectEncoding.AMF0
        ? AMF0.stringify(value)
        : AMF3.stringify(value);

    this.position += bytes.length;
    this.buffer = Buffer.concat([this.buffer, Buffer.from(bytes)]);
  }

  /**
   * @description Writes a signed short
   */
  writeShort(value: number) {
    this.expand(2);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeInt16BE(this.signedOverflow(value, 16), this.position);
    else
      this.buffer.writeInt16LE(this.signedOverflow(value, 16), this.position);
    this.position += 2;
  }

  /**
   * @description Writes an unsigned byte
   */
  writeUnsignedByte(value: number) {
    this.expand(1);
    this.buffer.writeUInt8(value, this.position++);
  }

  /**
   * @description Writes an unsigned int
   */
  writeUnsignedInt(value: number) {
    this.expand(4);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeUInt32BE(value, this.position);
    else this.buffer.writeUInt32LE(value, this.position);
    this.position += 4;
  }

  /**
   * @description Writes an unsigned short
   */
  writeUnsignedShort(value: number) {
    this.expand(2);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeUInt16BE(value, this.position);
    else this.buffer.writeUInt16LE(value, this.position);
    this.position += 2;
  }

  /**
   * @description Writes an unsigned long
   */
  writeUnsignedLong(value: number) {
    this.expand(8);

    if (this.getEndian() === Endian.BIG_ENDIAN)
      this.buffer.writeBigUInt64BE(BigInt(value), this.position);
    else this.buffer.writeBigUInt64LE(BigInt(value), this.position);
    this.position += 8;
  }

  /**
   * @description Writes a UTF-8 string
   */
  writeUTF(value: string) {
    this.writeUnsignedShort(Buffer.byteLength(value));
    this.writeMultiByte(value);
  }

  /**
   * @description Writes UTF-8 bytes
   */
  writeUTFBytes(value: string) {
    this.writeMultiByte(value);
  }
}
