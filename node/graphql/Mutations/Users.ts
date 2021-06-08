import {currentSchema} from '../../utils'
const config: any = currentSchema('b2b_users')

export const saveUser = async (_: any, params: any, ctx: Context) => {
  const {
    clients: { masterdata, lm },
  } = ctx

  console.log('saveUser =>', params)

  try {
    const {profileId, canImpersonate, name, email, userId, id} = params
    let _userId = userId
    if(canImpersonate) {
      console.log('Will save to LM')
      const saveLM: any = await lm.saveUser(name, email).catch((err) => {
        console.log('Error saveLM', err)

      })
      _userId = saveLM.userId
      console.log('saveLM =>', saveLM)
    } else {
      if (userId) {
        const deleteLMRef = await lm.deleteUser(userId).catch((ret) => {
          return ret
        })
        console.log('deleteLMRef =>', deleteLMRef)
      }
    }

    const ret = await masterdata.createOrUpdateEntireDocument({dataEntity: config.name, fields: {profileId, userId: _userId, canImpersonate, name, email}, id, schema: config.version})
    .then((r: any) => {
      return r
    })
    .catch((err: any) => {
      console.log('createOrUpdateEntireDocument =>',err.response.status, err)
      if(err.response.status < 400) {
        return {
          DocumentId: id
        }
      }
      throw err
    })

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
