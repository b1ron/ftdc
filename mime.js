// FTDC quick parser
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as assert from 'assert';
import * as BSON from './constants.js';
import * as fs from 'fs';

/**
 * ExtendedArrayBuffer class to provide additional functionality for reading
 * BSON files.
 *
 * @class
 * @extends ArrayBuffer
 * @param {Buffer} buffer - The buffer to extend.
 * @returns {ExtendedArrayBuffer} - The extended buffer.
 *
 * TODO: more methods to be added as needed.
 */
class ExtendedArrayBuffer extends ArrayBuffer {
	constructor(buffer) {
		super(buffer);
		this.buffer = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength
		);
		this.view = new DataView(this.buffer);
	}

	readUInt32LE(offset) {
		return this.view.getUint32(offset, true);
	}

	readBigInt64LE(offset) {
		return this.view.getBigInt64(offset, true);
	}

	byteLength() {
		return this.buffer.byteLength;
	}

	getRawBuffer() {
		return this.buffer;
	}
}

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
	return { output: result.join('\n'), size };
}

/**
 * Reads a BSON file to quicky determine if it's an FTDC file by terminating
 * early upon finding specific fields or keywords.
 *
 * @param {string} filename - The file to read.
 * @returns {boolean} true if the file is an FTDC file.
 */
function readFTDCFile(filename) {
	let buffer = fs.readFileSync(filename);
	const size = buffer.readUInt32LE(0);
	buffer = buffer.subarray(0, size);

	let arrayBuffer = new ExtendedArrayBuffer(buffer);
	assert.equal(arrayBuffer instanceof ArrayBuffer, true);

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

const result = readFTDCFile('files/metrics.2021-03-15T02-21-47Z-00000');
console.log(result === true ? 'FTDC file' : 'Not an FTDC file');
