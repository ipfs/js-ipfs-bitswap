# ipfs-bitswap <!-- omit in toc -->

[![ipfs.io](https://img.shields.io/badge/project-IPFS-blue.svg?style=flat-square)](http://ipfs.io)
[![IRC](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
[![Discord](https://img.shields.io/discord/806902334369824788?style=flat-square)](https://discord.gg/ipfs)
[![codecov](https://img.shields.io/codecov/c/github/ipfs/js-ipfs-bitswap.svg?style=flat-square)](https://codecov.io/gh/ipfs/js-ipfs-bitswap)
[![CI](https://img.shields.io/github/workflow/status/libp2p/js-libp2p-interfaces/test%20&%20maybe%20release/master?style=flat-square)](https://github.com/ipfs/js-ipfs-bitswap/actions/workflows/js-test-and-release.yml)

> JavaScript implementation of the Bitswap data exchange protocol used by IPFS

## Table of contents <!-- omit in toc -->

- [Install](#install)
  - [Use in Node.js or in the browser with browserify, webpack or any other bundler](#use-in-nodejs-or-in-the-browser-with-browserify-webpack-or-any-other-bundler)
  - [Use in a browser using a script tag](#use-in-a-browser-using-a-script-tag)
- [API](#api)
  - [Stats](#stats)
    - [Peer accessor:](#peer-accessor)
    - [Global snapshot accessor:](#global-snapshot-accessor)
    - [Moving average accessor:](#moving-average-accessor)
- [Development](#development)
  - [Structure](#structure)
- [Performance tests](#performance-tests)
  - [Profiling](#profiling)
- [License](#license)
- [Contribute](#contribute)

## Install

```console
$ npm i ipfs-bitswap
```

```bash
> npm install ipfs-bitswap
```

### Use in Node.js or in the browser with browserify, webpack or any other bundler

```js
const { createBitswap } from 'ipfs-bitswap'
```

### Use in a browser using a script tag

Loading this module through a script tag will make the `IpfsBitswap` object available in the global namespace.

```html
<script src="https://unpkg.com/ipfs-bitswap/dist/index.min.js"></script>
<!-- OR -->
<script src="https://unpkg.com/ipfs-bitswap/dist/index.js"></script>
```

## API

See <https://ipfs.github.io/js-ipfs-bitswap>

### Stats

```js
const bitswapNode = // ...

const stats = bitswapNode.stat()
```

Stats contains a snapshot accessor, a moving average acessor and a peer accessor.

Besides that, it emits "update" events every time it is updated.

```js
stats.on('update', (stats) => {
  console.log('latest stats snapshot: %j', stats)
})
```

#### Peer accessor:

You can get the stats for a specific peer by doing:

```js
const peerStats = stats.forPeer(peerId)
```

The returned object behaves like the root stats accessor (has a snapshot, a moving average accessors and is an event emitter).

#### Global snapshot accessor:

```js
const snapshot = stats.snapshot
console.log('stats: %j', snapshot)
```

the snapshot will contain the following keys, with the values being [bignumber.js](https://github.com/MikeMcl/bignumber.js#readme) instances:

```js
// stats: {
//   "dataReceived":"96",
//   "blocksReceived":"2",
//   "dataReceived":"96",
//   "dupBlksReceived":"0",
//   "dupDataReceived":"0",
//   "blocksSent":"0",
//   "dataSent":"0",
//   "providesBufferLength":"0",
//   "wantListLength":"0",
//   "peerCount":"1"
// }
```

#### Moving average accessor:

```js
const movingAverages = stats.movingAverages
```

This object contains these properties:

- 'blocksReceived',
- 'dataReceived',
- 'dupBlksReceived',
- 'dupDataReceived',
- 'blocksSent',
- 'dataSent',
- 'providesBufferLength',
- 'wantListLength',
- 'peerCount'

```js
const dataReceivedMovingAverages = movingAverages.dataReceived
```

Each one of these will contain one key per interval (miliseconds), being the default intervals defined:

- 60000 (1 minute)
- 300000 (5 minutes)
- 900000 (15 minutes)

You can then select one of them

```js
const oneMinuteDataReceivedMovingAverages = dataReceivedMovingAverages[60000]
```

This object will be a [movingAverage](https://github.com/pgte/moving-average#readme) instance.

## Development

### Structure

![](/img/architecture.png)

```sh
» tree src
src
├── constants.js
├── decision-engine
│   ├── index.js
│   └── ledger.js
├── index.js
├── network.js             # Handles peerSet and open new conns
├── notifications.js       # Handles tracking of incomning blocks and wants/unwants.
├─── want-manager          # Keeps track of all blocks the peer (self) wants
│   ├── index.js
│   └── msg-queue.js       # Messages to send queue, one per peer
└─── types
    ├── message            # (Type) message that is put in the wire
    │   ├── entry.js
    │   ├── index.js
    │   └── message.proto.js
    └── wantlist           # (Type) track wanted blocks
        ├── entry.js
        └── index.js
```

## Performance tests

You can run performance tests like this:

    $ npm run benchmarks

### Profiling

You can run each of the individual performance tests with a profiler like 0x.

To do that, you need to install 0x:

```bash
$ npm install 0x --global
```

And then run the test:

```bash
$ 0x test/benchmarks/get-many
```

This will output a flame graph and print the location for it.
Use the browser Chrome to open and inspect the generated graph.

![Flame graph](https://ipfs.io/ipfs/QmVbyLgYfkLewNtzTAFwAEMmP2hTJgs8sSqsRTBNBjyQ1y)

## License

Licensed under either of

- Apache 2.0, ([LICENSE-APACHE](LICENSE-APACHE) / <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT ([LICENSE-MIT](LICENSE-MIT) / <http://opensource.org/licenses/MIT>)

## Contribute

Feel free to join in. All welcome. Open an [issue](https://github.com/ipfs/js-ipfs-unixfs-importer/issues)!

This repository falls under the IPFS [Code of Conduct](https://github.com/ipfs/community/blob/master/code-of-conduct.md).

[![](https://cdn.rawgit.com/jbenet/contribute-ipfs-gif/master/img/contribute.gif)](https://github.com/ipfs/community/blob/master/CONTRIBUTING.md)
