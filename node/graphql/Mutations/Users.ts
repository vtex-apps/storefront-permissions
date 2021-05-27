import {getUserByEmail} from '../Queries/Users'
import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_users')

export const saveUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm },
  } = ctx


  try {
    const {profileId, canImpersonate, name, email, userId, id} = params

    const checkUser: any = getUserByEmail(_, {email}, ctx)

    if(checkUser.length) {
      return { status: 'error', message: 'User already exists' }
    }

    if(canImpersonate) {
      const saveLM = await lm.saveUser(name, email)
      console.log('saveLM =>', saveLM)
    } else {
      if (userId) {
        const deleteLMRef = lm.deleteUser(userId)
        console.log('deleteLMRef =>', deleteLMRef)
      }
    }


    return null
    const ret = await masterdata.createOrUpdateEntireDocument({dataEntity: config.name, fields: {profileId, userId, canImpersonate, name, email}, id, schema: config.version})

    return { status: 'success', message: '', id: ret.DocumentId }
  } catch (e) {
    return { status: 'error', message: e }
  }
}

export const deleteUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm },
  } = ctx

  const {id, userId} = params
  try {
    await masterdata.deleteDocument({dataEntity: config.name, id})
    if(userId) {
      await lm.deleteUser(userId)
    }
    return { status: 'success', message: '' }
  } catch (e) {
    return { status: 'error', message: e }
  }
}
