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

> JavaScript implementation of the Bitswap 'data exchange' protocol used by IPFS

## Table of Contents

- [Install](#install)
  - [npm](#npm)
  - [Use in Node.js](#use-in-nodejs)
  - [Use in a browser with browserify, webpack or any other bundler](#use-in-a-browser-with-browserify-webpack-or-any-other-bundler)
  - [Use in a browser using a script tag](#use-in-a-browser-using-a-script-tag)
- [Usage](#usage)
- [API](#api)
- [Contribute](#contribute)
- [License](#license)

## Install

### npm

```bash
> npm install ipfs-bitswap
```

### Use in Node.js

```js
const Bitswap = require('ipfs-bitswap')
```

### Use in a browser with browserify, webpack or any other bundler

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

See https://ipfs.github.io/js-ipfs-bitswap

## API

See https://ipfs.github.io/js-ipfs-bitswap

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
