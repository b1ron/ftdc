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
 * Decompresses a zlib-compressed metrics chunk and returns an array of samples.
 * NOTE: Metrics / variable names are represented using dot-notation (e.g., 'serverStatus.start').
 */
export const uncompress = async function (compressed) {
  const MAX_CHUNK_SIZE = 10000000;

  const uncompressedLength = utils.readUint32LE(compressed);

  if (uncompressedLength > MAX_CHUNK_SIZE) {
    throw new Error('Maximum chunk size exceeded');
  }

  // FTDC true returns compressed metrics
  const options = { FTDC: true };
  compressed = parser.parseBSON(compressed, options);

  let buffer = await inflate(compressed.data);

  const size = utils.readUint32LE(buffer);
  let ref = parser.parseBSON(buffer.subarray(0, size), options);
  ref = flattenObject(ref);
  buffer = buffer.subarray(size, buffer.length);

  const reader = utils.createBufferReader(buffer);

  const numMetrics = reader.readUint32LE();
  const numSamples = reader.readUint32LE();

  const metrics = extractFromObj(ref);

  const deltas = decodeDeltas(reader);
  const restored = restoreSamples(deltas, metrics, numSamples);

  const samples = [];

  // iterate row-wise over restored samples, mapping each value to its corresponding
  // variable name from ref
  for (const { sample } of iterateMetricSamples(restored, numMetrics, numSamples)) {
    const sampleWithVariables = { ...ref };
    Object.keys(ref).forEach((key, pos) => {
      sampleWithVariables[key] = sample[pos];
    });
    samples.push(sampleWithVariables);
  }

  return samples;
};

function restoreSamples(deltas, metrics, numSamples) {
  const restored = [];
  for (let i = 0; i < metrics.length; i++) {
    const offset = i * numSamples;
    deltas[offset] = deltas[offset] + metrics[i];
    restored[offset] = deltas[offset];

    for (let j = 1; j < numSamples; j++) {
      const index = offset + j;
      if (deltas[index] === undefined || deltas[index - 1] === undefined) {
        throw new RangeError('Index is outside the bounds of the deltas array');
      }

      const value = deltas[index] + deltas[index - 1];
      deltas[index] = value;
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
      if (value === undefined) {
        throw new RangeError('Index is outside the bounds of the restored array');
      }
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
      zeroCount--;
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
  if (typeof value === 'number' || value instanceof Date || typeof value === 'boolean') {
    return true;
  }

  if (typeof value !== 'string') return false;

  const numberStringPattern = /^-?\d+(\.\d+)?$/;
  return numberStringPattern.test(value);
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
    result.push(BigInt(value));
  }
  return result;
}
