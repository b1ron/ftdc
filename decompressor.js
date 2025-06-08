// decompressor.js contains functions to decompress zlib-compressed FTDC metrics data
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as parser from './parser.js';
import * as utils from './utils.js';

const inflate = async function(buffer) {
  const byteStream = new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
  const decompressionStream = new DecompressionStream('deflate');
  const decompressedStream = byteStream.pipeThrough(decompressionStream);
  return new Response(decompressedStream).bytes();
};

const uncompress = async function() {
  let data = await fetchFile('https://github.com/b1ron/ftdc/raw/refs/heads/master/files/diagnostic.data/metrics.2024-04-16T11-34-42Z-00000');
  const options = {FTDC: true}; // FTDC true returns compressed metrics
  const uncompressedLength = utils.readUInt32LE(data);
  if (uncompressedLength > 10000000) {
    throw new Error('Metrics chunk has exceeded the allowable size');
  }
  data = parser.parseBSON(data, options);
  options.FTDC = false;

  data = await inflate(data);
  const size = utils.readUInt32LE(data);
  const referenceDocument = parser.parseBSON(data.subarray(0, size));

  data = data.subarray(size, data.length);
  const metricsCount = utils.readUInt32LE(data);
  const sampleCount = utils.readUInt32LE(data, 4);
  if (metricsCount * sampleCount > 1000000) {
    throw new Error('Count of metrics and samples have exceeded the allowable range');
  }

  const metrics = [];
  extractMetricsFromDocument(referenceDocument, metrics);
  if (metrics.length != metricsCount) {
    throw new Error('Metrics in the reference document and metrics count do not match');
  }
  console.log(metrics);
};

function extractMetricsFromDocument(doc, metrics) {
  for (const value of Object.values(doc)) {
    if (value.constructor == Object || Array.isArray(value)) {
      extractMetricsFromDocument(value, metrics);
      continue;
    }

    if (typeof value === 'string') {
      // extract two numbers from timestamp
      if (value.startsWith('Timestamp')) {
        const numbers = value.match(/\d+/g);
        metrics.push(...numbers);
        continue;
      }
      // skip non numeric fields and empty strings
      if (isNaN(value) || value === '') {
        continue;
      }
      // valid string number
      if (value.trim() !== '') {
        metrics.push(Number(value));
        continue;
      }
    }

    // convert date
    if (value instanceof Date) {
      metrics.push(value.getTime());
      continue;
    }

    // primitive number or numeric-like (e.g., booleans)
    metrics.push(Number(value));
  }
}

async function fetchFile(uri) {
  const response = await fetch(uri, {
    signal: AbortSignal.timeout(60 * 1000),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch file: ' + response.statusText);
  }
  return response.bytes();
}

uncompress();
