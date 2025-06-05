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
  return new Response(decompressedStream).arrayBuffer();
};

const uncompress = async function() {
  let data = await fetchFile('https://github.com/b1ron/ftdc/raw/refs/heads/master/files/diagnostic.data/metrics.2024-04-16T11-34-42Z-00000');
  const options = {FTDC: true}; // FTDC true returns compressed metrics
  data = new Uint8Array(data);
  const uncompressedLength = utils.readUInt32LE(data);
  if (uncompressedLength > 10000000) {
    console.log('metrics chunk has exceeded the allowable size');
  }
  data = parser.parseBSON(data, options);
  options.FTDC = false;

  data = await inflate(data);
  data = new Uint8Array(data);
  const size = utils.readUInt32LE(data);
  const referenceDocument = parser.parseBSON(data.subarray(0, size));
  console.log(referenceDocument.serverStatus.metrics);

  data = data.subarray(size, data.length);
  const metricsCount = utils.readUInt32LE(data);
  const sampleCount = utils.readUInt32LE(data, 4);
  if (metricsCount * sampleCount > 1000000) {
    console.log('metricsCount and sampleCount have exceeded the allowable range');
  }
  console.log(sampleCount, metricsCount);
};

async function fetchFile(uri) {
  const response = await fetch(uri, {
    signal: AbortSignal.timeout(60 * 1000),
  });
  if (!response.ok) {
    throw new Error('Failed to fetch file: ' + response.statusText);
  }
  return response.arrayBuffer();
}

uncompress();
