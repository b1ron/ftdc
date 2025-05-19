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
  let data = await fetchFile('https://github.com/b1ron/ftdc/raw/refs/heads/master/files/metrics.bson');
  const options = {FTDC: true};
  data = new Uint8Array(data);
  const compressed = parser.parseBSON(
      data,
      options,
  );

  options.FTDC = false;
  const metrics = new Uint8Array(await inflate(compressed, 'deflate'));
  const size = utils.readInt32LE(metrics);
  const ref = parser.parseBSON(metrics.subarray(0, size), options);
  console.log(ref);
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
