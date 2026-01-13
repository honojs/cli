import { existsSync, createWriteStream } from 'node:fs'
import { dirname, basename } from 'node:path'

export const getFilenameFromPath = (path: string): string => {
  // We use 'http://localhost' as a base because 'path' is often a relative path (e.g., '/users/123').
  // The URL constructor requires a base URL for relative paths to parse them correctly.
  // If 'path' is an absolute URL, the base argument is ignored.
  const url = new URL(path, 'http://localhost')
  const pathname = url.pathname
  const name = basename(pathname)

  return name
}

export const saveFile = async (buffer: ArrayBuffer, filepath: string): Promise<void> => {
  if (existsSync(filepath)) {
    throw new Error(`File ${filepath} already exists.`)
  }

  const dir = dirname(filepath)
  if (!existsSync(dir)) {
    throw new Error(`Directory ${dir} does not exist.`)
  }

  const totalBytes = buffer.byteLength
  const view = new Uint8Array(buffer)
  const chunkSize = 1024 * 64 // 64KB
  let savedBytes = 0

  const stream = createWriteStream(filepath)

  return new Promise((resolve, reject) => {
    stream.on('error', (err) => reject(err))

    const writeChunk = (index: number) => {
      if (index >= totalBytes) {
        stream.end(() => {
          resolve()
        })
        return
      }

      const end = Math.min(index + chunkSize, totalBytes)
      const chunk = view.slice(index, end)

      stream.write(chunk, (err) => {
        if (err) {
          stream.destroy(err)
          reject(err)
          return
        }
        savedBytes += chunk.length
        console.log(`Saved ${savedBytes} of ${totalBytes} bytes`)
        writeChunk(end)
      })
    }

    writeChunk(0)
  })
}
