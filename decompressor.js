// decompressor.js contains functions to decompress zlib-compressed FTDC metrics data

import * as parser from './parser.js';

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
  const options = {FTDC: true};
  const compressed = await parser.parseBSONFile(
      'https://github.com/b1ron/ftdc/raw/refs/heads/master/files/metrics.bson',
      fetchFile,
      options,
  );

  const metrics = new Uint8Array(await inflate(compressed, 'deflate'));
  console.log(metrics);
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
