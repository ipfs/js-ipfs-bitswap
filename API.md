# API

## Public Methods

### `constructor(id, libp2p, datastore)`

- `id: PeerId`, the id of the local instance.
- `libp2p: Libp2p`, instance of the local network stack.
- `datastore: Datastore`, instance of the local database (`IpfsRepo.datastore`)

Create a new instance.

### `getBlock(key, cb)`

- `key: Multihash`
- `cb: Function`

Fetch a single block.

> Note: This is safe guarded so that the network is not asked
> for blocks that are in the local `datastore`.

### `getBlocks(keys, cb)`

- `keys: []Multihash`
- `cb: Function`

Fetch multiple blocks.

### `cancelWants(keys)`

- `keys: []Multihash`

Cancel previously requested keys.


### `hasBlock(block, cb)`

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
