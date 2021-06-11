import { removeVersionFromAppId } from '@vtex/api'
import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_users')
import {getProfile} from './Profiles'
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
    return res
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const checkUserPermission = async (_: any, __: any, ctx: Context) => {

  const {sessionData, sender}: any = ctx.vtex

  if(!sessionData) {
    throw new Error('User not authenticated')
  }

  if(!sender) {
    throw new Error('Sender not available')
  }


  const module = removeVersionFromAppId(sender)
  const user = sessionData?.namespaces?.profile

  const userData:any = await getUserByEmail(_, {email: user.email.value}, ctx)

  if(!userData.length) {
    throw new Error('User not found')
  }

  const userProfile: any = await getProfile(_, {id: userData[0].profileId}, ctx)

  if(!userProfile) {
    throw new Error('Profile not found')
  }

  const currentModule = userProfile.features.find((feature: any) => {
    return feature.module === module
  })

  if(!currentModule) {
    throw new Error(`Profile not found for module ${module}`)
  }

  return currentModule.features
}

