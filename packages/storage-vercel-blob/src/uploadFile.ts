import { put } from '@vercel/blob'
import fs from 'node:fs'
import path from 'path'

interface UploadFileArgs {
  access: 'public'
  addRandomSuffix?: boolean
  buffer: Buffer
  cacheControlMaxAge?: number
  mimeType: string
  storageFilePath: string
  /** When present, the processed file bytes live on disk - stream them instead of the (possibly empty) buffer. */
  tempFilePath?: string
  token: string
}

interface UploadFileResult {
  filename?: string
}

export async function uploadFile({
  access,
  addRandomSuffix,
  buffer,
  cacheControlMaxAge,
  mimeType,
  storageFilePath,
  tempFilePath,
  token,
}: UploadFileArgs): Promise<UploadFileResult> {
  // Client uploads that went through server-side processing (e.g. WebP resizing) have their
  // bytes written back to the temp file while `buffer` stays empty - prefer the temp file.
  const fileBufferOrStream = tempFilePath ? fs.createReadStream(tempFilePath) : buffer

  const result = await put(storageFilePath, fileBufferOrStream, {
    access,
    addRandomSuffix,
    allowOverwrite: true,
    cacheControlMaxAge,
    contentType: mimeType,
    token,
  })

  if (addRandomSuffix) {
    const pathname = result.pathname.replace(/^\/+/, '')
    const basename = path.posix.basename(pathname)
    return { filename: decodeURIComponent(basename) }
  }

  return {}
}
