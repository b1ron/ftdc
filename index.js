import { uncompress } from './decompressor.js'

async function fetchFile(url) {
  const response = await fetch(url);
  return response.bytes();
}

// Node.js versions > v20.19.3 seem to throw ERR_TRAILING_JUNK_AFTER_STREAM_END 
const buffer = await fetchFile('https://github.com/b1ron/ftdc/raw/refs/heads/master/files/diagnostic.data/metrics.2025-07-10T15-58-48Z-00000');

// TODO: ...
//

const result = await uncompress(buffer);
