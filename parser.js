// parser.js contains a BSON parser with an option for FTDC files.

import * as BSON from './constants.js';
import * as utils from './utils.js';

function indexAfterCString(buffer, offset) {
  let i = offset;
  while (buffer[i] !== 0x00 && i < buffer.length) {
    i++;
  }

  return i + 1;
}

function addUint8ArrayMethods(prototype) {
  prototype.toString = utils.toString;
  prototype.toHex = utils.toHex;
  prototype.toBase64 = utils.toBase64;
}

function put(obj, key, value) {
  if (key === undefined) {
    return;
  }

  if (Array.isArray(obj)) {
    obj.push(value);
    return obj;
  }

  obj[key] = value;
  return obj;
}

/**
 * Parses a BSON buffer
 * @param {Uint8Array} buffer
 * @returns The parsed JSON object.
 */
export const parseBSON = function (buffer, options = { FTDC: false }) {
  addUint8ArrayMethods(Uint8Array.prototype);

  let size = utils.readUint32LE(buffer);
  let index = 4;
  const totalSize = size;
  utils.validateBuffer(buffer, size);

  // the object to return
  const object = {};
  let currentObj = object;

  let key;
  let value;

  const stack = [];
  let isArray = false;

  while (index < buffer.length) {
    if (stack[stack.length - 1]?.size === index) {
      currentObj = stack.pop().currentObj;
      if (Array.isArray(currentObj)) {
        isArray = true;
      } else {
        isArray = false;
      }
    }

    const elementType = buffer[index++];

    if (elementType === 0) {
      continue;
    }

    // only parse key if the current context is an object, not an array
    if (!isArray) {
      key = buffer.subarray(index, indexAfterCString(buffer, index) - 1).toString();
    }

    index = indexAfterCString(buffer, index);

    switch (elementType) {
      case BSON.NUMBER:
        value = utils.readDoubleLE(buffer, index);
        put(currentObj, key, value);
        index += 8;
        break;
      case BSON.STRING:
        value = utils.readString(buffer, index);
        put(currentObj, key, value);
        index += 4 + value.length;
        break;
      case BSON.DOCUMENT:
        size = utils.readUint32LE(buffer, index);
        utils.validateBuffer(buffer, size, index);

        stack.push({ currentObj, size: size + index });

        const o = {};
        put(currentObj, key, o);
        currentObj = o;

        // if the parent is an array and the new document is empty (i.e. size == 5)
        // maintain array behavior; otherwise, switch to object behavior
        if (size > 5) {
          isArray = false;
        }

        index += 4;
        break;
      case BSON.ARRAY:
        size = utils.readUint32LE(buffer, index);
        utils.validateBuffer(buffer, size, index);

        stack.push({ currentObj, size: size + index });

        const a = [];
        put(currentObj, key, a);
        currentObj = a;

        isArray = true;

        index += 4;
        break;
      case BSON.BINARY:
        size = utils.readUint32LE(buffer, index);

        value = buffer
          .subarray(index, index + size)
          .map((b) => b.toString(16))
          .join('');
        put(currentObj, key, value);

        // return the metrics chunk for further parsing
        if (options.FTDC) {
          value = buffer.subarray(index + 8 + 1, index + size + 5); 
          put(currentObj, key, value);
          return object;
        }

        index += 4 + size;
      case BSON.UNDEFINED:
        break;
      case BSON.OBJECTID:
        value = utils.readObjectId(buffer, index);
        put(currentObj, key, value);
        index += 12;
        break;
      case BSON.BOOLEAN:
        value = buffer[index] !== 0;
        put(currentObj, key, value);
        index += 1;
        break;
      case BSON.DATE:
        const data = buffer.subarray(index, index + 8);
        value = new Date(Number(utils.readBigInt64LE(data, 0)));
        put(currentObj, key, value);
        index += 8;
        break;
      case BSON.NULL:
        value = null;
        put(currentObj, key, value);
        break;
      case BSON.REGEXP:
      case BSON.DBPOINTER:
      case BSON.CODE:
      case BSON.SYMBOL:
      case BSON.CODE_W_SCOPE:
        break;
      case BSON.INT32:
        value = utils.readInt32LE(buffer, index);
        put(currentObj, key, value);
        index += 4;
        break;
      case BSON.TIMESTAMP:
        value = utils.readTimestamp(buffer, index);
        if (options.FTDC) {
          const numbers = value.match(/\d+/g);
          put(currentObj, key + '_t', numbers[0]);
          put(currentObj, key + '_i', numbers[1]);
        } else {
          put(currentObj, key, value);
        }
        index += 8;
        break;
      case BSON.LONG:
        value = utils.readBigInt64LE(buffer, index);
        put(currentObj, key, value.toString());
        index += 8;
        break;
      case BSON.DECIMAL128:
      // TODO: handle decimal128
      case BSON.MIN_KEY:
      case BSON.MAX_KEY:
      default:
        break;
    }
  }

  return object;
};
