// decompressor.js contains functions to decompress zlib-compressed FTDC metrics data

import * as parser from './parser.js';
import * as utils from './utils.js';

const inflate = async function(buffer, format) {
  const byteStream = new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
  const decompressionStream = new DecompressionStream(format);
  const decompressedStream = byteStream.pipeThrough(decompressionStream);
  return new Response(decompressedStream).arrayBuffer();
};

const uncompress = async function() {
  let data = await fetchFile('https://github.com/b1ron/ftdc/raw/refs/heads/master/files/diagnostic.data/metrics.2024-04-16T11-34-42Z-00000');
  const options = {FTDC: true}; // FTDC true returns compressed metrics
  data = new Uint8Array(data);
  const compressed = parser.parseBSON(
      data,
      options,
  );

  options.FTDC = false;
  const metrics = new Uint8Array(await inflate(compressed, 'deflate'));
  const refSize = utils.readInt32LE(metrics);
  console.log(parser.parseBSON(metrics.subarray(4, refSize)));
  console.log(refSize, metrics.length, metrics.length - refSize >= 8); // can we read 64b

  const sampleCount = utils.readUInt32LE(metrics.subarray(refSize, metrics.length));
  const metricCount = utils.readUInt32LE(metrics.subarray(refSize + 4, metrics.length));
  console.log(sampleCount, metricCount);
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
