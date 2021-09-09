import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { randomBytes} from 'iso-random-stream'
// @ts-ignore
import range from 'lodash.range'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
// @ts-ignore
import { v4 as uuid } from 'uuid'

/**
 * @param {number} count
 * @param {number} [size]
 * @returns {Promise<{ cid: CID, data: Uint8Array}[]>}
 */
export const makeBlocks = async (count, size) => {
  const blocks = await Promise.all(
    range(count || 1).map(async () => {
      const data = size ? randomBytes(size) : uint8ArrayFromString(`hello world ${uuid()}`)
      const hash = await sha256.digest(data)
      return {
        cid: CID.createV0(hash),
        data
      }
    })
  )

  return blocks
}
