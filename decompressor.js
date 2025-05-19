// decompressor.js contains functions to decompress zlib-compressed FTDC metrics data

export const inflate = async function(buffer, format) {
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
