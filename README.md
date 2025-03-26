## FTDC quick parser for content type detection

### TODO

- [ ] Fix `indexBeforeColon` so that we can get the field names. This is currently broken.
- [ ] Extract field names (depends on 1).
- [x] Investigate why we are parsing invalid dates.
- [x] Parse trivial BSON types which are defined in the `constants.js` file.
- [ ] Parse the `getCmdLineOpts` so that we can terminate early.
- [ ] strecth goal: parse nested BSON documents. See comments below.

If we want to extend this parser to parse nested BSON documents, we can use a stack to keep track of the current structure. This will allow us to parse flat and nested docuemnts without the need for recursion. This is more efficient for flat and sequential data and prevents a stack overflow.
