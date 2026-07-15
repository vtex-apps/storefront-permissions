/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as crypto from 'crypto'

import { AuthenticationError, ForbiddenError, UserInputError } from '@vtex/api'
import type { AxiosError } from 'axios'
import slugify from 'slugify'

import schemas from '../mdSchema'
import type { ErrorResponse } from '../resolvers/Routes/utils'
import roleNames from '../roleNames'

export * from './cookie'

export const toHash = (obj: any) => {
  return crypto.createHash('md5').update(JSON.stringify(obj)).digest('hex')
}

export function toUUID(uuid: string) {
  return uuid.indexOf('-') === -1
    ? `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(
        12,
        16
      )}-${uuid.substring(16, 20)}-${uuid.substring(20, uuid.length)}`
    : uuid
}

export function Slugify(str: any) {
  return slugify(str, { lower: true, remove: /[*+~.()'"!:@]/g })
}

export const currentSchema = (entity: string) => {
  return schemas.find((item: any) => {
    return item.name === entity
  })
}

export const currentRoleNames = (locale: any) => {
  return roleNames[locale] ?? roleNames['en-US']
}

export function statusToError(error: ErrorResponse) {
  if (!error.response) {
    throw error
  }

  const { response } = error as AxiosError
  const { status } = response!

  if (status === 401) {
    throw new AuthenticationError(error)
  }

  if (status === 403) {
    throw new ForbiddenError(error)
  }

  if (status === 400) {
    throw new UserInputError(error)
  }

  throw error
}
