import type { StorageAdapter } from 'payload'

type VercelBlobStorageMetadata = {
  collections: Record<string, { prefix?: string } | true | undefined>
  enabled: boolean
  storeId?: string
  useCompositePrefixes: boolean
}

export const vercelBlobStorageMetadata = Symbol('vercelBlobStorageMetadata')

export type InternalVercelBlobStorageAdapter = {
  [vercelBlobStorageMetadata]: VercelBlobStorageMetadata
} & StorageAdapter
