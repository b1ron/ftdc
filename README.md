## FTDC quick parser for content type detection

### TODO

- [x] Extract field names
- [ ] Refactor and port everything to client-side JavaScript. Run `npm run lint` to help catch Node.js-specific code.
- [x] Investigate why we are parsing invalid dates.
- [x] Parse trivial BSON types which are defined in the `constants.js` file.
- [x] Parse the `getCmdLineOpts` so that we can terminate early.
