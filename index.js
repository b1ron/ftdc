import { uncompress } from './decompressor.js'
import fs from 'fs';

async function fetchFile(url) {
  const response = await fetch(url);
  return response.bytes();
}

// Node.js versions > v20.19.3 seem to throw ERR_TRAILING_JUNK_AFTER_STREAM_END 
// const buffer = await fetchFile('https://github.com/b1ron/ftdc/raw/refs/heads/master/files/diagnostic.data/metrics.2025-07-10T15-58-48Z-00000');


let buffer;
try {
  buffer = fs.readFileSync('files/diagnostic.data/metrics.2025-07-10T15-58-48Z-00000')
} catch (err) {
  console.error(err);
}

// TODO: ...
//

const result = await uncompress(new Uint8Array(buffer));
