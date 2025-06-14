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
  const decompressionStream = new DecompressionStream('deflate');
  const decompressedStream = byteStream.pipeThrough(decompressionStream);
  return new Response(decompressedStream).bytes();
};

// Decodes compressed metric data and reconstructs full sample documents.
const uncompress = async function(compressed) {
  const uncompressedLength = utils.readUint32LE(compressed);

  if (uncompressedLength > 10000000) {
    throw new Error('Metrics chunk has exceeded the allowable size');
  }

  // FTDC true returns compressed metrics
  const options = {FTDC: true};
  compressed = parser.parseBSON(compressed, options);
  options.FTDC = false;

  let buffer = await inflate(compressed);
  const size = utils.readUint32LE(buffer);

  // parse reference document
  const referenceDocument = parser.parseBSON(buffer.subarray(0, size));
  buffer = buffer.subarray(size, buffer.length);

  stripNonNumericFields(referenceDocument);

  const metricsCount = utils.readUint32LE(buffer);
  const sampleCount = utils.readUint32LE(buffer, 4);

  if (metricsCount * sampleCount > 1000000) {
    throw new Error('Count of metrics and samples have exceeded the allowable range');
  }

  const metrics = [];
  const currentDocument = referenceDocument;
  extractMetricsFromDocument(currentDocument, metrics);

  if (metrics.length !== metricsCount) {
    throw new Error('Metrics in the reference document and metrics count do not match');
  }

  const deltas = [];
  let zeroOutCount = 0;

  const reader = utils.createBufferReader(data);

  // decompress deltas
  for (let i = 0; i < metricsCount; i++) {
    for (let j = 0; j < sampleCount; j++) {
      if (zeroOutCount > 0) {
        deltas[i * sampleCount + j] = 0;
        zeroOutCount--;
        continue;
      }
      const delta = reader.decodeVarint();
      if (delta === 0) {
        // decode run-length of zeros
        zeroOutCount = reader.decodeVarint();
      }
      deltas[i * sampleCount + j] = delta;
    }
  }

  const docs = [];
  docs.push(currentDocument);

  // inflate delta-encoded metric data:
  // for each metric, add its baseline value (from the reference document) to
  // the first sample
  for (let i = 0; i < metricsCount; i++) {
    deltas[i * sampleCount + 0] += metrics[i];
  }

  // restore the original cumulative values
  for (let i = 0; i < metricsCount; i++) {
    for (let j = 1; j < sampleCount; j++) {
      deltas[i * sampleCount + j] += deltas[i * sampleCount + j - 1];
    }
  }

  // construct a new document for each sample with context from the reference document
  for (let i = 0; i < sampleCount; i++) {
    for (let j = 0; j < metricsCount; j++) {
      metrics[j] = deltas[j * sampleCount + i];
    }
    updateFromArray(referenceDocument, currentDocument, metrics);
    docs.push(currentDocument);
  }

  return docs;
};

function stripNonNumericFields(doc) {
  Object.entries(doc).forEach(([key, value]) => {
    if (typeof value === 'string') {
      if (value.startsWith('Timestamp')) {
        return;
      }
      // delete non numeric fields and empty strings
      if (isNaN(value) || value === '') {
        delete(doc[key]);
        return;
      }
    }

    if (value.constructor == Object || Array.isArray(value)) {
      stripNonNumericFields(value);
    }
  });
}

function extractMetricsFromDocument(doc, metrics) {
  Object.values(doc).forEach((value) => {
    // extract two numbers from timestamp
    if (typeof value === 'string' && value.startsWith('Timestamp')) {
      const numbers = value.match(/\d+/g);
      metrics.push(...numbers);
      return;
    }
    if (value instanceof Date) {
      metrics.push(value.getTime());
      return;
    }

    if (value.constructor == Object || Array.isArray(value)) {
      extractMetricsFromDocument(value, metrics);
    } else {
      // primitive number or numeric-like (e.g., booleans)
      metrics.push(Number(value));
    }
  });
}

function updateFromArray(ref, doc, metrics, pos = 0) {
  Object.entries(ref).forEach(([key, value]) => {
    if (typeof value === 'string' && value.startsWith('Timestamp')) {
      doc[key] = metrics[pos++];
      pos++; // skip ordinal
      return;
    }

    if (value.constructor == Object || Array.isArray(value)) {
      updateFromArray(value, doc, metrics, pos);
    } else {
      doc[key] = metrics[pos++];
    }
  });
}
