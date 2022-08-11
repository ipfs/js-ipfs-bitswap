/*eslint-disable*/
import $protobuf from "protobufjs/minimal.js";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["ipfs-bitswap"] || ($protobuf.roots["ipfs-bitswap"] = {});

export const Message = $root.Message = (() => {

    /**
     * Properties of a Message.
     * @exports IMessage
     * @interface IMessage
     * @property {Message.IWantlist|null} [wantlist] Message wantlist
     * @property {Array.<Uint8Array>|null} [blocks] Message blocks
     * @property {Array.<Message.IBlock>|null} [payload] Message payload
     * @property {Array.<Message.IBlockPresence>|null} [blockPresences] Message blockPresences
     * @property {number|null} [pendingBytes] Message pendingBytes
     */

    /**
     * Constructs a new Message.
     * @exports Message
     * @classdesc Represents a Message.
     * @implements IMessage
     * @constructor
     * @param {IMessage=} [p] Properties to set
     */
    function Message(p) {
        this.blocks = [];
        this.payload = [];
        this.blockPresences = [];
        if (p)
            for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                if (p[ks[i]] != null)
                    this[ks[i]] = p[ks[i]];
    }

    /**
     * Message wantlist.
     * @member {Message.IWantlist|null|undefined} wantlist
     * @memberof Message
     * @instance
     */
    Message.prototype.wantlist = null;

    /**
     * Message blocks.
     * @member {Array.<Uint8Array>} blocks
     * @memberof Message
     * @instance
     */
    Message.prototype.blocks = $util.emptyArray;

    /**
     * Message payload.
     * @member {Array.<Message.IBlock>} payload
     * @memberof Message
     * @instance
     */
    Message.prototype.payload = $util.emptyArray;

    /**
     * Message blockPresences.
     * @member {Array.<Message.IBlockPresence>} blockPresences
     * @memberof Message
     * @instance
     */
    Message.prototype.blockPresences = $util.emptyArray;

    /**
     * Message pendingBytes.
     * @member {number} pendingBytes
     * @memberof Message
     * @instance
     */
    Message.prototype.pendingBytes = 0;

    /**
     * Encodes the specified Message message. Does not implicitly {@link Message.verify|verify} messages.
     * @function encode
     * @memberof Message
     * @static
     * @param {IMessage} m Message message or plain object to encode
     * @param {$protobuf.Writer} [w] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    Message.encode = function encode(m, w) {
        if (!w)
            w = $Writer.create();
        if (m.wantlist != null && Object.hasOwnProperty.call(m, "wantlist"))
            $root.Message.Wantlist.encode(m.wantlist, w.uint32(10).fork()).ldelim();
        if (m.blocks != null && m.blocks.length) {
            for (var i = 0; i < m.blocks.length; ++i)
                w.uint32(18).bytes(m.blocks[i]);
        }
        if (m.payload != null && m.payload.length) {
            for (var i = 0; i < m.payload.length; ++i)
                $root.Message.Block.encode(m.payload[i], w.uint32(26).fork()).ldelim();
        }
        if (m.blockPresences != null && m.blockPresences.length) {
            for (var i = 0; i < m.blockPresences.length; ++i)
                $root.Message.BlockPresence.encode(m.blockPresences[i], w.uint32(34).fork()).ldelim();
        }
        if (m.pendingBytes != null && Object.hasOwnProperty.call(m, "pendingBytes"))
            w.uint32(40).int32(m.pendingBytes);
        return w;
    };

    /**
     * Decodes a Message message from the specified reader or buffer.
     * @function decode
     * @memberof Message
     * @static
     * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
     * @param {number} [l] Message length if known beforehand
     * @returns {Message} Message
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    Message.decode = function decode(r, l) {
        if (!(r instanceof $Reader))
            r = $Reader.create(r);
        var c = l === undefined ? r.len : r.pos + l, m = new $root.Message();
        while (r.pos < c) {
            var t = r.uint32();
            switch (t >>> 3) {
            case 1: {
                    m.wantlist = $root.Message.Wantlist.decode(r, r.uint32());
                    break;
                }
            case 2: {
                    if (!(m.blocks && m.blocks.length))
                        m.blocks = [];
                    m.blocks.push(r.bytes());
                    break;
                }
            case 3: {
                    if (!(m.payload && m.payload.length))
                        m.payload = [];
                    m.payload.push($root.Message.Block.decode(r, r.uint32()));
                    break;
                }
            case 4: {
                    if (!(m.blockPresences && m.blockPresences.length))
                        m.blockPresences = [];
                    m.blockPresences.push($root.Message.BlockPresence.decode(r, r.uint32()));
                    break;
                }
            case 5: {
                    m.pendingBytes = r.int32();
                    break;
                }
            default:
                r.skipType(t & 7);
                break;
            }
        }
        return m;
    };

    /**
     * Creates a Message message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof Message
     * @static
     * @param {Object.<string,*>} d Plain object
     * @returns {Message} Message
     */
    Message.fromObject = function fromObject(d) {
        if (d instanceof $root.Message)
            return d;
        var m = new $root.Message();
        if (d.wantlist != null) {
            if (typeof d.wantlist !== "object")
                throw TypeError(".Message.wantlist: object expected");
            m.wantlist = $root.Message.Wantlist.fromObject(d.wantlist);
        }
        if (d.blocks) {
            if (!Array.isArray(d.blocks))
                throw TypeError(".Message.blocks: array expected");
            m.blocks = [];
            for (var i = 0; i < d.blocks.length; ++i) {
                if (typeof d.blocks[i] === "string")
                    $util.base64.decode(d.blocks[i], m.blocks[i] = $util.newBuffer($util.base64.length(d.blocks[i])), 0);
                else if (d.blocks[i].length >= 0)
                    m.blocks[i] = d.blocks[i];
            }
        }
        if (d.payload) {
            if (!Array.isArray(d.payload))
                throw TypeError(".Message.payload: array expected");
            m.payload = [];
            for (var i = 0; i < d.payload.length; ++i) {
                if (typeof d.payload[i] !== "object")
                    throw TypeError(".Message.payload: object expected");
                m.payload[i] = $root.Message.Block.fromObject(d.payload[i]);
            }
        }
        if (d.blockPresences) {
            if (!Array.isArray(d.blockPresences))
                throw TypeError(".Message.blockPresences: array expected");
            m.blockPresences = [];
            for (var i = 0; i < d.blockPresences.length; ++i) {
                if (typeof d.blockPresences[i] !== "object")
                    throw TypeError(".Message.blockPresences: object expected");
                m.blockPresences[i] = $root.Message.BlockPresence.fromObject(d.blockPresences[i]);
            }
        }
        if (d.pendingBytes != null) {
            m.pendingBytes = d.pendingBytes | 0;
        }
        return m;
    };

    /**
     * Creates a plain object from a Message message. Also converts values to other types if specified.
     * @function toObject
     * @memberof Message
     * @static
     * @param {Message} m Message
     * @param {$protobuf.IConversionOptions} [o] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    Message.toObject = function toObject(m, o) {
        if (!o)
            o = {};
        var d = {};
        if (o.arrays || o.defaults) {
            d.blocks = [];
            d.payload = [];
            d.blockPresences = [];
        }
        if (o.defaults) {
            d.wantlist = null;
            d.pendingBytes = 0;
        }
        if (m.wantlist != null && m.hasOwnProperty("wantlist")) {
            d.wantlist = $root.Message.Wantlist.toObject(m.wantlist, o);
        }
        if (m.blocks && m.blocks.length) {
            d.blocks = [];
            for (var j = 0; j < m.blocks.length; ++j) {
                d.blocks[j] = o.bytes === String ? $util.base64.encode(m.blocks[j], 0, m.blocks[j].length) : o.bytes === Array ? Array.prototype.slice.call(m.blocks[j]) : m.blocks[j];
            }
        }
        if (m.payload && m.payload.length) {
            d.payload = [];
            for (var j = 0; j < m.payload.length; ++j) {
                d.payload[j] = $root.Message.Block.toObject(m.payload[j], o);
            }
        }
        if (m.blockPresences && m.blockPresences.length) {
            d.blockPresences = [];
            for (var j = 0; j < m.blockPresences.length; ++j) {
                d.blockPresences[j] = $root.Message.BlockPresence.toObject(m.blockPresences[j], o);
            }
        }
        if (m.pendingBytes != null && m.hasOwnProperty("pendingBytes")) {
            d.pendingBytes = m.pendingBytes;
        }
        return d;
    };

    /**
     * Converts this Message to JSON.
     * @function toJSON
     * @memberof Message
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    Message.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for Message
     * @function getTypeUrl
     * @memberof Message
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    Message.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/Message";
    };

    Message.Wantlist = (function() {

        /**
         * Properties of a Wantlist.
         * @memberof Message
         * @interface IWantlist
         * @property {Array.<Message.Wantlist.IEntry>|null} [entries] Wantlist entries
         * @property {boolean|null} [full] Wantlist full
         */

        /**
         * Constructs a new Wantlist.
         * @memberof Message
         * @classdesc Represents a Wantlist.
         * @implements IWantlist
         * @constructor
         * @param {Message.IWantlist=} [p] Properties to set
         */
        function Wantlist(p) {
            this.entries = [];
            if (p)
                for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                    if (p[ks[i]] != null)
                        this[ks[i]] = p[ks[i]];
        }

        /**
         * Wantlist entries.
         * @member {Array.<Message.Wantlist.IEntry>} entries
         * @memberof Message.Wantlist
         * @instance
         */
        Wantlist.prototype.entries = $util.emptyArray;

        /**
         * Wantlist full.
         * @member {boolean} full
         * @memberof Message.Wantlist
         * @instance
         */
        Wantlist.prototype.full = false;

        /**
         * Encodes the specified Wantlist message. Does not implicitly {@link Message.Wantlist.verify|verify} messages.
         * @function encode
         * @memberof Message.Wantlist
         * @static
         * @param {Message.IWantlist} m Wantlist message or plain object to encode
         * @param {$protobuf.Writer} [w] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Wantlist.encode = function encode(m, w) {
            if (!w)
                w = $Writer.create();
            if (m.entries != null && m.entries.length) {
                for (var i = 0; i < m.entries.length; ++i)
                    $root.Message.Wantlist.Entry.encode(m.entries[i], w.uint32(10).fork()).ldelim();
            }
            if (m.full != null && Object.hasOwnProperty.call(m, "full"))
                w.uint32(16).bool(m.full);
            return w;
        };

        /**
         * Decodes a Wantlist message from the specified reader or buffer.
         * @function decode
         * @memberof Message.Wantlist
         * @static
         * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
         * @param {number} [l] Message length if known beforehand
         * @returns {Message.Wantlist} Wantlist
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Wantlist.decode = function decode(r, l) {
            if (!(r instanceof $Reader))
                r = $Reader.create(r);
            var c = l === undefined ? r.len : r.pos + l, m = new $root.Message.Wantlist();
            while (r.pos < c) {
                var t = r.uint32();
                switch (t >>> 3) {
                case 1: {
                        if (!(m.entries && m.entries.length))
                            m.entries = [];
                        m.entries.push($root.Message.Wantlist.Entry.decode(r, r.uint32()));
                        break;
                    }
                case 2: {
                        m.full = r.bool();
                        break;
                    }
                default:
                    r.skipType(t & 7);
                    break;
                }
            }
            return m;
        };

        /**
         * Creates a Wantlist message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof Message.Wantlist
         * @static
         * @param {Object.<string,*>} d Plain object
         * @returns {Message.Wantlist} Wantlist
         */
        Wantlist.fromObject = function fromObject(d) {
            if (d instanceof $root.Message.Wantlist)
                return d;
            var m = new $root.Message.Wantlist();
            if (d.entries) {
                if (!Array.isArray(d.entries))
                    throw TypeError(".Message.Wantlist.entries: array expected");
                m.entries = [];
                for (var i = 0; i < d.entries.length; ++i) {
                    if (typeof d.entries[i] !== "object")
                        throw TypeError(".Message.Wantlist.entries: object expected");
                    m.entries[i] = $root.Message.Wantlist.Entry.fromObject(d.entries[i]);
                }
            }
            if (d.full != null) {
                m.full = Boolean(d.full);
            }
            return m;
        };

        /**
         * Creates a plain object from a Wantlist message. Also converts values to other types if specified.
         * @function toObject
         * @memberof Message.Wantlist
         * @static
         * @param {Message.Wantlist} m Wantlist
         * @param {$protobuf.IConversionOptions} [o] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Wantlist.toObject = function toObject(m, o) {
            if (!o)
                o = {};
            var d = {};
            if (o.arrays || o.defaults) {
                d.entries = [];
            }
            if (o.defaults) {
                d.full = false;
            }
            if (m.entries && m.entries.length) {
                d.entries = [];
                for (var j = 0; j < m.entries.length; ++j) {
                    d.entries[j] = $root.Message.Wantlist.Entry.toObject(m.entries[j], o);
                }
            }
            if (m.full != null && m.hasOwnProperty("full")) {
                d.full = m.full;
            }
            return d;
        };

        /**
         * Converts this Wantlist to JSON.
         * @function toJSON
         * @memberof Message.Wantlist
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Wantlist.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Wantlist
         * @function getTypeUrl
         * @memberof Message.Wantlist
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Wantlist.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Message.Wantlist";
        };

        /**
         * WantType enum.
         * @name Message.Wantlist.WantType
         * @enum {number}
         * @property {number} Block=0 Block value
         * @property {number} Have=1 Have value
         */
        Wantlist.WantType = (function() {
            const valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "Block"] = 0;
            values[valuesById[1] = "Have"] = 1;
            return values;
        })();

        Wantlist.Entry = (function() {

            /**
             * Properties of an Entry.
             * @memberof Message.Wantlist
             * @interface IEntry
             * @property {Uint8Array|null} [block] Entry block
             * @property {number|null} [priority] Entry priority
             * @property {boolean|null} [cancel] Entry cancel
             * @property {Message.Wantlist.WantType|null} [wantType] Entry wantType
             * @property {boolean|null} [sendDontHave] Entry sendDontHave
             */

            /**
             * Constructs a new Entry.
             * @memberof Message.Wantlist
             * @classdesc Represents an Entry.
             * @implements IEntry
             * @constructor
             * @param {Message.Wantlist.IEntry=} [p] Properties to set
             */
            function Entry(p) {
                if (p)
                    for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                        if (p[ks[i]] != null)
                            this[ks[i]] = p[ks[i]];
            }

            /**
             * Entry block.
             * @member {Uint8Array} block
             * @memberof Message.Wantlist.Entry
             * @instance
             */
            Entry.prototype.block = $util.newBuffer([]);

            /**
             * Entry priority.
             * @member {number} priority
             * @memberof Message.Wantlist.Entry
             * @instance
             */
            Entry.prototype.priority = 0;

            /**
             * Entry cancel.
             * @member {boolean} cancel
             * @memberof Message.Wantlist.Entry
             * @instance
             */
            Entry.prototype.cancel = false;

            /**
             * Entry wantType.
             * @member {Message.Wantlist.WantType} wantType
             * @memberof Message.Wantlist.Entry
             * @instance
             */
            Entry.prototype.wantType = 0;

            /**
             * Entry sendDontHave.
             * @member {boolean} sendDontHave
             * @memberof Message.Wantlist.Entry
             * @instance
             */
            Entry.prototype.sendDontHave = false;

            /**
             * Encodes the specified Entry message. Does not implicitly {@link Message.Wantlist.Entry.verify|verify} messages.
             * @function encode
             * @memberof Message.Wantlist.Entry
             * @static
             * @param {Message.Wantlist.IEntry} m Entry message or plain object to encode
             * @param {$protobuf.Writer} [w] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Entry.encode = function encode(m, w) {
                if (!w)
                    w = $Writer.create();
                if (m.block != null && Object.hasOwnProperty.call(m, "block"))
                    w.uint32(10).bytes(m.block);
                if (m.priority != null && Object.hasOwnProperty.call(m, "priority"))
                    w.uint32(16).int32(m.priority);
                if (m.cancel != null && Object.hasOwnProperty.call(m, "cancel"))
                    w.uint32(24).bool(m.cancel);
                if (m.wantType != null && Object.hasOwnProperty.call(m, "wantType"))
                    w.uint32(32).int32(m.wantType);
                if (m.sendDontHave != null && Object.hasOwnProperty.call(m, "sendDontHave"))
                    w.uint32(40).bool(m.sendDontHave);
                return w;
            };

            /**
             * Decodes an Entry message from the specified reader or buffer.
             * @function decode
             * @memberof Message.Wantlist.Entry
             * @static
             * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
             * @param {number} [l] Message length if known beforehand
             * @returns {Message.Wantlist.Entry} Entry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Entry.decode = function decode(r, l) {
                if (!(r instanceof $Reader))
                    r = $Reader.create(r);
                var c = l === undefined ? r.len : r.pos + l, m = new $root.Message.Wantlist.Entry();
                while (r.pos < c) {
                    var t = r.uint32();
                    switch (t >>> 3) {
                    case 1: {
                            m.block = r.bytes();
                            break;
                        }
                    case 2: {
                            m.priority = r.int32();
                            break;
                        }
                    case 3: {
                            m.cancel = r.bool();
                            break;
                        }
                    case 4: {
                            m.wantType = r.int32();
                            break;
                        }
                    case 5: {
                            m.sendDontHave = r.bool();
                            break;
                        }
                    default:
                        r.skipType(t & 7);
                        break;
                    }
                }
                return m;
            };

            /**
             * Creates an Entry message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof Message.Wantlist.Entry
             * @static
             * @param {Object.<string,*>} d Plain object
             * @returns {Message.Wantlist.Entry} Entry
             */
            Entry.fromObject = function fromObject(d) {
                if (d instanceof $root.Message.Wantlist.Entry)
                    return d;
                var m = new $root.Message.Wantlist.Entry();
                if (d.block != null) {
                    if (typeof d.block === "string")
                        $util.base64.decode(d.block, m.block = $util.newBuffer($util.base64.length(d.block)), 0);
                    else if (d.block.length >= 0)
                        m.block = d.block;
                }
                if (d.priority != null) {
                    m.priority = d.priority | 0;
                }
                if (d.cancel != null) {
                    m.cancel = Boolean(d.cancel);
                }
                switch (d.wantType) {
                case "Block":
                case 0:
                    m.wantType = 0;
                    break;
                case "Have":
                case 1:
                    m.wantType = 1;
                    break;
                }
                if (d.sendDontHave != null) {
                    m.sendDontHave = Boolean(d.sendDontHave);
                }
                return m;
            };

            /**
             * Creates a plain object from an Entry message. Also converts values to other types if specified.
             * @function toObject
             * @memberof Message.Wantlist.Entry
             * @static
             * @param {Message.Wantlist.Entry} m Entry
             * @param {$protobuf.IConversionOptions} [o] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Entry.toObject = function toObject(m, o) {
                if (!o)
                    o = {};
                var d = {};
                if (o.defaults) {
                    if (o.bytes === String)
                        d.block = "";
                    else {
                        d.block = [];
                        if (o.bytes !== Array)
                            d.block = $util.newBuffer(d.block);
                    }
                    d.priority = 0;
                    d.cancel = false;
                    d.wantType = o.enums === String ? "Block" : 0;
                    d.sendDontHave = false;
                }
                if (m.block != null && m.hasOwnProperty("block")) {
                    d.block = o.bytes === String ? $util.base64.encode(m.block, 0, m.block.length) : o.bytes === Array ? Array.prototype.slice.call(m.block) : m.block;
                }
                if (m.priority != null && m.hasOwnProperty("priority")) {
                    d.priority = m.priority;
                }
                if (m.cancel != null && m.hasOwnProperty("cancel")) {
                    d.cancel = m.cancel;
                }
                if (m.wantType != null && m.hasOwnProperty("wantType")) {
                    d.wantType = o.enums === String ? $root.Message.Wantlist.WantType[m.wantType] : m.wantType;
                }
                if (m.sendDontHave != null && m.hasOwnProperty("sendDontHave")) {
                    d.sendDontHave = m.sendDontHave;
                }
                return d;
            };

            /**
             * Converts this Entry to JSON.
             * @function toJSON
             * @memberof Message.Wantlist.Entry
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Entry.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Entry
             * @function getTypeUrl
             * @memberof Message.Wantlist.Entry
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Entry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/Message.Wantlist.Entry";
            };

            return Entry;
        })();

        return Wantlist;
    })();

    Message.Block = (function() {

        /**
         * Properties of a Block.
         * @memberof Message
         * @interface IBlock
         * @property {Uint8Array|null} [prefix] Block prefix
         * @property {Uint8Array|null} [data] Block data
         */

        /**
         * Constructs a new Block.
         * @memberof Message
         * @classdesc Represents a Block.
         * @implements IBlock
         * @constructor
         * @param {Message.IBlock=} [p] Properties to set
         */
        function Block(p) {
            if (p)
                for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                    if (p[ks[i]] != null)
                        this[ks[i]] = p[ks[i]];
        }

        /**
         * Block prefix.
         * @member {Uint8Array} prefix
         * @memberof Message.Block
         * @instance
         */
        Block.prototype.prefix = $util.newBuffer([]);

        /**
         * Block data.
         * @member {Uint8Array} data
         * @memberof Message.Block
         * @instance
         */
        Block.prototype.data = $util.newBuffer([]);

        /**
         * Encodes the specified Block message. Does not implicitly {@link Message.Block.verify|verify} messages.
         * @function encode
         * @memberof Message.Block
         * @static
         * @param {Message.IBlock} m Block message or plain object to encode
         * @param {$protobuf.Writer} [w] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Block.encode = function encode(m, w) {
            if (!w)
                w = $Writer.create();
            if (m.prefix != null && Object.hasOwnProperty.call(m, "prefix"))
                w.uint32(10).bytes(m.prefix);
            if (m.data != null && Object.hasOwnProperty.call(m, "data"))
                w.uint32(18).bytes(m.data);
            return w;
        };

        /**
         * Decodes a Block message from the specified reader or buffer.
         * @function decode
         * @memberof Message.Block
         * @static
         * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
         * @param {number} [l] Message length if known beforehand
         * @returns {Message.Block} Block
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Block.decode = function decode(r, l) {
            if (!(r instanceof $Reader))
                r = $Reader.create(r);
            var c = l === undefined ? r.len : r.pos + l, m = new $root.Message.Block();
            while (r.pos < c) {
                var t = r.uint32();
                switch (t >>> 3) {
                case 1: {
                        m.prefix = r.bytes();
                        break;
                    }
                case 2: {
                        m.data = r.bytes();
                        break;
                    }
                default:
                    r.skipType(t & 7);
                    break;
                }
            }
            return m;
        };

        /**
         * Creates a Block message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof Message.Block
         * @static
         * @param {Object.<string,*>} d Plain object
         * @returns {Message.Block} Block
         */
        Block.fromObject = function fromObject(d) {
            if (d instanceof $root.Message.Block)
                return d;
            var m = new $root.Message.Block();
            if (d.prefix != null) {
                if (typeof d.prefix === "string")
                    $util.base64.decode(d.prefix, m.prefix = $util.newBuffer($util.base64.length(d.prefix)), 0);
                else if (d.prefix.length >= 0)
                    m.prefix = d.prefix;
            }
            if (d.data != null) {
                if (typeof d.data === "string")
                    $util.base64.decode(d.data, m.data = $util.newBuffer($util.base64.length(d.data)), 0);
                else if (d.data.length >= 0)
                    m.data = d.data;
            }
            return m;
        };

        /**
         * Creates a plain object from a Block message. Also converts values to other types if specified.
         * @function toObject
         * @memberof Message.Block
         * @static
         * @param {Message.Block} m Block
         * @param {$protobuf.IConversionOptions} [o] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Block.toObject = function toObject(m, o) {
            if (!o)
                o = {};
            var d = {};
            if (o.defaults) {
                if (o.bytes === String)
                    d.prefix = "";
                else {
                    d.prefix = [];
                    if (o.bytes !== Array)
                        d.prefix = $util.newBuffer(d.prefix);
                }
                if (o.bytes === String)
                    d.data = "";
                else {
                    d.data = [];
                    if (o.bytes !== Array)
                        d.data = $util.newBuffer(d.data);
                }
            }
            if (m.prefix != null && m.hasOwnProperty("prefix")) {
                d.prefix = o.bytes === String ? $util.base64.encode(m.prefix, 0, m.prefix.length) : o.bytes === Array ? Array.prototype.slice.call(m.prefix) : m.prefix;
            }
            if (m.data != null && m.hasOwnProperty("data")) {
                d.data = o.bytes === String ? $util.base64.encode(m.data, 0, m.data.length) : o.bytes === Array ? Array.prototype.slice.call(m.data) : m.data;
            }
            return d;
        };

        /**
         * Converts this Block to JSON.
         * @function toJSON
         * @memberof Message.Block
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Block.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Block
         * @function getTypeUrl
         * @memberof Message.Block
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Block.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Message.Block";
        };

        return Block;
    })();

    /**
     * BlockPresenceType enum.
     * @name Message.BlockPresenceType
     * @enum {number}
     * @property {number} Have=0 Have value
     * @property {number} DontHave=1 DontHave value
     */
    Message.BlockPresenceType = (function() {
        const valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "Have"] = 0;
        values[valuesById[1] = "DontHave"] = 1;
        return values;
    })();

    Message.BlockPresence = (function() {

        /**
         * Properties of a BlockPresence.
         * @memberof Message
         * @interface IBlockPresence
         * @property {Uint8Array|null} [cid] BlockPresence cid
         * @property {Message.BlockPresenceType|null} [type] BlockPresence type
         */

        /**
         * Constructs a new BlockPresence.
         * @memberof Message
         * @classdesc Represents a BlockPresence.
         * @implements IBlockPresence
         * @constructor
         * @param {Message.IBlockPresence=} [p] Properties to set
         */
        function BlockPresence(p) {
            if (p)
                for (var ks = Object.keys(p), i = 0; i < ks.length; ++i)
                    if (p[ks[i]] != null)
                        this[ks[i]] = p[ks[i]];
        }

        /**
         * BlockPresence cid.
         * @member {Uint8Array} cid
         * @memberof Message.BlockPresence
         * @instance
         */
        BlockPresence.prototype.cid = $util.newBuffer([]);

        /**
         * BlockPresence type.
         * @member {Message.BlockPresenceType} type
         * @memberof Message.BlockPresence
         * @instance
         */
        BlockPresence.prototype.type = 0;

        /**
         * Encodes the specified BlockPresence message. Does not implicitly {@link Message.BlockPresence.verify|verify} messages.
         * @function encode
         * @memberof Message.BlockPresence
         * @static
         * @param {Message.IBlockPresence} m BlockPresence message or plain object to encode
         * @param {$protobuf.Writer} [w] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BlockPresence.encode = function encode(m, w) {
            if (!w)
                w = $Writer.create();
            if (m.cid != null && Object.hasOwnProperty.call(m, "cid"))
                w.uint32(10).bytes(m.cid);
            if (m.type != null && Object.hasOwnProperty.call(m, "type"))
                w.uint32(16).int32(m.type);
            return w;
        };

        /**
         * Decodes a BlockPresence message from the specified reader or buffer.
         * @function decode
         * @memberof Message.BlockPresence
         * @static
         * @param {$protobuf.Reader|Uint8Array} r Reader or buffer to decode from
         * @param {number} [l] Message length if known beforehand
         * @returns {Message.BlockPresence} BlockPresence
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BlockPresence.decode = function decode(r, l) {
            if (!(r instanceof $Reader))
                r = $Reader.create(r);
            var c = l === undefined ? r.len : r.pos + l, m = new $root.Message.BlockPresence();
            while (r.pos < c) {
                var t = r.uint32();
                switch (t >>> 3) {
                case 1: {
                        m.cid = r.bytes();
                        break;
                    }
                case 2: {
                        m.type = r.int32();
                        break;
                    }
                default:
                    r.skipType(t & 7);
                    break;
                }
            }
            return m;
        };

        /**
         * Creates a BlockPresence message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof Message.BlockPresence
         * @static
         * @param {Object.<string,*>} d Plain object
         * @returns {Message.BlockPresence} BlockPresence
         */
        BlockPresence.fromObject = function fromObject(d) {
            if (d instanceof $root.Message.BlockPresence)
                return d;
            var m = new $root.Message.BlockPresence();
            if (d.cid != null) {
                if (typeof d.cid === "string")
                    $util.base64.decode(d.cid, m.cid = $util.newBuffer($util.base64.length(d.cid)), 0);
                else if (d.cid.length >= 0)
                    m.cid = d.cid;
            }
            switch (d.type) {
            case "Have":
            case 0:
                m.type = 0;
                break;
            case "DontHave":
            case 1:
                m.type = 1;
                break;
            }
            return m;
        };

        /**
         * Creates a plain object from a BlockPresence message. Also converts values to other types if specified.
         * @function toObject
         * @memberof Message.BlockPresence
         * @static
         * @param {Message.BlockPresence} m BlockPresence
         * @param {$protobuf.IConversionOptions} [o] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        BlockPresence.toObject = function toObject(m, o) {
            if (!o)
                o = {};
            var d = {};
            if (o.defaults) {
                if (o.bytes === String)
                    d.cid = "";
                else {
                    d.cid = [];
                    if (o.bytes !== Array)
                        d.cid = $util.newBuffer(d.cid);
                }
                d.type = o.enums === String ? "Have" : 0;
            }
            if (m.cid != null && m.hasOwnProperty("cid")) {
                d.cid = o.bytes === String ? $util.base64.encode(m.cid, 0, m.cid.length) : o.bytes === Array ? Array.prototype.slice.call(m.cid) : m.cid;
            }
            if (m.type != null && m.hasOwnProperty("type")) {
                d.type = o.enums === String ? $root.Message.BlockPresenceType[m.type] : m.type;
            }
            return d;
        };

        /**
         * Converts this BlockPresence to JSON.
         * @function toJSON
         * @memberof Message.BlockPresence
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        BlockPresence.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for BlockPresence
         * @function getTypeUrl
         * @memberof Message.BlockPresence
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        BlockPresence.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Message.BlockPresence";
        };

        return BlockPresence;
    })();

    return Message;
})();

export { $root as default };
