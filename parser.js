/* eslint-disable max-len */
// BSON parser for FTDC files
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as constants from './constants.js';
import * as utils from './utils.js';

/**
 * Reads a buffer and returns the index at the end of a C string.
 * It purposely returns the index after the null terminator and not the actual string.
 * @param {Buffer} buffer - The buffer to read.
 * @param {number} offset - The starting position for the search.
 * @returns {number} The index after the null terminator in the C string.
 * @api private
*/
function indexAfterCString(buffer, offset) {
  let i = offset;
  while (buffer[i] !== 0x00 && i < buffer.length) {
    i++;
  }

  return i + 1;
}

/**
 * Adds methods to the Uint8Array prototype.
 * Uint8Array is the most suitable TypedArray for working with arbitrary binary data.
 * @returns {void}
 * @api private
 */
function addUint8ArrayMethods(prototype) {
  prototype.toString = utils.toString;
  prototype.toHex = utils.toHex;
  prototype.toBase64 = utils.toBase64;
}

/**
 * Appends a value to an object or array.
 * @api private
 */
function append(obj, key, value) {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Cannot append to non-object');
  }
  if (Array.isArray(obj)) {
    obj.push(value);
    return obj;
  }
  obj[key] = value;
  return obj;
}

/**
 * Parses a BSON file and returns the parsed JSON object.
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
      throw new Error('fetchFile must return an ArrayBuffer');
    }
    buffer = new Uint8Array(response);
  } catch (error) {
    throw error;
  }

  addUint8ArrayMethods(Uint8Array.prototype);

  let size = utils.readUInt32LE(buffer);
  utils.validateBuffer(buffer, size);

  let index = 4;

  // the JSON object to be returned
  const result = {};
  // the current object being parsed
  let current = result;

  // stack to parse nested BSON documents
  const stack = [];
  stack.push({current: result, length: size});

  let key;
  let value;

  while (index < buffer.length) {
    const elementType = buffer[index++];

    // FIXME: clean this code
    if (stack[stack.length - 1] !== undefined && stack[stack.length - 1].length === index) {
      // if current is null, just pop the stack
      // this is the case for empty BSON documents and arrays
      if (stack[stack.length - 1].current === null) {
        stack.pop();
      } else {
        // if current is not null, pop the stack and set current to the popped value
        // an additional pop is needed to get the parent object
        stack.pop();
        const popped = stack.pop();
        if (popped !== undefined) {
          current = popped.current;
        }
      }
    }

    if (elementType === 0) {
      continue;
    }

    // skip key when parsing arrays
    if (!(Array.isArray(current))) {
      key = buffer
          .subarray(index, indexAfterCString(buffer, index) - 1)
          .toString();
    }

    index = indexAfterCString(buffer, index);

    switch (elementType) {
      case constants.BSON_NUMBER:
        value = utils.readDoubleLE(buffer, index);
        append(current, key, value);
        index += 8;
        break;
      case constants.BSON_STRING:
        value = utils.readString(buffer, index);
        append(current, key, value);
        index += 4 + value.length;
        break;
      case constants.BSON_DOCUMENT:
        size = utils.readUInt32LE(buffer, index);
        utils.validateBuffer(buffer, size, index);
        // empty so do not update current
        if (size === 5) {
          append(current, key, {});
          stack.push({current: null, length: size + index + 1});
          index += 4;
          break;
        }
        if (Array.isArray(current)) {
          current.push({});
          current = current[current.length - 1];
        } else {
          current[key] = {};
          current = current[key];
        }
        stack.push({current: current, length: size + index + 1});
        index += 4;
        break;
      case constants.BSON_ARRAY:
        size = utils.readUInt32LE(buffer, index);
        utils.validateBuffer(buffer, size, index);
        // empty so do not update current
        if (size === 5) {
          append(current, key, []);
          stack.push({current: null, length: size + index + 1});
          index += 4;
          break;
        }
        if (Array.isArray(current)) {
          current.push([]);
          current = current[current.length - 1];
        } else {
          current[key] = [];
          current = current[key];
        }
        stack.push({current: current, length: size + index + 1});
        index += 4;
        break;
      case constants.BSON_BINARY:
        size = utils.readUInt32LE(buffer, index);
        // value = buffer.subarray(index, index + size)
        //     .map((b) => b.toString(16)).join('');
        append(current, key, 'BinData(...)');
        index += 4;
      case constants.BSON_UNDEFINED:
        break;
      case constants.BSON_OBJECTID:
        value = utils.readObjectId(buffer, index);
        append(current, key, value);
        index += 12;
        break;
      case constants.BSON_BOOLEAN:
        value = buffer[index] === 0 ? false : true;
        append(current, key, value);
        index += 1;
        break;
      case constants.BSON_DATE:
        const data = buffer.subarray(index, index + 8);
        value = new Date(Number(utils.readBigInt64LE(data, 0)));
        append(current, key, value);
        index += 8;
        break;
      case constants.BSON_NULL:
        value = null;
        append(current, key, value);
        break;
      case constants.BSON_REGEXP:
      case constants.BSON_DBPOINTER:
        break;
      case constants.BSON_CODE:
      case constants.BSON_SYMBOL:
        break;
      case constants.BSON_CODE_W_SCOPE:
        break;
      case constants.BSON_INT32:
        value = utils.readInt32LE(buffer, index);
        append(current, key, value);
        index += 4;
        break;
      case constants.BSON_TIMESTAMP:
        value = utils.readBigInt64LE(buffer, index).toString();
        append(current, key, value);
        index += 8;
        break;
      case constants.BSON_LONG:
        value = utils.readBigInt64LE(buffer, index);
        append(current, key, value);
        index += 8;
        break;
      case constants.BSON_DECIMAL128:
        // TODO: handle decimal128
      case constants.BSON_MIN_KEY:
      case constants.BSON_MAX_KEY:
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
    throw new Error('Failed to fetch file: ' + response.statusText);
  }
  return response.arrayBuffer();
}
const result = await parseBSONFile(
    'https://github.com/b1ron/ftdc/raw/refs/heads/master/files/f.bson',
    fetchFile,
);
function serializeBigInt(key, value) {
  return (typeof value === 'bigint') ? value.toString() : value;
}
console.log(JSON.stringify(result, serializeBigInt, 4));
