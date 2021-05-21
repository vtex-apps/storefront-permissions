import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_profiles')


// getProfile(id: ID!): Profile @cacheControl(scope: PRIVATE)
// getProfileByRole(roleId: ID!): Profile @cacheControl(scope: PRIVATE)
// listProfiles: [Profile] @cacheControl(scope: PRIVATE)
// id: ID
// features: String!
// roleId: ID!
// scoped: Boolean
export const getProfile = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const {id} = params
    return await masterdata.getDocument({dataEntity: config.name, id, fields: ['id','roleId','features','scoped']})
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const getProfileByRole = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const {roleId} = params

  try {
    return await masterdata.searchDocuments({dataEntity: config.name, fields: ['id','roleId','features','scoped'], schema: config.version, pagination: {page: 0, pageSize: 50}, where: `roleId=${roleId}`})

  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const listProfiles = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    return await masterdata.searchDocuments({dataEntity: config.name, fields: ['id','roleId','features','scoped'], schema: config.version, pagination: {page: 0, pageSize: 50}})

  } catch (e) {
    return { status: 'error', message: e }
  }
}
