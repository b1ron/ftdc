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

	// stack for nested documents
	const stack = [];
	const stackTypes = { Object: true, Array: true };
	stack.push({
		level: 0,
		type: 'root', // root document should be handled differently
		buffer: buffer,
		document: {},
	});

	const document = {};

	let item = stack[stack.length - 1];
	while (stack.length > 0 || index < buffer.length) {
		if (stackTypes[stack[stack.length - 1].type] === true) {
			item = stack.pop();
			console.log('stack type detected', item.type); // pop a stack item
		}

		const elementType = item.buffer[index++];

		if (elementType === 0) {
			continue;
		}

		const keyName = item.buffer.toString(
			'utf-8',
			index,
			indexAfterCString(item.buffer, index) - 1
		);

		item.document[keyName] = null;

		index = indexAfterCString(item.buffer, index);

		switch (elementType) {
			case BSON.DATA_NUMBER:
				console.log('Number');
				const number = buffer.readDoubleLE(index);
				item.document[keyName] = number;
				console.log(item.document);
				index += 8;
				break;
			case BSON.DATA_STRING:
				console.log('String');
				const length = buffer.readUInt32LE(index);
				const string = buffer.toString(
					'utf8',
					index + 4 + index + 4 + length - 1
				); // -1 to remove null terminator
				item.document[keyName] = string;
				console.log(item.document);
				index += 4 + length;
				break;
			case BSON.DATA_OBJECT:
				console.log('Object');
				const size = item.buffer.readUInt32LE(index);
				item.document[keyName] = {};

				console.log(item.document);

				stack.push({
					level: 1,
					type: 'Object',
					buffer: item.buffer.subarray(index, index + size),
					document: item.document[keyName],
				});
				break;
			case BSON.DATA_ARRAY:
				console.log('Array');
				break;
			case BSON.DATA_BINARY:
				console.log('Binary');
				break;
			case BSON.DATA_UNDEFINED:
				console.log('Undefined');
				break;
			case BSON.DATA_OBJECTID:
				console.log('ObjectId');
				break;
			case BSON.DATA_BOOLEAN:
				console.log('Boolean');
				const bool = buffer[index];
				item.document[keyName] = bool === 0 ? false : true;
				console.log(item.document);
				index += 1;
				break;
			case BSON.DATA_DATE:
				console.log('Date');
				const data = item.buffer.subarray(index, index + 8);
				const bigInt = data.readBigInt64LE(0);
				const date = new Date(Number(bigInt));
				item.document[keyName] = date;
				console.log(item.document);
				index += 8;
				break;
			case BSON.DATA_NULL:
				console.log('Null');
				break;
			case BSON.DATA_REGEXP:
				console.log('RegExp');
				break;
			case BSON.DATA_DBPOINTER:
				console.log('DBPointer');
				break;
			case BSON.DATA_CODE:
				console.log('Code');
				break;
			case BSON.DATA_SYMBOL:
				console.log('Symbol');
				break;
			case BSON.DATA_CODE_W_SCOPE:
				console.log('Code with scope');
				break;
			case BSON.DATA_INT32:
				console.log('Int32');
				const int32 = buffer.readInt32LE(index);
				item.document[keyName] = int32;
				console.log(item.document);
				index += 4;
				break;
			case BSON.DATA_TIMESTAMP:
				console.log('Timestamp');
				break;
			case BSON.DATA_LONG:
				console.log('Long');
				const long = buffer.readBigInt64LE(index);
				item.document[keyName] = long;
				console.log(item.document);
				index += 8;
				break;
			case BSON.DATA_DECIMAL128:
				console.log('Decimal128');
				break;
			case BSON.DATA_MIN_KEY:
				console.log('MinKey');
				break;
			case BSON.DATA_MAX_KEY:
				console.log('MaxKey');
				break;
			default:
				console.log('Unknown');
				break;
		}
	}

	return true;
}

readFTDCFile('files/metrics.2021-03-15T02-21-47Z-00000');
