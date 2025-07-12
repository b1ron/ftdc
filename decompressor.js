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
}

/**
 * TODO
 */
export const uncompress = async function (compressed) {
	const uncompressedLength = utils.readUint32LE(compressed);

	if (uncompressedLength > 10000000) {
		throw new Error('TODO');
	}

	// FTDC true returns compressed metrics
	const options = {FTDC: true};
	compressed = parser.parseBSON(compressed, options);

	let buffer = await inflate(compressed.data);
	const size = utils.readUint32LE(buffer);

	let ref = parser.parseBSON(buffer.subarray(0, size));
	buffer = buffer.subarray(size, buffer.length);

	const reader = utils.createBufferReader(buffer);

	const metricsCount = reader.readUint32LE();
	const sampleCount = reader.readUint32LE();

	ref = flattenObject(ref);
	const metrics = [];
	extractMetrics(ref, metrics); // FIXME

	// reader.readUint32LE();
};

function flattenObject(obj, path = '', result = {}) {
	Object.entries(obj).forEach(([key, value]) => {
		if (value.constructor === Object || Array.isArray(value)) {
			return flattenObject(value, path ? path + '.' + key : key, result);
		}

		result[path ? path + '.' + key : key] = value;
	});
	return result;
}

function extractMetrics(doc, metrics) {
	Object.values(doc).forEach(value => {
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

		if (value.constructor === Object || Array.isArray(value)) {
			extractMetrics(value, metrics);
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

		if (value.constructor === Object || Array.isArray(value)) {
			updateFromArray(value, doc, metrics, pos);
		} else {
			doc[key] = metrics[pos++];
		}
	});
}
