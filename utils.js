/* eslint-disable max-len */
// util.js contains utility functions for working with BSON data types and buffers.

// Temporary buffers to convert doubles.
const float64Array = new Float64Array(1);
const uInt8Float64Array = new Uint8Array(float64Array.buffer);

/**
 * Error class for BSON parsing errors.
 * @class
 * @extends Error
 */
class BSONError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BSONError';
  }
}

export const validateBuffer = function(buffer, size, index = 0) {
  if (size < 5) {
    throw new BSONError('Invalid BSON size');
  }
  if (buffer[size + index - 1] !== 0) {
    throw new BSONError('Invalid BSON terminator');
  }
};

export const readObjectId = function(buffer, offset) {
  const value = buffer.slice(offset, offset + 12);
  return `ObjectId("${value.toHex()}")`;
};

export const readTimestamp = function(buffer, offset) {
  const time = readUint32LE(buffer, offset);
  const ordinal = readUint32LE(buffer, offset + 4);
  return `Timestamp(${time}, ${ordinal})`;
};

export const readString = function(buffer, offset) {
  const length = readUint32LE(buffer, offset);
  const value = buffer.slice(
      offset + 4, offset + 4 + length - 1); // - 1 to exclude trailing null byte
  return value.toString();
};

export const readUint32LE = function(buffer, offset = 0) {
  const first = buffer[offset];
  const last = buffer[offset + 3];
  if (first === undefined || last === undefined) {
    throw new Error(`Buffer access out of range: offset=${offset}, buffer length=${buffer.length}`);
  }

  return (
    first +
    buffer[++offset] * 2 ** 8 +
    buffer[++offset] * 2 ** 16 +
    last * 2 ** 24
  );
};

export const readInt32LE = function(buffer, offset = 0) {
  const first = buffer[offset];
  const last = buffer[offset + 3];
  if (first === undefined || last === undefined) {
    throw new Error(`Buffer access out of range: offset=${offset}, buffer length=${buffer.length}`);
  }

  return (
    first +
    buffer[++offset] * 2 ** 8 +
    buffer[++offset] * 2 ** 16 +
    (last << 24)
  );
};

export const readDoubleLE = function(buffer, offset = 0) {
  const first = buffer[offset];
  const last = buffer[offset + 7];
  if (first === undefined || last === undefined) {
    throw new Error(`Buffer access out of range: offset=${offset}, buffer length=${buffer.length}`);
  }

  uInt8Float64Array[0] = first;
  uInt8Float64Array[1] = buffer[++offset];
  uInt8Float64Array[2] = buffer[++offset];
  uInt8Float64Array[3] = buffer[++offset];
  uInt8Float64Array[4] = buffer[++offset];
  uInt8Float64Array[5] = buffer[++offset];
  uInt8Float64Array[6] = buffer[++offset];
  uInt8Float64Array[7] = last;
  return float64Array[0];
};

export const readBigInt64LE = function(buffer, offset = 0) {
  const first = buffer[offset];
  const last = buffer[offset + 7];
  if (first === undefined || last === undefined) {
    throw new Error(`Buffer access out of range: offset=${offset}, buffer length=${buffer.length}`);
  }

  const value =
    buffer[offset + 4] +
    buffer[offset + 5] * 2 ** 8 +
    buffer[offset + 6] * 2 ** 16 +
    (last << 24); // overflow is expected here
  return (
    (BigInt(value) << 32n) +
    BigInt(
        first +
        buffer[++offset] * 2 ** 8 +
        buffer[++offset] * 2 ** 16 +
        buffer[++offset] * 2 ** 24,
    )
  );
};

// uses LEB128
export const decodeVarint = function(buffer) {
  let current = 0;
  let i = 0;
  while (i < buffer.length) {
    let shift = 0;
    let byte = buffer[i];
    // indicates a continuation bit (MSB = 1)
    while (byte >= 128) {
      current += (byte & 127) << shift; // extract 7 bits and shift
      shift += 7;
      byte = buffer[++i];
    }
    i++;
    current += byte << shift;
  }
  return current;
};

export const toString = function() {
  return new TextDecoder('utf-8').decode(this);
};

export const toHex = function(buffer, separator = '') {
  return [...this]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(separator);
};

export const toBase64 = function(buffer) {
  return btoa(buffer.toString());
};
