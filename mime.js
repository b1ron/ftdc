// FTDC quick parser
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as assert from 'assert';
import * as BSON from './constants.js';
import * as fs from 'fs';

/**
 * Error class for BSON parsing errors.
 *
 * @class
 * @extends Error
 */
class BSONError extends Error {
	constructor(message) {
		super(message);
		this.name = 'BSONError';
	}
}

/**
 * Reads a buffer and returns the index at the end of a C string.
 * It purposely returns the index after the null terminator and not the actual string.
 *
 * @param {Buffer} buffer - The buffer to read.
 * @param {number} offset - The starting position for the search.
 * @returns {number} - The index after the null terminator in the C string.
 */
function indexAfterCString(buffer, offset) {
	let i = offset;

	while (buffer[i] !== 0x00 && i < buffer.length) {
		i++;
	}
	return i + 1;
}

/**
 * Extracts strings from a buffer.
 *
 * @param {Buffer} buffer - The buffer to extract strings from.
 * @param {number} minLength - The minimum length of a string to be extracted.
 * @returns {object} - The extracted strings and the total size in bytes.
 *
 */
function strings(buffer, minLength = 4) {
	const printableChars = /^[\x20-\x7E]+$/; // ASCII printable characters

	let result = [];
	let currentString = '';
	let size = 0;

	for (let i = 0; i < buffer.length; i++) {
		const char = String.fromCharCode(buffer[i]);
		if (printableChars.test(char)) {
			currentString += char;
		} else {
			if (currentString.length >= minLength) {
				result.push(currentString);
				size += Buffer.byteLength(currentString, 'utf8');
			}
			currentString = '';
		}
	}
	if (currentString.length >= minLength) {
		result.push(currentString);
		size += Buffer.byteLength(currentString, 'utf8');
	}
	return { output: result.join(' '), size };
}

function readUInt32LE(offset = 0) {
	const first = this[offset];
	const last = this[offset + 3];
	if (first === undefined || last === undefined)
		throw new RangeError('Index out of range');

	return (
		first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24
	);
}

function toHex() {
	return [...this].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

/**
 * Adds methods to the Uint8Array prototype to read and write typed arrays.
 * @returns {void}
 * @api private
 */
function addTypedArrayMethods(prototype) {
	prototype.readUInt32LE = readUInt32LE;
	prototype.toHex = toHex;
}

/**
 * Reads a BSON file to quicky determine if it's an FTDC file by terminating
 * early upon finding specific fields or keywords.
 *
 * @param {string} uri - The URI of the file to read.
 * @returns {boolean} - true if the file is an FTDC file.
 */
async function readFTDCFile(uri) {
	Uint8Array.prototype.readUInt32LE = readUInt32LE;

	let buffer;

	try {
		const response = await fetch(uri);
		const arrayBuffer = await response.arrayBuffer();
		buffer = new Uint8Array(arrayBuffer);
	} catch (error) {
		throw new Error('Failed to fetch file');
	}

	assert.equal(buffer instanceof Uint8Array, true, 'Invalid buffer type');
	assert.equal(buffer.readUInt32LE(0), 12261, 'Invalid BSON size');

	const size = buffer.readUInt32LE(0);

	if (size < 5) {
		throw new BSONError('Invalid BSON size');
	}
	if (buffer[size - 1] !== 0) {
		throw new BSONError('Invalid BSON terminator');
	}

	let index = 4;

	while (index < buffer.length) {
		const elementType = buffer[index++];

		if (elementType === 0) {
			continue;
		}

		const keyName = buffer.toString(
			'utf-8',
			index,
			indexAfterCString(buffer, index) - 1
		);

		index = indexAfterCString(buffer, index);

		switch (elementType) {
			case BSON.DATA_NUMBER:
				const number = buffer.readDoubleLE(index);
				index += 8;
				break;
			case BSON.DATA_STRING:
				const result = strings(buffer.subarray(index));
				if (result.size > 0 && result.output.includes('getCmdLineOpts')) {
					return true;
				}
				index += result.size;
				break;
			case BSON.DATA_OBJECT:
				// TODO: tricky to parse nested objects
				break;
			case BSON.DATA_ARRAY:
			case BSON.DATA_BINARY:
			case BSON.DATA_UNDEFINED:
			case BSON.DATA_OBJECTID:
			case BSON.DATA_BOOLEAN:
				const bool = buffer[index] === 0 ? false : true;
				index += 1;
				break;
			case BSON.DATA_DATE:
				const data = buffer.subarray(index, index + 8);
				const bigInt = data.readBigInt64LE(0);
				const date = new Date(Number(bigInt));
				index += 8;
				break;
			case BSON.DATA_NULL:
			case BSON.DATA_REGEXP:
			case BSON.DATA_DBPOINTER:
			case BSON.DATA_CODE:
			case BSON.DATA_SYMBOL:
			case BSON.DATA_CODE_W_SCOPE:
			case BSON.DATA_INT32:
				const int32 = buffer.readInt32LE(index);
				index += 4;
				break;
			case BSON.DATA_TIMESTAMP:
				break;
			case BSON.DATA_LONG:
				const long = buffer.readBigInt64LE(index);
				index += 8;
				break;
			case BSON.DATA_DECIMAL128:
			case BSON.DATA_MIN_KEY:
			case BSON.DATA_MAX_KEY:
			default:
				break;
		}
	}

	return false;
}

// file size: 12261 bytes
const result = readFTDCFile(
	'https://github.com/b1ron/files/raw/refs/heads/main/metrics.2021-03-15T02-21-47Z-00000'
);
console.log(result === true ? 'FTDC file' : 'Not an FTDC file');
