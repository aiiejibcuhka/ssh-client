# SSH Client

Simple ssh client

### start

`node app.js user@host [other ssh flags]` start ssh client. Example "node app.js user@0.0.0.0 -i key.file"

### external commands

Has external commands: `get filepath`, `put filepath`. They do not work from `history` and if use autocomplete, it is limitation of current appilcation logic.