// FTDC quick parser
// Archive File Format - https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/db/ftdc/README.md#archive-file-format

import * as assert from 'assert';
import * as BSON from './constants.js';

const printableChars = /^[\x20-\x7E]+$/; // ASCII printable characters

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
 * FIXME: Buffer should be a Uint8Array, needs byteLength method.
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
 * This is a slightly altered reimplementation of the Unix strings command.
 *
 * FIXME: Buffer should be a Uint8Array, needs byteLength method.
 * @param {Buffer} buffer - The buffer to extract strings from.
 * @param {number} minLength - The minimum length of a string to be extracted.
 * @returns {object} - The extracted strings and the total size in bytes.
 */
function strings(buffer, minLength = 4) {
	const result = [];
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

	// handle any remaining string at the end of the buffer
	if (currentString.length >= minLength) {
		result.push(currentString);
		size += Buffer.byteLength(currentString, 'utf8');
	}
	return { output: result.join(' '), size };
}

function readObjectId(buffer, offset) {
	const value = buffer.slice(offset, offset + 12);
	return `ObjectId(${value.toHex()})`;
}

function readString(buffer, offset) {
	const length = buffer.readUInt32LE(offset);
	const value = buffer.slice(offset + 4, offset + 4 + length - 1); // -1 to exclude trailing null byte
	return value.toString();
}

function readUInt32LE(offset = 0) {
	const first = this[offset];
	const last = this[offset + 3];
	if (first === undefined || last === undefined) {
		throw new RangeError('Index out of range');
	}

	return (
		first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + last * 2 ** 24
	);
}

function readInt32LE(offset = 0) {
	const first = this[offset];
	const last = this[offset + 3];
	if (first === undefined || last === undefined) {
		throw new RangeError('Index out of range');
	}

	return (
		first + this[++offset] * 2 ** 8 + this[++offset] * 2 ** 16 + (last << 24)
	);
}

function readDoubleLE(offset = 0) {
	const first = this[offset];
	const last = this[offset + 7];
	if (first === undefined || last === undefined) {
		throw new RangeError('Index out of range');
	}

	const buffer = this.slice(offset, offset + 8);
	const uInt8Float64Array = new Uint8Array(buffer);
	const float64Array = new Float64Array(buffer);

	uInt8Float64Array[7] = first;
	uInt8Float64Array[6] = this[++offset];
	uInt8Float64Array[5] = this[++offset];
	uInt8Float64Array[4] = this[++offset];
	uInt8Float64Array[3] = this[++offset];
	uInt8Float64Array[2] = this[++offset];
	uInt8Float64Array[1] = this[++offset];
	uInt8Float64Array[0] = last;

	return float64Array[0];
}

function readBigInt64LE(offset = 0) {
	const first = this[offset];
	const last = this[offset + 7];
	if (first === undefined || last === undefined) {
		throw new RangeError('Index out of range');
	}

	const val =
		this[offset + 4] +
		this[offset + 5] * 2 ** 8 +
		this[offset + 6] * 2 ** 16 +
		(last << 24); // Overflow
	return (
		(BigInt(val) << 32n) +
		BigInt(
			first +
				this[++offset] * 2 ** 8 +
				this[++offset] * 2 ** 16 +
				this[++offset] * 2 ** 24
		)
	);
}

function toString() {
	return new TextDecoder('utf-8').decode(this);
}

function toHex(separator = '') {
	return [...this].map((b) => b.toString(16).padStart(2, '0')).join(separator);
}

function toBase64() {
	return btoa(this.toString());
}

/**
 * Adds methods to the Uint8Array prototype.
 * Uint8Array is the most suitable TypedArray for working with arbitrary binary data.
 * @returns {void}
 * @api private
 */
function addUint8ArrayMethods(prototype) {
	prototype.readInt32LE = readInt32LE;
	prototype.readUInt32LE = readUInt32LE;
	prototype.readDoubleLE = readDoubleLE;
	prototype.readBigInt64LE = readBigInt64LE;
	prototype.toString = toString;
	prototype.toHex = toHex;
	prototype.toBase64 = toBase64;
}

/**
 * Reads a BSON file to quicky determine if it's an FTDC file by terminating
 * early upon finding specific fields or keywords.
 *
 * @param {string} uri - The URI of the file to read.
 * @returns {boolean} - true if the file is an FTDC file.
 */
async function readFTDCFile(uri) {
	addUint8ArrayMethods(Uint8Array.prototype);

	let buffer;

	try {
		const response = await fetch(uri);
		const arrayBuffer = await response.arrayBuffer();
		buffer = new Uint8Array(arrayBuffer);
	} catch (error) {
		throw new Error('Failed to fetch file', error);
	}

	const size = buffer.readUInt32LE(0);

	assert.equal(buffer instanceof Uint8Array, true, 'Invalid buffer type');
	assert.equal(size, 75, 'Invalid BSON size');

	if (size < 5) {
		throw new BSONError('Invalid BSON size');
	}
	if (buffer[size - 1] !== 0) {
		throw new BSONError('Invalid BSON terminator');
	}

	let index = 4;

	const maxAllowableDepth = 3;

	// stack element to deserialize nested BSON documents
	const element = {
		size: 0,
		document: {},
		level: 0, // nesting level of the current element, limited by maxAllowableDepth
	};

	const stack = [];
	stack.push(element);

	const item = stack.pop(); // initially pop first element from stack
	while (index < buffer.length || stack.length >= 0) {
		const elementType = buffer[index++];

		if (elementType === 0) {
			continue;
		}

		const keyName = buffer
			.subarray(index, indexAfterCString(buffer, index) - 1)
			.toString();

		item.document[keyName] = null;

		index = indexAfterCString(buffer, index);

		switch (elementType) {
			case BSON.DATA_NUMBER:
				const number = buffer.readDoubleLE(index);
				item.document[keyName] = number;
				index += 8;
				break;
			case BSON.DATA_STRING:
				const string = readString(buffer, index);
				item.document[keyName] = string;
				console.log(string.length);
				index += 4 + string.length;
				break;
			case BSON.DATA_OBJECT:
				const size = buffer.readUInt32LE(index);
				const document = buffer.subarray(index, index + size);
				item.document[keyName] = document;
				console.log(item.document);
				index += 4;
				break;
			case BSON.DATA_ARRAY:
			case BSON.DATA_BINARY:
			case BSON.DATA_UNDEFINED:
			case BSON.DATA_OBJECTID:
				item.document[keyName] = readObjectId(buffer, index);
				index += 12;
				break;
			case BSON.DATA_BOOLEAN:
				const bool = buffer[index] === 0 ? false : true;
				item.document[keyName] = bool;
				index += 1;
				break;
			case BSON.DATA_DATE:
				const data = buffer.subarray(index, index + 8);
				const bigInt = data.readBigInt64LE(0);
				const date = new Date(Number(bigInt));
				item.document[keyName] = date;
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
				item.document[keyName] = int32;
				index += 4;
				break;
			case BSON.DATA_TIMESTAMP:
				break;
			case BSON.DATA_LONG:
			case BSON.DATA_DECIMAL128:
			case BSON.DATA_MIN_KEY:
			case BSON.DATA_MAX_KEY:
			default:
				break;
		}
	}

	return false;
}

const result = readFTDCFile(
	'https://github.com/b1ron/ftdc/raw/refs/heads/master/files/foo.bson'
);
console.log(result === true ? 'FTDC file' : 'Not an FTDC file');
