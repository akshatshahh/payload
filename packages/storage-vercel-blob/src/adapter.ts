import type {
  Adapter,
  ClientUploadsConfig,
  DeleteFile,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'

import { resolveSignedURLKey } from '@payloadcms/plugin-cloud-storage/utilities'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { Forbidden } from 'payload'
import { assertClientUploadAllowed } from 'payload/internal'

import { copyVercelBlobFile } from './copyFile.js'
import { deleteFile } from './deleteFile.js'
import { generateURL } from './generateURL.js'
import { getFile } from './getFile.js'
import { uploadFile } from './uploadFile.js'

interface CreateVercelBlobAdapterArgs {
  access: 'public'
  addRandomSuffix?: boolean
  baseUrl: string
  cacheControlMaxAge: number
  clientUploads?: ClientUploadsConfig
  token: string
  useCompositePrefixes?: boolean
}

export function createVercelBlobAdapter({
  access,
  addRandomSuffix,
  baseUrl,
  cacheControlMaxAge,
  clientUploads,
  token,
  useCompositePrefixes = false,
}: CreateVercelBlobAdapterArgs): Adapter {
  const clientUploadsAccess = typeof clientUploads === 'object' ? clientUploads.access : undefined
  const deleteStoredFile: DeleteFile = ({ storageFilePath }) =>
    deleteFile({ baseUrl, storageFilePath, token })

  return ({ collection, prefix = '' }): GeneratedAdapter => ({
    name: 'vercel-blob',

    copyFile: ({ from, req, to }) =>
      copyVercelBlobFile({ access, cacheControlMaxAge, from, req, to, token }),
    deleteFile: deleteStoredFile,

    uploadInstructions: {
      adminHandler: {
        path: '@payloadcms/storage-vercel-blob/client#VercelBlobClientUploadHandler',
      },
      enabled: Boolean(clientUploads),
      generate: async ({
        collectionSlug,
        docPrefix,
        filename,
        filesize,
        mimeType,
        overrideAccess,
        req,
      }) => {
        if (
          !overrideAccess &&
          (clientUploadsAccess ? !(await clientUploadsAccess({ collectionSlug, req })) : !req.user)
        ) {
          throw new Forbidden(req.t)
        }

        assertClientUploadAllowed({ collection, filename, mimeType })

        // Always resolve a deduplicated key. Authorising an in-place overwrite here is unsafe:
        // the instructions request carries no target document ID, so the server cannot tell a
        // new-document creation apart from an intentional replacement - and a colliding upload
        // would clobber another document's bytes (see #17823, #18362). Replacements still work:
        // the document is updated to the deduplicated path and the previous file is deleted
        // afterwards, matching the server-upload flow.
        const resolved = await resolveSignedURLKey({
          collectionPrefix: prefix,
          collectionSlug,
          docPrefix,
          filename,
          req,
          useCompositePrefixes,
        })

        return {
          name: 'uploadToVercelBlob',
          type: 'dispatch',
          data: {
            pathname: resolved.storageFilePath,
            token: await generateClientTokenFromReadWriteToken({
              addRandomSuffix: false,
              allowedContentTypes: mimeType ? [mimeType] : undefined,
              cacheControlMaxAge,
              maximumSizeInBytes: filesize,
              pathname: resolved.storageFilePath,
              token,
            }),
          },
          file: {
            filename: resolved.sanitizedFilename,
            mimeType,
            size: filesize,
            uploadReference: resolved.uploadReference,
          },
        }
      },
      requiresUploadReceipt: true,
      useInAdmin: true,
    },

    generateURL: ({ filename, prefix: urlPrefix = '' }) =>
      generateURL({
        baseUrl,
        collectionPrefix: prefix,
        filename,
        prefix: urlPrefix,
        useCompositePrefixes,
      }),

    handleDelete: deleteStoredFile,

    handleUpload: async ({ data, file: { buffer, mimeType, tempFilePath }, storageFilePath }) => {
      const result = await uploadFile({
        access,
        addRandomSuffix,
        buffer,
        cacheControlMaxAge,
        mimeType,
        storageFilePath,
        tempFilePath,
        token,
      })

      if (result.filename) {
        data.filename = result.filename
      }

      return data
    },

    staticHandler: (req, { doc, headers, params: { filename, operation, uploadReference } }) =>
      getFile({
        baseUrl,
        cacheControlMaxAge,
        collection,
        collectionPrefix: prefix,
        doc,
        filename,
        incomingHeaders: headers,
        operation,
        req,
        token,
        uploadReference,
        useCompositePrefixes,
      }),
  })
}
