Ignore invalid dates as we are likely not reading the buffer correctly:

```console
foo@bar:~$ node mime.js grep -E '20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z'
2021-03-15T02:21:48.000Z
2021-03-15T02:21:48.000Z
2021-03-15T02:21:48.000Z
2021-03-15T02:21:48.000Z
2021-03-15T02:21:48.000Z
```

For example, here are some invalid dates which end up getting parsed:

```console
foo@bar:~$ node mime.js | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
2021-03-15T02:21:48.000Z
2388-02-18T16:04:02.688Z
2021-03-15T02:21:48.000Z
2021-03-15T02:21:48.000Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
6131-09-24T14:59:37.091Z
5852-12-28T23:49:14.883Z
5852-12-28T23:49:14.883Z
5852-12-28T23:49:14.883Z
5852-12-28T23:49:14.883Z
5852-12-28T23:49:14.883Z
6131-09-24T14:59:37.091Z
2021-03-15T02:21:48.000Z
2021-03-15T02:21:48.000Z
```

#### TODO
1. Fix `indexBeforeColon` so that we can get the field names. We are, _again_ most likely not reading the buffer correctly.
2. Extract field names (depends on 1).
3. Investigate why we are parsing invalid dates, potentially another buffer read issue.
4. Parse more BSON types which are defined in the `constants.js` file.
5. Extract the `getCmdLineOpts` field so that we can terminate early.
