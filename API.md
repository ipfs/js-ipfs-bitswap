# API

## Public Methods

### `constructor(id, libp2p, datastore)`

- `id: PeerId`, the id of the local instance.
- `libp2p: Libp2p`, instance of the local network stack.
- `blockstore: Datastore`, instance of the local database (`IpfsRepo.blockstore`)

Create a new instance.


### `getStream(key)`

- `key: Multihash|Array`

Returns a source `pull-stream`. Values emitted are the received blocks.

Example:

```js
// Single block
pull(
  bitswap.getStream(key),
  pull.collect((err, blocks) => {
    // blocks === [block]
  })
)

// Many blocks
pull(
  bitswap.getStream([key1, key2, key3]),
  pull.collect((err, blocks) => {
    // blocks === [block1, block2, block3]
  })
)
```


> Note: This is safe guarded so that the network is not asked
> for blocks that are in the local `datastore`.


### `unwant(keys)`

- `keys: Mutlihash|[]Multihash`

Cancel previously requested keys, forcefully. That means they are removed from the
wantlist independent of how many other resources requested these keys. Callbacks
attached to `getBlock` are errored with `Error('manual unwant: key')`.

### `cancelWants(keys)`

- `keys: Multihash|[]Multihash`

Cancel previously requested keys.

### `putStream()`

Returns a duplex `pull-stream` that emits an object `{key: Multihash}` for every written block when it was stored.

### `put(block, cb)`

- `block: IpfsBlock`
- `cb: Function`

Announce that the current node now has the `block`. This will store it
in the local database and attempt to serve it to all peers that are known
 to have requested it. The callback is called when we are sure that the block
 is stored.

### `wantlistForPeer(peerId)`

- `peerId: PeerId`

Get the wantlist for a given peer.

### `stat()`

Get stats about about the current state of the bitswap instance.
