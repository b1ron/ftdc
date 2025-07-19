// decompressor.js contains functions to decompress compressed FTDC metrics data.
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as parser from './parser.js';
import * as utils from './utils.js';
import { log } from './utils.js';

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
  ref = flattenObject(ref);
  buffer = buffer.subarray(size, buffer.length);

  const reader = utils.createBufferReader(buffer);

  const numMetrics = reader.readUint32LE();
  const numSamples = reader.readUint32LE();

  const metrics = extractFromObj(ref); 
  
  const deltas = decodeDeltas(reader);
  const restored = restoreSamples(deltas, metrics, numSamples);
  for (const { sample } of iterateMetricSamples(restored, numMetrics, numSamples)) {
    log(sample);
  }
};

function restoreSamples(deltas, metrics, numSamples) {
  const restored = [];
  for (let i = 0; i < metrics.length; i++) {
    const offset = i * numSamples;
    restored[offset] = deltas[offset] + metrics[i];

    for (let j = 1; j < numSamples; j++) {
      const index = offset + j;
      if (deltas[index] === undefined || deltas[index - 1] === undefined) {
        throw new RangeError('Index is outside the bounds of the deltas array');
      }
      
      const value = deltas[index] + deltas[index - 1];
      restored[index] = value;
    }
  }
  return restored;
}

function* iterateMetricSamples(restored, numMetrics, numSamples) {
  for (let i = 0; i < numSamples; i++) {
    const sample = [];
    for (let j = 0; j < numMetrics; j++) {
      const index = j * numSamples + i;
      const value = restored[index];
      sample.push(value);
    }

    yield { sample };

  }
}

function decodeDeltas(reader, numMetrics, numSamples) {
  const deltas = [];
  let zeroCount = 0;
  while (!reader.isEmpty()) {
    if (zeroCount > 0n) {
      zeroCount--
      deltas.push(0n);
      continue;
    }

    const value = reader.decodeVarint();
    if (value === 0n) {
      zeroCount = reader.decodeVarint();
    }
    
    deltas.push(value);
  }
  return deltas;
}

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
  if (typeof value === 'number' 
    || value instanceof Date
    || typeof value === 'boolean') {
    return true;
  }

  if (typeof value !== 'string') return false;

  const numberStringPattern = /^-?\d+(\.\d+)?$/;
  return (numberStringPattern.test(value) || value.startsWith('Timestamp'));
}

function extractFromObj(obj) {
  const result = [];
  for (const key in obj) {
    let value = obj[key];
    if (!isValid(value)) {
      delete obj[key];
      continue;
    }

    if (value instanceof Date) {
      value = value.getTime();
    }
    if (typeof value === 'string' && value.startsWith('Timestamp')) {
      const numbers = value.match(/\d+/g); 
      result.push(...numbers.map(x => BigInt(x)));
      continue;
    }
    result.push(BigInt(value));
  }
  return result;
}
