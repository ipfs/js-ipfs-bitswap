import { WantManager } from './want-manager/index.js'
import { Network } from './network.js'
import { DecisionEngine } from './decision-engine/index.js'
import { Notifications } from './notifications.js'
import { logger } from './utils/index.js'
import { Stats } from './stats/index.js'
import { anySignal } from 'any-signal'
import { BaseBlockstore } from 'blockstore-core/base'
import { CID } from 'multiformats/cid'
import type { BitswapOptions, IPFSBitswap, MultihashHasherLoader } from './index.js'
import type { Libp2p } from '@libp2p/interface-libp2p'
import type { Blockstore, Options, Pair } from 'interface-blockstore'
import type { Logger } from '@libp2p/logger'
import type { PeerId } from '@libp2p/interface-peer-id'
import type { BitswapMessage } from './message/index.js'
import type { AbortOptions } from '@multiformats/multiaddr'

const hashLoader: MultihashHasherLoader = {
  async getHasher () {
    throw new Error('Not implemented')
  }
}

const defaultOptions: Required<BitswapOptions> = {
  maxInboundStreams: 32,
  maxOutboundStreams: 128,
  incomingStreamTimeout: 30000,
  hashLoader,
  statsEnabled: false,
  statsComputeThrottleTimeout: 1000,
  statsComputeThrottleMaxQueueSize: 1000
}
const statsKeys = [
  'blocksReceived',
  'dataReceived',
  'dupBlksReceived',
  'dupDataReceived',
  'blocksSent',
  'dataSent',
  'providesBufferLength',
  'wantListLength',
  'peerCount'
]

/**
 * JavaScript implementation of the Bitswap 'data exchange' protocol
 * used by IPFS.
 */
export class Bitswap extends BaseBlockstore implements IPFSBitswap {
  private _libp2p: Libp2p
  private _log: Logger
  private _options: Required<BitswapOptions>
  private _stats: Stats
  public network: Network
  public blockstore: Blockstore
  public engine: DecisionEngine
  public wm: WantManager
  public notifications: Notifications
  public started: boolean

  constructor (libp2p: Libp2p, blockstore: Blockstore, options: BitswapOptions = {}) {
    super()

    this._libp2p = libp2p
    this._log = logger(this.peerId)

    this._options = Object.assign({}, defaultOptions, options)

    // stats
    this._stats = new Stats(libp2p, statsKeys, {
      enabled: this._options.statsEnabled,
      computeThrottleTimeout: this._options.statsComputeThrottleTimeout,
      computeThrottleMaxQueueSize: this._options.statsComputeThrottleMaxQueueSize
    })

    // the network delivers messages
    this.network = new Network(libp2p, this, this._stats, {
      hashLoader: options.hashLoader,
      maxInboundStreams: options.maxInboundStreams,
      maxOutboundStreams: options.maxOutboundStreams,
      incomingStreamTimeout: options.incomingStreamTimeout
    })

    // local database
    this.blockstore = blockstore

    this.engine = new DecisionEngine(this.peerId, blockstore, this.network, this._stats, libp2p)

    // handle message sending
    this.wm = new WantManager(this.peerId, this.network, this._stats, libp2p)
    this.notifications = new Notifications(this.peerId)
    this.started = false
  }

  isStarted () {
    return this.started
  }

  get peerId () {
    return this._libp2p.peerId
  }

  /**
   * handle messages received through the network
   */
  async _receiveMessage (peerId: PeerId, incoming: BitswapMessage) {
    try {
      // Note: this allows the engine to respond to any wants in the message.
      // Processing of the blocks in the message happens below, after the
      // blocks have been added to the blockstore.
      await this.engine.messageReceived(peerId, incoming)
    } catch (err) {
      // Log instead of throwing an error so as to process as much as
      // possible of the message. Currently `messageReceived` does not
      // throw any errors, but this could change in the future.
      this._log('failed to receive message', incoming)
    }

    if (incoming.blocks.size === 0) {
      return
    }

    /** @type { { cid: CID, wasWanted: boolean, data: Uint8Array }[] } */
    const received = []

    for (const [cidStr, data] of incoming.blocks.entries()) {
      const cid = CID.parse(cidStr)

      received.push({
        wasWanted: this.wm.wantlist.contains(cid),
        cid,
        data
      })
    }

    // quickly send out cancels, reduces chances of duplicate block receives
    this.wm.cancelWants(
      received
        .filter(({ wasWanted }) => wasWanted)
        .map(({ cid }) => cid)
    )

    await Promise.all(
      received.map(
        ({ cid, wasWanted, data }) => this._handleReceivedBlock(peerId, cid, data, wasWanted)
      )
    )
  }

  async _handleReceivedBlock (peerId: PeerId, cid: CID, data: Uint8Array, wasWanted: boolean) {
    this._log('received block')

    const has = await this.blockstore.has(cid)

    this._updateReceiveCounters(peerId.toString(), cid, data, has)

    if (!wasWanted) {
      return
    }

    await this.put(cid, data)
  }

  _updateReceiveCounters (peerIdStr: string, cid: CID, data: Uint8Array, exists: boolean) {
    this._stats.push(peerIdStr, 'blocksReceived', 1)
    this._stats.push(peerIdStr, 'dataReceived', data.length)

    if (exists) {
      this._stats.push(peerIdStr, 'dupBlksReceived', 1)
      this._stats.push(peerIdStr, 'dupDataReceived', data.length)
    }
  }

  /**
   * handle errors on the receiving channel
   */
  _receiveError (err: Error) {
    this._log.error('ReceiveError', err)
  }

  /**
   * handle new peers
   */
  _onPeerConnected (peerId: PeerId) {
    this.wm.connected(peerId)
  }

  /**
   * handle peers being disconnected
   */
  _onPeerDisconnected (peerId: PeerId) {
    this.wm.disconnected(peerId)
    this.engine.peerDisconnected(peerId)
    this._stats.disconnected(peerId)
  }

  enableStats () {
    this._stats.enable()
  }

  disableStats () {
    this._stats.disable()
  }

  /**
   * Return the current wantlist for a given `peerId`
   */
  wantlistForPeer (peerId: PeerId, _options?: any) {
    return this.engine.wantlistForPeer(peerId)
  }

  /**
   * Return ledger information for a given `peerId`
   */
  ledgerForPeer (peerId: PeerId) {
    return this.engine.ledgerForPeer(peerId)
  }

  /**
   * Fetch a given block by cid. If the block is in the local
   * blockstore it is returned, otherwise the block is added to the wantlist and returned once another node sends it to us.
   */
  async get (cid: CID, options: AbortOptions = {}) {
    const fetchFromNetwork = (cid: CID, options: AbortOptions) => {
      // add it to the want list - n.b. later we will abort the AbortSignal
      // so no need to remove the blocks from the wantlist after we have it
      this.wm.wantBlocks([cid], options)

      return this.notifications.wantBlock(cid, options)
    }

    let promptedNetwork = false

    const loadOrFetchFromNetwork = async (cid: CID, options: AbortOptions) => {
      try {
        // have to await here as we want to handle ERR_NOT_FOUND
        const block = await this.blockstore.get(cid, options)

        return block
      } catch (err: any) {
        if (err.code !== 'ERR_NOT_FOUND') {
          throw err
        }

        if (!promptedNetwork) {
          promptedNetwork = true

          this.network.findAndConnect(cid, options)
            .catch((err) => this._log.error(err))
        }

        // we don't have the block locally so fetch it from the network
        return fetchFromNetwork(cid, options)
      }
    }

    // depending on implementation it's possible for blocks to come in while
    // we do the async operations to get them from the blockstore leading to
    // a race condition, so register for incoming block notifications as well
    // as trying to get it from the datastore
    const controller = new AbortController()
    const signal = options.signal
      ? anySignal([options.signal, controller.signal])
      : controller.signal

    try {
      const block = await Promise.race([
        this.notifications.wantBlock(cid, {
          signal
        }),
        loadOrFetchFromNetwork(cid, {
          signal
        })
      ])

      return block
    } finally {
      // since we have the block we can now remove our listener
      controller.abort()
    }
  }

  /**
   * Fetch a a list of blocks by cid. If the blocks are in the local
   * blockstore they are returned, otherwise the blocks are added to the wantlist and returned once another node sends them to us.
   */
  async * getMany (cids: AsyncIterable<CID>|Iterable<CID>, options: AbortOptions = {}) {
    for await (const cid of cids) {
      yield this.get(cid, options)
    }
  }

  /**
   * Removes the given CIDs from the wantlist independent of any ref counts.
   *
   * This will cause all outstanding promises for a given block to reject.
   *
   * If you want to cancel the want for a block without doing that, pass an
   * AbortSignal in to `.get` or `.getMany` and abort it.
   */
  unwant (cids: CID[]|CID) {
    const cidsArray = Array.isArray(cids) ? cids : [cids]

    this.wm.unwantBlocks(cidsArray)
    cidsArray.forEach((cid) => this.notifications.unwantBlock(cid))
  }

  /**
   * Removes the given keys from the want list. This may cause pending promises
   * for blocks to never resolve.  If you wish these promises to abort instead
   * call `unwant(cids)` instead.
   */
  cancelWants (cids: CID[]|CID) {
    this.wm.cancelWants(Array.isArray(cids) ? cids : [cids])
  }

  /**
   * Put the given block to the underlying blockstore and
   * send it to nodes that have it in their wantlist.
   */
  async put (cid: CID, block: Uint8Array, _options?: any) {
    await this.blockstore.put(cid, block)
    this._sendHaveBlockNotifications(cid, block)
  }

  /**
   * Put the given blocks to the underlying blockstore and
   * send it to nodes that have it them their wantlist.
   */
  async * putMany (source: Iterable<Pair> | AsyncIterable<Pair>, options?: Options) {
    for await (const { key, value } of this.blockstore.putMany(source, options)) {
      this._sendHaveBlockNotifications(key, value)

      yield { key, value }
    }
  }

  /**
   * Sends notifications about the arrival of a block
   */
  _sendHaveBlockNotifications (cid: CID, data: Uint8Array) {
    this.notifications.hasBlock(cid, data)
    this.engine.receivedBlocks([{ cid, data }])
    // Note: Don't wait for provide to finish before returning
    this.network.provide(cid).catch((err) => {
      this._log.error('Failed to provide: %s', err.message)
    })
  }

  /**
   * Get the current list of wants
   */
  getWantlist () {
    return this.wm.wantlist.entries()
  }

  /**
   * Get the current list of partners
   */
  peers () {
    return this.engine.peers()
  }

  /**
   * Get stats about the bitswap node
   */
  stat () {
    return this._stats
  }

  /**
   * Start the bitswap node
   */
  async start () {
    this.wm.start()
    await this.network.start()
    this.engine.start()
    this.started = true
  }

  /**
   * Stop the bitswap node
   */
  async stop () {
    this._stats.stop()
    this.wm.stop()
    await this.network.stop()
    this.engine.stop()
    this.started = false
  }

  unwrap () {
    return this.blockstore
  }

  has (cid: CID): Promise<boolean> {
    return this.blockstore.has(cid)
  }
}
