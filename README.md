## FTDC quick parser for content type detection

### TODO

- [ ] Fix `indexBeforeColon` so that we can get the field names. This is currently broken.
- [ ] Extract field names (depends on 1).
- [ ] Refactor and port everything to client-side JavaScript. Run `npm run lint` to help catch Node.js-specific code.
- [x] Investigate why we are parsing invalid dates.
- [x] Parse trivial BSON types which are defined in the `constants.js` file.
- [ ] Parse the `getCmdLineOpts` so that we can terminate early.
- [ ] strecth goal: parse nested BSON documents. See section below.

#### Parsing nested BSON documents

#### NOTE:

This is only needed if we want to reserialize to JSON etc.

If we want to extend this parser to parse nested BSON documents, we can use a stack to keep track of the current object. This will allow us to parse flat and nested documents without the need for recursion. This is more efficient for flat and sequential data and prevents a stack overflow. We should enforce a BSON depth nesting limit, but make it smaller than the default limit of 200 because this depth seems excessive for our use case.

https://github.com/mongodb/mongo/blob/0a68308f0d39a928ed551f285ba72ca560c38576/src/mongo/bson/bson_depth.h#L40
```cpp
// The default BSON depth nesting limit.
static constexpr std::int32_t kDefaultMaxAllowableDepth = 200;
```

```js
// Example of a nested BSON document, an array of objects.
[{a: 1}, {b: 1}, {c: 1}]
```
