import type { SanitizedCollectionConfig } from '../../../collections/config/types.js'
import type { PayloadRequest } from '../../../types/index.js'

import { describe, expect, it } from 'vitest'

import { ValidationError } from '../../../errors/index.js'
import { generatePasswordSaltHash } from './generatePasswordSaltHash.js'

const mockReq = {
  payload: { config: {} },
  t: (key: string, vars?: Record<string, unknown>) => `${key} ${JSON.stringify(vars ?? {})}`,
} as unknown as PayloadRequest

const buildCollection = (passwordField?: Record<string, unknown>) =>
  ({
    fields: passwordField ? [passwordField] : [],
    slug: 'users',
  }) as unknown as SanitizedCollectionConfig

describe('generatePasswordSaltHash', () => {
  it('should reject a password shorter than the collection password field minLength', async () => {
    const collection = buildCollection({
      hidden: true,
      minLength: 8,
      name: 'password',
      type: 'text',
    })

    const error = await generatePasswordSaltHash({
      collection,
      password: 'abc',
      req: mockReq,
    }).catch((err) => err)

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.data.errors).toHaveLength(1)
    expect(error.data.errors[0].path).toBe('password')
    expect(error.data.errors[0].message).toContain('"minLength":8')
  })

  it('should hash a password that meets the collection password field minLength', async () => {
    const collection = buildCollection({
      hidden: true,
      minLength: 8,
      name: 'password',
      type: 'text',
    })

    const { hash, salt } = await generatePasswordSaltHash({
      collection,
      password: 'longenough1',
      req: mockReq,
    })

    expect(hash).toContain('pbkdf2-sha256-v1:')
    expect(salt).toHaveLength(64)
  })

  it('should fall back to the default minLength when the collection has no password field', async () => {
    const collection = buildCollection()

    const { hash, salt } = await generatePasswordSaltHash({
      collection,
      password: 'abc',
      req: mockReq,
    })

    expect(hash).toContain('pbkdf2-sha256-v1:')
    expect(salt).toHaveLength(64)
  })

  it('should reject a password shorter than the default minLength without an override', async () => {
    const collection = buildCollection()

    const error = await generatePasswordSaltHash({
      collection,
      password: 'ab',
      req: mockReq,
    }).catch((err) => err)

    expect(error).toBeInstanceOf(ValidationError)
  })

  it('should apply maxLength from the collection password field', async () => {
    const collection = buildCollection({
      maxLength: 5,
      name: 'password',
      type: 'text',
    })

    const error = await generatePasswordSaltHash({
      collection,
      password: 'toolongpassword',
      req: mockReq,
    }).catch((err) => err)

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.data.errors[0].message).toContain('"maxLength":5')
  })
})
