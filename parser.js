// BSON parser for FTDC files
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as assert from 'assert';
import * as BSON from './constants.js';

const printableChars = /^[\x20-\x7E]+$/; // ASCII printable characters

// temporary buffers to convert numbers
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

/**
 * Extracts strings from a buffer.
 * This is a slightly altered reimplementation of the Unix strings command.
 *
 * FIXME: Buffer should be a Uint8Array, needs byteLength method.
 * @param {Buffer} buffer - The buffer to extract strings from.
 * @param {number} minLength - The minimum length of a string to be extracted.
 * @returns {object} - The extracted strings and the total size in bytes.
 */
function strings(buffer, minLength = 4) {
  const result = [];
  let currentString = '';
  let size = 0;
  for (let i = 0; i < buffer.length; i++) {
    const char = String.fromCharCode(buffer[i]);
    if (printableChars.test(char)) {
      currentString += char;
    } else {
      if (currentString.length >= minLength) {
        result.push(currentString);
        size += Buffer.byteLength(currentString, 'utf8');
      }
      currentString = '';
    }
  }

  // handle any remaining string at the end of the buffer
  if (currentString.length >= minLength) {
    result.push(currentString);
    size += Buffer.byteLength(currentString, 'utf8');
  }
  return {output: result.join(' '), size};
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
 * TODO: figure out what's the most suitable way to test if file is an FTDC file
 * TODO: test multiple different BSON files to determine if they are valid FTDC files
 * TODO: fix nested BSON parsing
 *
 * Reads a BSON file to determine if it's an FTDC file. It parses the BSON file
 * and returns the JSON object.
 *
 * @param {string} uri - The URI of the file to fetch.
 * @param {(uri: string) => Promise<ArrayBuffer>} callback
 * - The async function to fetch the file.
 * @returns {{isFTDCFile: true, result: object|null}}
 * true if the file is an FTDC file, and the parsed JSON object.
 */
async function readFTDCFile(uri, callback) {
  let buffer;
  try {
    const response = await callback(uri);
    if (!(response instanceof ArrayBuffer)) {
      throw new Error('callback must return an ArrayBuffer');
    }
    buffer = new Uint8Array(response);
  } catch (error) {
    throw error;
  }

  addUint8ArrayMethods(Uint8Array.prototype);

  const size = buffer.readUInt32LE(0);

  assert.equal(buffer instanceof Uint8Array, true, 'Invalid buffer type');

  if (size < 5) {
    throw new BSONError('Invalid BSON size');
  }
  if (buffer[size - 1] !== 0) {
    throw new BSONError('Invalid BSON terminator');
  }

  let index = 4;

  const maxAllowableDepth = 3;

  // stack element to deserialize nested BSON documents
  const element = {
    size: 0,
    document: {},
    level: 0, // nesting level of the current object
  };

  let item;
  let stackItem = true;
  const stack = [];
  stack.push(element);

  // serialized JSON to return later
  const object = {};

  while (index < buffer.length || stack.length > 0) {
    if (stackItem) {
      item = stack.pop();
      stackItem = false;
    }

    const elementType = buffer[index++];

    if (elementType === 0) {
      continue;
    }

    const keyName = buffer
        .subarray(index, indexAfterCString(buffer, index) - 1)
        .toString();

    item.document[keyName] = null;

    index = indexAfterCString(buffer, index);

    if (item.level >= maxAllowableDepth) {
      throw new Error(
          `Exceeds the limit of ${maxAllowableDepth} levels of nesting`,
      );
    }

    // for (const [key, value] of Object.entries(item.document)) {
    //   console.log(key, value);
    // }

    switch (elementType) {
      case BSON.DATA_NUMBER:
        const number = buffer.readDoubleLE(index);
        item.document[keyName] = number;
        object[keyName] = number;
        index += 8;
        break;
      case BSON.DATA_STRING:
        const string = readString(buffer, index);
        item.document[keyName] = string;
        object[keyName] = string;
        index += 4 + string.length;
        break;
      case BSON.DATA_OBJECT:
        const size = buffer.readUInt32LE(index);
        const document = buffer.subarray(index, index + size);
        item.document[keyName] = {};
        object[keyName] = {};
        stack.push({size, document, level: item.level + 1});
        stackItem = true;
        index += 4;
        break;
      case BSON.DATA_ARRAY:
      case BSON.DATA_BINARY:
      case BSON.DATA_UNDEFINED:
      case BSON.DATA_OBJECTID:
        const _id = readObjectId(buffer, index);
        item.document[keyName] = _id;
        object[keyName] = _id;
        index += 12;
        break;
      case BSON.DATA_BOOLEAN:
        const bool = buffer[index] === 0 ? false : true;
        item.document[keyName] = bool;
        object[keyName] = bool;
        index += 1;
        break;
      case BSON.DATA_DATE:
        const data = buffer.subarray(index, index + 8);
        const bigInt = data.readBigInt64LE(0);
        const date = new Date(Number(bigInt));
        item.document[keyName] = date;
        object[keyName] = date;
        index += 8;
        break;
      case BSON.DATA_NULL:
      case BSON.DATA_REGEXP:
      case BSON.DATA_DBPOINTER:
      case BSON.DATA_CODE:
      case BSON.DATA_SYMBOL:
      case BSON.DATA_CODE_W_SCOPE:
      case BSON.DATA_INT32:
        const int32 = buffer.readInt32LE(index);
        item.document[keyName] = int32;
        object[keyName] = int32;
        index += 4;
        break;
      case BSON.DATA_TIMESTAMP:
        break;
      case BSON.DATA_LONG:
      case BSON.DATA_DECIMAL128:
      case BSON.DATA_MIN_KEY:
      case BSON.DATA_MAX_KEY:
      default:
        break;
    }
  }

  return {
    isFTDCFile: true, // TODO
    result: object === null ? null : object,
  };
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

const result = await readFTDCFile(
    'https://github.com/b1ron/ftdc/raw/refs/heads/master/files/bar.bson',
    fetchFile,
);
console.log(result);
console.log(result === true ? 'FTDC file' : 'Not an FTDC file');
