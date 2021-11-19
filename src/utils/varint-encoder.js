import * as varint from 'varint'

/**
 * @param {Array<number>} buf
 * @returns {Uint8Array}
 */
function varintEncoder (buf) {
  let out = new Uint8Array(buf.reduce((acc, curr) => {
    // @ts-expect-error types are wrong
    return acc + varint.default.encodingLength(curr)
  }, 0))
  let offset = 0

  for (const num of buf) {
    out = varint.encode(num, out, offset)

    // @ts-expect-error types are wrong
    offset += varint.default.encodingLength(num)
  }

  return out
}

export default varintEncoder
