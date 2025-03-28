## FTDC quick parser for content type detection

### TODO

- [x] Extract field names
- [ ] Refactor and port everything to client-side JavaScript. Run `npm run lint` to help catch Node.js-specific code.
- [x] Investigate why we are parsing invalid dates.
- [x] Parse trivial BSON types which are defined in the `constants.js` file.
- [ ] Parse nested BSON documents at 2 levels of nesting. See section below.
- [ ] Parse the `getCmdLineOpts` so that we can terminate early (depends on 1).

#### Parsing nested BSON documents

If we want to extend this parser to parse nested BSON documents, we can use a stack to keep track of the current object.
This will allow us to parse flat and nested documents without the need for recursion.
This is more efficient for flat and sequential data and prevents a stack overflow.
We should enforce a BSON depth nesting limit, but make it smaller than the default limit of 200 because this depth seems excessive for our use case.

https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/bson/bson_depth.h#L40
```cpp
// The default BSON depth nesting limit.
static constexpr std::int32_t kDefaultMaxAllowableDepth = 200;
```

```js
> let buffer = fs.readFileSync('files/metrics.2021-03-15T02-21-47Z-00000');

> let a = BSON.deserialize(buffer.subarray(0, 12261))

> a
{
  _id: 2021-03-15T02:21:48.000Z,
  type: 0,
  doc: {
    start: 2021-03-15T02:21:48.000Z,
    buildInfo: {
      start: 2021-03-15T02:21:48.000Z,
      version: '4.2.12',
      gitVersion: '5593fd8e33b60c75802edab304e23998fa0ce8a5',
      modules: [],
      allocator: 'tcmalloc',
      javascriptEngine: 'mozjs',
      sysInfo: 'deprecated',
      versionArray: [Array],
      openssl: [Object],
      buildEnvironment: [Object],
      bits: 64,
      debug: false,
      maxBsonObjectSize: 16777216,
      storageEngines: [Array],
      ok: 1,
      end: 2021-03-15T02:21:48.000Z
    },
    getCmdLineOpts: {
      start: 2021-03-15T02:21:48.000Z,
      argv: [Array],
      parsed: [Object],
      ok: 1,
      end: 2021-03-15T02:21:48.000Z
    },
    hostInfo: {
      start: 2021-03-15T02:21:48.000Z,
      system: [Object],
      os: [Object],
      extra: [Object],
      ok: 1,
      end: 2021-03-15T02:21:48.000Z
    },
    end: 2021-03-15T02:21:48.000Z
  }
}
```
