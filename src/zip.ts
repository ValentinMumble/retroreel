/**
 * Reads text files out of a ZIP archive in the browser, with the built-in DecompressionStream.
 * Enough for Letterboxd's export: stored or deflated files, no ZIP64, no encryption.
 */

const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50

async function inflate(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function readZip(file: Blob, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY) {
      end = offset
      break
    }
  }
  if (end < 0) throw new Error('This file is not a ZIP archive')
  const count = view.getUint16(end + 10, true)
  let pointer = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const files = new Map<string, string>()
  for (let entry = 0; entry < count; entry += 1) {
    if (view.getUint32(pointer, true) !== DIRECTORY_ENTRY) throw new Error('This ZIP archive looks damaged')
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const localHeader = view.getUint32(pointer + 42, true)
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength))
    pointer += 46 + nameLength + extraLength + commentLength
    if (!wanted(name)) continue
    // The local header repeats the name and has its own extra field: the data starts after both.
    const start = localHeader + 30 + view.getUint16(localHeader + 26, true) + view.getUint16(localHeader + 28, true)
    const data = bytes.slice(start, start + compressedSize)
    if (method !== 0 && method !== 8) throw new Error(`Cannot read ${name} (compression method ${method})`)
    files.set(name, decoder.decode(method === 8 ? await inflate(data) : data))
  }
  return files
}
