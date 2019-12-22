<a name="0.26.2"></a>
## [0.26.2](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.26.1...v0.26.2) (2019-12-22)


### Bug Fixes

* use multicodec correctly ([#209](https://github.com/ipfs/js-ipfs-bitswap/issues/209)) ([579ddb5](https://github.com/ipfs/js-ipfs-bitswap/commit/579ddb5))



<a name="0.26.1"></a>
## [0.26.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.26.0...v0.26.1) (2019-12-11)


### Bug Fixes

* reduce size ([#203](https://github.com/ipfs/js-ipfs-bitswap/issues/203)) ([9f818b4](https://github.com/ipfs/js-ipfs-bitswap/commit/9f818b4))



<a name="0.26.0"></a>
# [0.26.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.25.1...v0.26.0) (2019-09-24)


### Code Refactoring

* callbacks -> async / await ([#202](https://github.com/ipfs/js-ipfs-bitswap/issues/202)) ([accf53b](https://github.com/ipfs/js-ipfs-bitswap/commit/accf53b))


### BREAKING CHANGES

* All places in the API that used callbacks are now replaced with async/await

* feat: make `get()` a generator

* make `getMany()` AsyncIterable

* feat: make `put()` a generator

* make `putMany()` AsyncIterable

* remove check in `_findAndConnect()`

* feat: make `start()` and `stop()` async/await

* refactor: make `connectTo()` async/await

* refactor: make `findProviders()` and `findAndConnect()` async/await

* refactor: cb => async

* refactor: async/await

* chore: update travis

* refactor: update benchmark tests and allow streaming to putMany

* chore: address pr comments

* chore: remove callback hell eslint disables

* chore: wrap list of tasks in promise.all

* chore: callbackify methods inside pull stream

* chore: accept PR suggestions

* chore: fix typo



<a name="0.25.1"></a>
## [0.25.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.25.0...v0.25.1) (2019-06-26)


### Bug Fixes

* use consistent encoding for cid comparison ([c8cee6a](https://github.com/ipfs/js-ipfs-bitswap/commit/c8cee6a))


### BREAKING CHANGES

* Emitted events have different bytes

The emitted events contain the stringified version of the CID, as we
change it to the base encoding the CID has, those bytes may be different
to previous versions of this module.

Though this shouldn't have any impact on any other modules as the
events are only used internally.



<a name="0.25.0"></a>
# [0.25.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.24.1...v0.25.0) (2019-06-12)


### Bug Fixes

* base encode CIDs before logging or emitting them ([704de22](https://github.com/ipfs/js-ipfs-bitswap/commit/704de22))


### BREAKING CHANGES

* Emitted events have different bytes

The emitted events contain the stringified version of the CID, as we
change it to the base encoding the CID has, those bytes may be different
to previous versions of this module.

Though this shouldn't have any impact on any other modules as the
events are only used internally.



<a name="0.24.1"></a>
## [0.24.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.24.0...v0.24.1) (2019-05-30)


### Bug Fixes

* ignore unwanted blocks ([#194](https://github.com/ipfs/js-ipfs-bitswap/issues/194)) ([e8d722c](https://github.com/ipfs/js-ipfs-bitswap/commit/e8d722c))



<a name="0.24.0"></a>
# [0.24.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.23.0...v0.24.0) (2019-05-09)


### Chores

* update cids dependency ([0779160](https://github.com/ipfs/js-ipfs-bitswap/commit/0779160))


### BREAKING CHANGES

* v1 CIDs created by this module now default to base32 encoding when stringified

refs: https://github.com/ipfs/js-ipfs/issues/1995

License: MIT
Signed-off-by: Alan Shaw <alan.shaw@protocol.ai>



<a name="0.23.0"></a>
# [0.23.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.22.0...v0.23.0) (2019-03-16)



<a name="0.22.0"></a>
# [0.22.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.21.2...v0.22.0) (2019-01-08)


### Bug Fixes

* reduce bundle size ([d8f8040](https://github.com/ipfs/js-ipfs-bitswap/commit/d8f8040))


### BREAKING CHANGES

* change from big.js to bignumber.js

The impact of this change is only on the `snapshot` field of
the stats, as those values are represented as Big Numbers.



<a name="0.21.2"></a>
## [0.21.2](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.21.1...v0.21.2) (2019-01-08)


### Bug Fixes

* avoid sync callbacks in async code ([ddfdd71](https://github.com/ipfs/js-ipfs-bitswap/commit/ddfdd71))
* ensure callback is called ([c27318f](https://github.com/ipfs/js-ipfs-bitswap/commit/c27318f))



<a name="0.21.1"></a>
## [0.21.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.21.0...v0.21.1) (2018-12-06)


### Features

* send max providers to findProviders request ([31493dc](https://github.com/ipfs/js-ipfs-bitswap/commit/31493dc))



<a name="0.21.0"></a>
# [0.21.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.20.3...v0.21.0) (2018-10-26)


### Features

* change bitswapLedgerForPeer output format ([c68a0c8](https://github.com/ipfs/js-ipfs-bitswap/commit/c68a0c8))



<a name="0.20.3"></a>
## [0.20.3](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.20.2...v0.20.3) (2018-07-03)



<a name="0.20.2"></a>
## [0.20.2](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.20.0...v0.20.2) (2018-06-18)


### Bug Fixes

* ipfs/js-ipfs[#1292](https://github.com/ipfs/js-ipfs-bitswap/issues/1292) - Catch invalid CIDs and return the error via callback ([#170](https://github.com/ipfs/js-ipfs-bitswap/issues/170)) ([51f5ce0](https://github.com/ipfs/js-ipfs-bitswap/commit/51f5ce0))
* reset batch size counter ([739ad0d](https://github.com/ipfs/js-ipfs-bitswap/commit/739ad0d))


### Features

* add bitswap.ledgerForPeer ([871d0d2](https://github.com/ipfs/js-ipfs-bitswap/commit/871d0d2))
* add ledger.debtRatio() ([e602810](https://github.com/ipfs/js-ipfs-bitswap/commit/e602810))



<a name="0.20.1"></a>
## [0.20.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.20.0...v0.20.1) (2018-05-28)


### Bug Fixes

* ipfs/js-ipfs[#1292](https://github.com/ipfs/js-ipfs-bitswap/issues/1292) - Catch invalid CIDs and return the error via callback ([#170](https://github.com/ipfs/js-ipfs-bitswap/issues/170)) ([51f5ce0](https://github.com/ipfs/js-ipfs-bitswap/commit/51f5ce0))
* reset batch size counter ([739ad0d](https://github.com/ipfs/js-ipfs-bitswap/commit/739ad0d))



<a name="0.20.0"></a>
# [0.20.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.19.0...v0.20.0) (2018-04-10)



<a name="0.19.0"></a>
# [0.19.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.18.1...v0.19.0) (2018-02-14)


### Features

* update network calls to use dialProtocol instead ([b669aac](https://github.com/ipfs/js-ipfs-bitswap/commit/b669aac))



<a name="0.18.1"></a>
## [0.18.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.18.0...v0.18.1) (2018-02-06)


### Bug Fixes

* getMany: ensuring we set the want list ([#162](https://github.com/ipfs/js-ipfs-bitswap/issues/162)) ([8e91def](https://github.com/ipfs/js-ipfs-bitswap/commit/8e91def))


### Features

* added getMany performance tests ([#164](https://github.com/ipfs/js-ipfs-bitswap/issues/164)) ([b349085](https://github.com/ipfs/js-ipfs-bitswap/commit/b349085))
* per-peer stats ([#166](https://github.com/ipfs/js-ipfs-bitswap/issues/166)) ([ff978d0](https://github.com/ipfs/js-ipfs-bitswap/commit/ff978d0))



<a name="0.18.0"></a>
# [0.18.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.17.4...v0.18.0) (2017-12-15)


### Features

* stats improvements ([#158](https://github.com/ipfs/js-ipfs-bitswap/issues/158)) ([17e15d0](https://github.com/ipfs/js-ipfs-bitswap/commit/17e15d0))



<a name="0.17.4"></a>
## [0.17.4](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.17.3...v0.17.4) (2017-11-10)


### Features

* windows interop ([#154](https://github.com/ipfs/js-ipfs-bitswap/issues/154)) ([a8b1e07](https://github.com/ipfs/js-ipfs-bitswap/commit/a8b1e07))



<a name="0.17.3"></a>
## [0.17.3](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.17.2...v0.17.3) (2017-11-08)


### Bug Fixes

* add missing multicodec dependency ([#155](https://github.com/ipfs/js-ipfs-bitswap/issues/155)) ([751d436](https://github.com/ipfs/js-ipfs-bitswap/commit/751d436))



<a name="0.17.2"></a>
## [0.17.2](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.17.1...v0.17.2) (2017-09-07)



<a name="0.17.1"></a>
## [0.17.1](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.17.0...v0.17.1) (2017-09-07)


### Features

* replace protocol-buffers with protons ([#149](https://github.com/ipfs/js-ipfs-bitswap/issues/149)) ([ca8fa72](https://github.com/ipfs/js-ipfs-bitswap/commit/ca8fa72))



<a name="0.17.0"></a>
# [0.17.0](https://github.com/ipfs/js-ipfs-bitswap/compare/v0.16.1...v0.17.0) (2017-09-03)



