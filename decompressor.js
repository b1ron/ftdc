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
	options.FTDC = false;

	let buffer = await inflate(compressed);
	const size = utils.readUint32LE(buffer);

	const schema = parser.parseBSON(buffer.subarray(0, size));
	buffer = buffer.subarray(size, buffer.length);

	const reader = utils.createBufferReader(buffer);
	const metricsCount = reader.readUint32LE();
	const sampleCount = reader.readUint32LE();
	console.log(metricsCount * sampleCount);

	// buffer = buffer.subarray(size, buffer.length);
	// const numMetrics = utils.readUint32LE(buffer);
	// const numSamples = utils.readUint32LE(buffer, 4);
	// buffer = buffer.subarray(8, buffer.length);
};

function stripNonNumericFields(doc) {
	Object.entries(doc).forEach(([key, value]) => {
		if (typeof value === 'string') {
			if (value.startsWith('Timestamp')) {
				return;
			}

			// Delete non numeric fields and empty strings
			if (isNaN(value) || value === '') {
				delete doc[key];
				return;
			}
		}

		if (value.constructor === Object || Array.isArray(value)) {
			stripNonNumericFields(value);
		}
	});
}

function extractMetricsFromDocument(doc, metrics) {
	Object.values(doc).forEach(value => {
		// Extract two numbers from timestamp
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
			extractMetricsFromDocument(value, metrics);
		} else {
			// Primitive number or numeric-like (e.g., booleans)
			metrics.push(Number(value));
		}
	});
}

function updateFromArray(ref, doc, metrics, pos = 0) {
	Object.entries(ref).forEach(([key, value]) => {
		if (typeof value === 'string' && value.startsWith('Timestamp')) {
			doc[key] = metrics[pos++];
			pos++; // Skip ordinal
			return;
		}

		if (value.constructor === Object || Array.isArray(value)) {
			updateFromArray(value, doc, metrics, pos);
		} else {
			doc[key] = metrics[pos++];
		}
	});
}
