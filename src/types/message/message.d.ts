import $protobuf from "protobufjs/minimal.js";
/** Properties of a Message. */
export interface IMessage {

    /** Message wantlist */
    wantlist?: (Message.IWantlist|null);

    /** Message blocks */
    blocks?: (Uint8Array[]|null);

    /** Message payload */
    payload?: (Message.IBlock[]|null);

    /** Message blockPresences */
    blockPresences?: (Message.IBlockPresence[]|null);

    /** Message pendingBytes */
    pendingBytes?: (number|null);
}

/** Represents a Message. */
export class Message implements IMessage {

    /**
     * Constructs a new Message.
     * @param [p] Properties to set
     */
    constructor(p?: IMessage);

    /** Message wantlist. */
    public wantlist?: (Message.IWantlist|null);

    /** Message blocks. */
    public blocks: Uint8Array[];

    /** Message payload. */
    public payload: Message.IBlock[];

    /** Message blockPresences. */
    public blockPresences: Message.IBlockPresence[];

    /** Message pendingBytes. */
    public pendingBytes: number;

    /**
     * Encodes the specified Message message. Does not implicitly {@link Message.verify|verify} messages.
     * @param m Message message or plain object to encode
     * @param [w] Writer to encode to
     * @returns Writer
     */
    public static encode(m: IMessage, w?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a Message message from the specified reader or buffer.
     * @param r Reader or buffer to decode from
     * @param [l] Message length if known beforehand
     * @returns Message
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(r: ($protobuf.Reader|Uint8Array), l?: number): Message;

    /**
     * Creates a Message message from a plain object. Also converts values to their respective internal types.
     * @param d Plain object
     * @returns Message
     */
    public static fromObject(d: { [k: string]: any }): Message;

    /**
     * Creates a plain object from a Message message. Also converts values to other types if specified.
     * @param m Message
     * @param [o] Conversion options
     * @returns Plain object
     */
    public static toObject(m: Message, o?: $protobuf.IConversionOptions): { [k: string]: any };

    /**
     * Converts this Message to JSON.
     * @returns JSON object
     */
    public toJSON(): { [k: string]: any };
}

export namespace Message {

    /** Properties of a Wantlist. */
    interface IWantlist {

        /** Wantlist entries */
        entries?: (Message.Wantlist.IEntry[]|null);

        /** Wantlist full */
        full?: (boolean|null);
    }

    /** Represents a Wantlist. */
    class Wantlist implements IWantlist {

        /**
         * Constructs a new Wantlist.
         * @param [p] Properties to set
         */
        constructor(p?: Message.IWantlist);

        /** Wantlist entries. */
        public entries: Message.Wantlist.IEntry[];

        /** Wantlist full. */
        public full: boolean;

        /**
         * Encodes the specified Wantlist message. Does not implicitly {@link Message.Wantlist.verify|verify} messages.
         * @param m Wantlist message or plain object to encode
         * @param [w] Writer to encode to
         * @returns Writer
         */
        public static encode(m: Message.IWantlist, w?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Wantlist message from the specified reader or buffer.
         * @param r Reader or buffer to decode from
         * @param [l] Message length if known beforehand
         * @returns Wantlist
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(r: ($protobuf.Reader|Uint8Array), l?: number): Message.Wantlist;

        /**
         * Creates a Wantlist message from a plain object. Also converts values to their respective internal types.
         * @param d Plain object
         * @returns Wantlist
         */
        public static fromObject(d: { [k: string]: any }): Message.Wantlist;

        /**
         * Creates a plain object from a Wantlist message. Also converts values to other types if specified.
         * @param m Wantlist
         * @param [o] Conversion options
         * @returns Plain object
         */
        public static toObject(m: Message.Wantlist, o?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Wantlist to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }

    namespace Wantlist {

        /** WantType enum. */
        enum WantType {
            Block = 0,
            Have = 1
        }

        /** Properties of an Entry. */
        interface IEntry {

            /** Entry block */
            block?: (Uint8Array|null);

            /** Entry priority */
            priority?: (number|null);

            /** Entry cancel */
            cancel?: (boolean|null);

            /** Entry wantType */
            wantType?: (Message.Wantlist.WantType|null);

            /** Entry sendDontHave */
            sendDontHave?: (boolean|null);
        }

        /** Represents an Entry. */
        class Entry implements IEntry {

            /**
             * Constructs a new Entry.
             * @param [p] Properties to set
             */
            constructor(p?: Message.Wantlist.IEntry);

            /** Entry block. */
            public block: Uint8Array;

            /** Entry priority. */
            public priority: number;

            /** Entry cancel. */
            public cancel: boolean;

            /** Entry wantType. */
            public wantType: Message.Wantlist.WantType;

            /** Entry sendDontHave. */
            public sendDontHave: boolean;

            /**
             * Encodes the specified Entry message. Does not implicitly {@link Message.Wantlist.Entry.verify|verify} messages.
             * @param m Entry message or plain object to encode
             * @param [w] Writer to encode to
             * @returns Writer
             */
            public static encode(m: Message.Wantlist.IEntry, w?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an Entry message from the specified reader or buffer.
             * @param r Reader or buffer to decode from
             * @param [l] Message length if known beforehand
             * @returns Entry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(r: ($protobuf.Reader|Uint8Array), l?: number): Message.Wantlist.Entry;

            /**
             * Creates an Entry message from a plain object. Also converts values to their respective internal types.
             * @param d Plain object
             * @returns Entry
             */
            public static fromObject(d: { [k: string]: any }): Message.Wantlist.Entry;

            /**
             * Creates a plain object from an Entry message. Also converts values to other types if specified.
             * @param m Entry
             * @param [o] Conversion options
             * @returns Plain object
             */
            public static toObject(m: Message.Wantlist.Entry, o?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this Entry to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };
        }
    }

    /** Properties of a Block. */
    interface IBlock {

        /** Block prefix */
        prefix?: (Uint8Array|null);

        /** Block data */
        data?: (Uint8Array|null);
    }

    /** Represents a Block. */
    class Block implements IBlock {

        /**
         * Constructs a new Block.
         * @param [p] Properties to set
         */
        constructor(p?: Message.IBlock);

        /** Block prefix. */
        public prefix: Uint8Array;

        /** Block data. */
        public data: Uint8Array;

        /**
         * Encodes the specified Block message. Does not implicitly {@link Message.Block.verify|verify} messages.
         * @param m Block message or plain object to encode
         * @param [w] Writer to encode to
         * @returns Writer
         */
        public static encode(m: Message.IBlock, w?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Block message from the specified reader or buffer.
         * @param r Reader or buffer to decode from
         * @param [l] Message length if known beforehand
         * @returns Block
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(r: ($protobuf.Reader|Uint8Array), l?: number): Message.Block;

        /**
         * Creates a Block message from a plain object. Also converts values to their respective internal types.
         * @param d Plain object
         * @returns Block
         */
        public static fromObject(d: { [k: string]: any }): Message.Block;

        /**
         * Creates a plain object from a Block message. Also converts values to other types if specified.
         * @param m Block
         * @param [o] Conversion options
         * @returns Plain object
         */
        public static toObject(m: Message.Block, o?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Block to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }

    /** BlockPresenceType enum. */
    enum BlockPresenceType {
        Have = 0,
        DontHave = 1
    }

    /** Properties of a BlockPresence. */
    interface IBlockPresence {

        /** BlockPresence cid */
        cid?: (Uint8Array|null);

        /** BlockPresence type */
        type?: (Message.BlockPresenceType|null);
    }

    /** Represents a BlockPresence. */
    class BlockPresence implements IBlockPresence {

        /**
         * Constructs a new BlockPresence.
         * @param [p] Properties to set
         */
        constructor(p?: Message.IBlockPresence);

        /** BlockPresence cid. */
        public cid: Uint8Array;

        /** BlockPresence type. */
        public type: Message.BlockPresenceType;

        /**
         * Encodes the specified BlockPresence message. Does not implicitly {@link Message.BlockPresence.verify|verify} messages.
         * @param m BlockPresence message or plain object to encode
         * @param [w] Writer to encode to
         * @returns Writer
         */
        public static encode(m: Message.IBlockPresence, w?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a BlockPresence message from the specified reader or buffer.
         * @param r Reader or buffer to decode from
         * @param [l] Message length if known beforehand
         * @returns BlockPresence
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(r: ($protobuf.Reader|Uint8Array), l?: number): Message.BlockPresence;

        /**
         * Creates a BlockPresence message from a plain object. Also converts values to their respective internal types.
         * @param d Plain object
         * @returns BlockPresence
         */
        public static fromObject(d: { [k: string]: any }): Message.BlockPresence;

        /**
         * Creates a plain object from a BlockPresence message. Also converts values to other types if specified.
         * @param m BlockPresence
         * @param [o] Conversion options
         * @returns Plain object
         */
        public static toObject(m: Message.BlockPresence, o?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this BlockPresence to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }
}
