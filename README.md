# ipfs-bitswap

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://ipn.io)
[![](https://img.shields.io/badge/project-IPFS-blue.svg?style=flat-square)](http://ipfs.io/)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![Coverage Status](https://coveralls.io/repos/github/ipfs/js-ipfs-bitswap/badge.svg?branch=master)](https://coveralls.io/github/ipfs/js-ipfs-bitswap?branch=master)
[![Travis CI](https://travis-ci.org/ipfs/js-ipfs-bitswap.svg?branch=master)](https://travis-ci.org/ipfs/js-ipfs-bitswap)
[![Circle CI](https://circleci.com/gh/ipfs/js-ipfs-bitswap.svg?style=svg)](https://circleci.com/gh/ipfs/js-ipfs-bitswap)
[![Dependency Status](https://david-dm.org/ipfs/js-ipfs-bitswap.svg?style=flat-square)](https://david-dm.org/ipfs/js-ipfs-bitswap) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)
![](https://img.shields.io/badge/npm-%3E%3D3.0.0-orange.svg?style=flat-square)
![](https://img.shields.io/badge/Node.js-%3E%3D4.0.0-orange.svg?style=flat-square)

[![Sauce Test Status](https://saucelabs.com/browser-matrix/js-ipfs-bitswap.svg)](https://saucelabs.com/u/js-ipfs-bitswap)

> Node.js implementation of the Bitswap 'data exchange' protocol used by IPFS

## Table of Contents

- [Install](#install)
  - [npm](#npm)
  - [Use in Node.js](#use-in-nodejs)
  - [Use in a browser with browserify, webpack or any other bundler](#use-in-a-browser-with-browserify-webpack-or-any-other-bundler)
  - [Use in a browser using a script tag](#use-in-a-browser-using-a-script-tag)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Install

### npm

```sh
> npm install ipfs-bitswap --save
```

### Use in Node.js

```js
const Bitswap = require('ipfs-bitswap')
```

### Use in a browser with browserify, webpack or any other bundler

The code published to npm that gets loaded on require is in fact a ES5 transpiled version with the right shims added. This means that you can require it and use with your favourite bundler without having to adjust asset management process.

```js
const Bitswap = require('ipfs-bitswap')
```

### Use in a browser using a script tag

Loading this module through a script tag will make the `IpfsBitswap` object available in the global namespace.

```html
<script src="https://unpkg.com/ipfs-bitswap/dist/index.min.js"></script>
<!-- OR -->
<script src="https://unpkg.com/ipfs-bitswap/dist/index.js"></script>
```

## Usage

For the documentation see [API.md](API.md).

### API

#### `new Bitswap(libp2p, blockstore)`

- `libp2p: Libp2p`, instance of the local network stack.
- `blockstore: Blockstore`, instance of the local database (`IpfsRepo.blockstore`)

Create a new instance.

#### `getStream(cid)`

- `cid: CID|Array`

Returns a source `pull-stream`. Values emitted are the received blocks.

Example:

```js
// Single block
pull(
  bitswap.getStream(cid),
  pull.collect((err, blocks) => {
    // blocks === [block]
  })
)

// Many blocks
pull(
  bitswap.getStream([cid1, cid2, cid3]),
  pull.collect((err, blocks) => {
    // blocks === [block1, block2, block3]
  })
)
```

> Note: This is safe guarded so that the network is not asked
> for blocks that are in the local `datastore`.

#### `unwant(cids)`

- `cids: CID|[]CID`

Cancel previously requested cids, forcefully. That means they are removed from the
wantlist independent of how many other resources requested these cids. Callbacks
attached to `getBlock` are errored with `Error('manual unwant: cid)`.

#### `cancelWants(cids)`

- `cid: CID|[]CID`

Cancel previously requested cids.

#### `putStream()`

Returns a duplex `pull-stream` that emits an object `{cid: CID}` for every written block when it was stored.
Objects passed into here should be of the form `{data: Buffer, cid: CID}`

#### `put(blockAndCid, callback)`

- `blockAndCid: {data: Buffer, cid: CID}`
- `callback: Function`

Announce that the current node now has the block containing `data`. This will store it
in the local database and attempt to serve it to all peers that are known
 to have requested it. The callback is called when we are sure that the block
 is stored.

#### `wantlistForPeer(peerId)`

- `peerId: PeerId`

Get the wantlist for a given peer.

#### `stat()`

Get stats about about the current state of the bitswap instance.

## Development

### Structure

![](/img/architecture.png)

```sh
» tree src
src
├── components
│   ├── decision
│   │   ├── engine.js
│   │   ├── index.js
│   │   └── ledger.js
│   ├── network             # Handles peerSet and open new conns
│   │   └── index.js
│   └── want-manager        # Keeps track of all blocks the peer wants (not the others which it is connected)
│       ├── index.js
│       └── msg-queue.js    # Messages to send queue, one per peer
├── constants.js
├── index.js
└── types
    ├── message             # (Type) message that is put in the wire
    │   ├── entry.js
    │   ├── index.js
    │   └── message.proto.js
    └── wantlist            # (Type) track wanted blocks
        ├── entry.js
        └── index.js
```

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/ipfs/js-ipfs-bitswap/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/contributing.md)

## License

[MIT](LICENSE)
