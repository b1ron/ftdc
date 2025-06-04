// parser.js contains a BSON parser, including an option for FTDC files

import * as BSON from './constants.js';
import * as utils from './utils.js';

/**
 * Reads a buffer and returns the index at the end of a C string.
 * It purposely returns the index after the null terminator and not the actual string.
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
 * Adds a value to an object or array.
 * @api private
 */
function addValue(obj, key, value) {
  if (key === undefined) return;
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('obj must be an object or array');
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
export const parseBSON = function(buffer, options = {FTDC: false}) {
  addUint8ArrayMethods(Uint8Array.prototype);

  let size = utils.readUInt32LE(buffer);
  let index = 4;
  const totalSize = size;
  utils.validateBuffer(buffer, size);

  // the object to return
  const object = {};
  let currentObj = object;

  let key;
  let value;

  const st = [];
  let isArray = false;
  while (index < buffer.length) {
    // stack logic
    if (st[st.length - 1] !== undefined && st[st.length - 1].size === index) {
      currentObj = st.pop().currentObj;
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

    // only parse the key if the current context is an object, not an array
    if (!(isArray)) {
      key = buffer
          .subarray(index, indexAfterCString(buffer, index) - 1)
          .toString();
    }

    index = indexAfterCString(buffer, index);

    switch (elementType) {
      case BSON.NUMBER:
        value = utils.readDoubleLE(buffer, index);
        addValue(currentObj, key, value);
        index += 8;
        break;
      case BSON.STRING:
        value = utils.readString(buffer, index);
        addValue(currentObj, key, value);
        index += 4 + value.length;
        break;
      case BSON.DOCUMENT:
        size = utils.readUInt32LE(buffer, index);
        utils.validateBuffer(buffer, size, index);

        st.push({currentObj, size: size + index});

        const o = {};
        addValue(currentObj, key, o);
        currentObj = o;

        // if the parent is an array and the new document is empty (i.e. size == 5)
        // maintain array behvaior; otherwise, switch to object behavior
        if (size > 5) isArray = false;

        index += 4;
        break;
      case BSON.ARRAY:
        size = utils.readUInt32LE(buffer, index);
        utils.validateBuffer(buffer, size, index);

        st.push({currentObj, size: size + index});

        const a = [];
        addValue(currentObj, key, a);
        currentObj = a;

        isArray = true;

        index += 4;
        break;
      case BSON.BINARY:
        size = utils.readUInt32LE(buffer, index);

        // return the metrics chunk for further parsing
        if (size + index > totalSize && options.FTDC) {
          return buffer.subarray(index + 8 + 1, buffer.length);
        }

        value = buffer.subarray(index, index + size)
            .map((b) => b.toString(16)).join('');
        addValue(currentObj, key, value);
        index += 4 + size;
      case BSON.UNDEFINED:
        break;
      case BSON.OBJECTID:
        value = utils.readObjectId(buffer, index);
        addValue(currentObj, key, value);
        index += 12;
        break;
      case BSON.BOOLEAN:
        value = buffer[index] === 0 ? false : true;
        addValue(currentObj, key, value);
        index += 1;
        break;
      case BSON.DATE:
        const data = buffer.subarray(index, index + 8);
        value = new Date(Number(utils.readBigInt64LE(data, 0)));
        addValue(currentObj, key, value);
        index += 8;
        break;
      case BSON.NULL:
        value = null;
        addValue(currentObj, key, value);
        break;
      case BSON.REGEXP:
      case BSON.DBPOINTER:
        break;
      case BSON.CODE:
      case BSON.SYMBOL:
        break;
      case BSON.CODE_W_SCOPE:
        break;
      case BSON.INT32:
        value = utils.readInt32LE(buffer, index);
        addValue(currentObj, key, value);
        index += 4;
        break;
      case BSON.TIMESTAMP:
        value = utils.readBigInt64LE(buffer, index).toString();
        addValue(currentObj, key, value);
        index += 8;
        break;
      case BSON.LONG:
        value = utils.readBigInt64LE(buffer, index);
        addValue(currentObj, key, value.toString());
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
