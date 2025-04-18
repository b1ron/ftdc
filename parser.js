// BSON parser for FTDC files
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as assert from 'assert';
import * as BSON from './constants.js';

// Temporary buffers to convert doubles
const float64Array = new Float64Array(1);
const uInt8Float64Array = new Uint8Array(float64Array.buffer);

/**
 * Error class for BSON parsing errors.
 *
 * @class
 * @extends Error
 */
class BSONError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BSONError';
  }
}

/**
 * Reads a buffer and returns the index at the end of a C string.
 * It purposely returns the index after the null terminator and not the actual string.
 *
 * @param {Buffer} buffer - The buffer to read.
 * @param {number} offset - The starting position for the search.
 * @returns {number} - The index after the null terminator in the C string.
 */
function indexAfterCString(buffer, offset) {
  let i = offset;
  while (buffer[i] !== 0x00 && i < buffer.length) {
    i++;
  }

  return i + 1;
}

function readObjectId(buffer, offset) {
  const value = buffer.slice(offset, offset + 12);
  return `ObjectId(${value.toHex()})`;
}

function readString(buffer, offset) {
  const length = buffer.readUInt32LE(offset);
  const value = buffer.slice(
      offset + 4, offset + 4 + length - 1); // -1 to exclude trailing null byte
  return value.toString();
}

function readUInt32LE(offset = 0) {
  const first = this[offset];
  const last = this[offset + 3];
  if (first === undefined || last === undefined) {
    throw new Error('Out of range:', this.length - 4);
  }

  return (
    first +
    this[++offset] * 2 ** 8 +
    this[++offset] * 2 ** 16 +
    last * 2 ** 24
  );
}

function readInt32LE(offset = 0) {
  const first = this[offset];
  const last = this[offset + 3];
  if (first === undefined || last === undefined) {
    throw new Error('Out of range:', this.length - 4);
  }

  return (
    first +
    this[++offset] * 2 ** 8 +
    this[++offset] * 2 ** 16 +
    (last << 24)
  );
}

function readDoubleLE(offset = 0) {
  const first = this[offset];
  const last = this[offset + 7];
  if (first === undefined || last === undefined) {
    throw new Error('Out of range:', this.length - 8);
  }

  uInt8Float64Array[0] = first;
  uInt8Float64Array[1] = this[++offset];
  uInt8Float64Array[2] = this[++offset];
  uInt8Float64Array[3] = this[++offset];
  uInt8Float64Array[4] = this[++offset];
  uInt8Float64Array[5] = this[++offset];
  uInt8Float64Array[6] = this[++offset];
  uInt8Float64Array[7] = last;
  return float64Array[0];
}

function readBigInt64LE(offset = 0) {
  const first = this[offset];
  const last = this[offset + 7];
  if (first === undefined || last === undefined) {
    throw new Error('Out of range:', this.length - 8);
  }

  const val =
    this[offset + 4] +
    this[offset + 5] * 2 ** 8 +
    this[offset + 6] * 2 ** 16 +
    (last << 24); // overflow is expected here
  return (
    (BigInt(val) << 32n) +
    BigInt(
        first +
        this[++offset] * 2 ** 8 +
        this[++offset] * 2 ** 16 +
        this[++offset] * 2 ** 24,
    )
  );
}

function toString() {
  return new TextDecoder('utf-8').decode(this);
}

function toHex(separator = '') {
  return [...this]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(separator);
}

function toBase64() {
  return btoa(this.toString());
}

/**
 * Adds methods to the Uint8Array prototype.
 * Uint8Array is the most suitable TypedArray for working with arbitrary binary data.
 * @returns {void}
 * @api private
 */
function addUint8ArrayMethods(prototype) {
  prototype.readInt32LE = readInt32LE;
  prototype.readUInt32LE = readUInt32LE;
  prototype.readDoubleLE = readDoubleLE;
  prototype.readBigInt64LE = readBigInt64LE;
  prototype.toString = toString;
  prototype.toHex = toHex;
  prototype.toBase64 = toBase64;
}

/**
 * Parses a BSON file and returns the parsed JSON object.
 *
 * @param {string} uri - The URI of the file to fetch.
 * @param {(uri: string) => Promise<ArrayBuffer>} fetchFile
 * - The async function to fetch the file.
 * @returns The parsed JSON object.
 */
async function parseBSONFile(uri, fetchFile) {
  let buffer;
  try {
    const response = await fetchFile(uri);
    if (!(response instanceof ArrayBuffer)) {
      throw new Error('callback must return an ArrayBuffer');
    }
    buffer = new Uint8Array(response);
  } catch (error) {
    throw error;
  }

  addUint8ArrayMethods(Uint8Array.prototype);

  const size = buffer.readUInt32LE();
  let index = 4;

  assert.equal(buffer instanceof Uint8Array, true, 'Invalid buffer type');

  if (size < 5) {
    throw new BSONError('Invalid BSON size');
  }
  if (buffer[size - 1] !== 0) {
    throw new BSONError('Invalid BSON terminator');
  }

  // stack to deserialize nested BSON documents
  const stack = [];
  stack.push({size: size});

  const result = {}; // the serialized JSON object to return
  let val;

  while (index < buffer.length) {
    const elementType = buffer[index++];

    if (elementType === 0) {
      continue;
    }

    console.log(result, stack, index, stack[0].size - index);

    const key = buffer
        .subarray(index, indexAfterCString(buffer, index) - 1)
        .toString();

    index = indexAfterCString(buffer, index);

    switch (elementType) {
      case BSON.NUMBER:
        val = buffer.readDoubleLE(index);
        result[key] = val;
        index += 8;
        break;
      case BSON.STRING:
        val = readString(buffer, index);
        result[key] = val;
        index += 4 + val.length;
        break;
      case BSON.DOCUMENT:
        const size = buffer.readUInt32LE(index);
        stack.push({size: size});
        index += 4;
        break;
      case BSON.ARRAY:
      case BSON.BINARY:
      case BSON.UNDEFINED:
      case BSON.OBJECTID:
        val = readObjectId(buffer, index);
        result[key] = val;
        index += 12;
        break;
      case BSON.BOOLEAN:
        val = buffer[index] === 0 ? false : true;
        result[key] = val;
        index += 1;
        break;
      case BSON.DATE:
        const data = buffer.subarray(index, index + 8);
        val = new Date(Number(data.readBigInt64LE()));
        result[key] = val;
        index += 8;
        break;
      case BSON.NULL:
      case BSON.REGEXP:
      case BSON.DBPOINTER:
      case BSON.CODE:
      case BSON.SYMBOL:
      case BSON.CODE_W_SCOPE:
      case BSON.INT32:
        val = buffer.readInt32LE(index);
        result[key] = val;
        index += 4;
        break;
      case BSON.TIMESTAMP:
        break;
      case BSON.LONG:
      case BSON.DECIMAL128:
      case BSON.MIN_KEY:
      case BSON.MAX_KEY:
      default:
        break;
    }
  }
  return result;
}

async function fetchFile(uri) {
  const response = await fetch(uri, {
    signal: AbortSignal.timeout(60 * 1000),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch: ${response.statusText}');
  }
  return response.arrayBuffer();
}

const result = await parseBSONFile(
    'https://github.com/b1ron/ftdc/raw/refs/heads/master/files/foo.bson',
    fetchFile,
);
console.log(result);
