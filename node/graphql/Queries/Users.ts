import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_users')

export const getUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  try {
    const {id} = params
    return await masterdata.getDocument({dataEntity: config.name, id, fields: ['id','profileId','userId','name','email','canImpersonate']})
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const getUserByEmail = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx

  const {email} = params

  try {
    return await masterdata.searchDocuments({dataEntity: config.name, fields: ['id','profileId','userId','name','email','canImpersonate'], schema: config.version, pagination: {page: 1, pageSize: 50}, where: `email=${email}`})

  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const listUsers = async (_: any, __: any, ctx: Context) => {
  const {
    clients: { masterdata },
  } = ctx
  let res: any = []
  try {
    res = await masterdata.searchDocuments({dataEntity: config.name, fields: ['id','profileId','userId','name','email','canImpersonate'], schema: config.version, pagination: {page: 1, pageSize: 50}})
    console.log('listUsers', res)
    return res
  } catch (e) {
    return { status: 'error', message: e }
  }
}
