// decompressor.js contains functions to decompress compressed FTDC metrics data.
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as parser from './parser.js';
import * as utils from './utils.js';

async function inflate(buffer) {
  const byteStream = new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
  const ds = new DecompressionStream('deflate');
  const decompressedStream = byteStream.pipeThrough(ds);
  return new Response(decompressedStream).bytes();
}

/**
 * TODO
 */
export const uncompress = async function (compressed) {
  const uncompressedLength = utils.readUint32LE(compressed);

  if (uncompressedLength > 10000000) {
    throw new Error('TODO');
  }

  // FTDC true returns compressed metrics
  const options = {FTDC: true};
  compressed = parser.parseBSON(compressed, options);

  let buffer = await inflate(compressed.data);
  const size = utils.readUint32LE(buffer);

  let ref = parser.parseBSON(buffer.subarray(0, size));
  buffer = buffer.subarray(size, buffer.length);

  const reader = utils.createBufferReader(buffer);

  const metricsCount = reader.readUint32LE();
  const sampleCount = reader.readUint32LE();

  ref = flattenObject(ref);
  Object.entries(ref).forEach(([key, value]) => {
    if (typeof value === 'string' && !isValid(value)) {
      delete ref[key];
    }
  });
  // reader.readUint32LE();
  console.log(Object.keys(ref).length, metricsCount);
  console.log(sampleCount);
};

function flattenObject(obj, path = '', result = {}) {
  Object.entries(obj).forEach(([key, value]) => {
    if (value.constructor === Object || Array.isArray(value)) {
      return flattenObject(value, path ? path + '.' + key : key, result);
    }

    result[path ? path + '.' + key : key] = value;
  });
  return result;
}

function isValid(value) {
  return (!isNaN(value)
     || /^-?\d\.\d+$/.test(value)
     || value.startsWith('Timestamp')
     || !isNaN(Date.parse(value)))
}

