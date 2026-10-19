import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import * as blob from '@vercel/blob'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async () => ({
    pathname: 'media/image.webp',
    url: 'https://example.com/media/image.webp',
  })),
}))

import { uploadFile } from './uploadFile.js'

const baseArgs = {
  access: 'public' as const,
  cacheControlMaxAge: 60,
  mimeType: 'image/webp',
  storageFilePath: 'media/image.webp',
  token: 'read-write-token',
}

describe('uploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads the buffer when no temp file is present', async () => {
    const buffer = Buffer.from('webp-bytes')

    await uploadFile({ ...baseArgs, buffer })

    expect(blob.put).toHaveBeenCalledWith(
      'media/image.webp',
      buffer,
      expect.objectContaining({ contentType: 'image/webp' }),
    )
  })

  it('streams the temp file instead of an empty buffer', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vercel-blob-upload-'))
    const tempFilePath = path.join(dir, 'processed.webp')
    await fs.promises.writeFile(tempFilePath, 'processed-webp-bytes')

    try {
      await uploadFile({ ...baseArgs, buffer: Buffer.alloc(0), tempFilePath })

      expect(blob.put).toHaveBeenCalledTimes(1)
      const [, body] = vi.mocked(blob.put).mock.calls[0]!

      expect(body).toBeInstanceOf(fs.ReadStream)

      const chunks: Buffer[] = []
      for await (const chunk of body as fs.ReadStream) {
        chunks.push(Buffer.from(chunk as Uint8Array))
      }
      expect(Buffer.concat(chunks).toString()).toBe('processed-webp-bytes')
    } finally {
      await fs.promises.rm(dir, { force: true, recursive: true })
    }
  })
})
