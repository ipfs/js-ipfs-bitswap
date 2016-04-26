# ipfs-bitswap

[![](https://img.shields.io/badge/made%20by-Protocol%20Labs-blue.svg?style=flat-square)](http://ipn.io)
[![](https://img.shields.io/badge/project-IPFS-blue.svg?style=flat-square)](http://ipfs.io/)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](http://webchat.freenode.net/?channels=%23ipfs)
[![Coverage Status](https://coveralls.io/repos/github/ipfs/js-ipfs-bitswap/badge.svg?branch=master)](https://coveralls.io/github/ipfs/js-ipfs-bitswap?branch=master)
[![Travis CI](https://travis-ci.org/ipfs/js-ipfs-bitswap.svg?branch=master)](https://travis-ci.org/ipfs/js-ipfs-bitswap)
[![Circle CI](https://circleci.com/gh/ipfs/js-ipfs-bitswap.svg?style=svg)](https://circleci.com/gh/ipfs/js-ipfs-bitswap)
[![Dependency Status](https://david-dm.org/ipfs/js-ipfs-bitswap.svg?style=flat-square)](https://david-dm.org/ipfs/js-ipfs-bitswap) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)


> Node.js implementation of the Bitswap 'data exchange' protocol used by IPFS

# Installation

## npm

```sh
> npm i ipfs-bitswap
```

## Use in Node.js

```js
const bitswap = require('ipfs-bitswap')
```

## Use in a browser with browserify, webpack or any other bundler

The code published to npm that gets loaded on require is in fact a ES5 transpiled version with the right shims added. This means that you can require it and use with your favourite bundler without having to adjust asset management process.

```js
const bitswap = require('ipfs-bitswap')
```

## Use in a browser Using a script tag

Loading this module through a script tag will make the `Unixfs` obj available in the global namespace.

```html
<script src="https://npmcdn.com/ipfs-bitswap/dist/index.min.js"></script>
<!-- OR -->
<script src="https://npmcdn.com/ipfs-bitswap/dist/index.js"></script>
```
