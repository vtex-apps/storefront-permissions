import { getUserById } from '../../Queries/Users'

export class ErrorResponse extends Error {
  public response: {
    status: number
  } = {
    status: 500,
  }
}

export const QUERIES = {
  getB2BSettings: `query Settings {
      getB2BSettings {
        uiSettings {
          clearCart
        }
      }
  }`,
  getCostCenterById: `query Costcenter($id: ID!) {
      getCostCenterById(id: $id) {
        paymentTerms {
          id
          name
        }
        addresses {
          addressId
          addressType
          addressQuery
          postalCode
          country
          receiverName
          city
          state
          street
          number
          complement
          neighborhood
          geoCoordinates
          reference
        }
        phoneNumber
        businessDocument
        stateRegistration
        sellers {
          id
          name
        }
      }
    }`,
  getMarketingTags: `
    query ($costId: ID!) {
      getMarketingTags(costId: $costId){
        tags
      }
    }
  `,
  getOrganizationById: `query Organization($id: ID!){
      getOrganizationById(id: $id){
        name
        tradeName
        status
        priceTables
        salesChannel
        sellers {
          id
          name
        }
        collections {
          id
        }
      }
    }`,
  getOrganizationsByEmail: `query Organizations($email: String!) {
       getOrganizationsByEmail(email: $email){
          id
          organizationStatus
          costId
          orgId
          costCenterName
       }
  }`,
}

export const generateClUser = async ({
  clId,
  phoneNumber,
  businessName,
  businessDocument,
  tradeName,
  isCorporate,
  stateRegistration,
  ctx,
}: {
  clId: string
  phoneNumber: string | null
  businessName: string | null
  businessDocument: string | null
  tradeName: string | null
  isCorporate: boolean
  stateRegistration: string | null
  ctx: Context
}) => {
  const {
    vtex: { logger },
  } = ctx

  if (!clId) {
    return null
  }

  const clUser = await getUserById(null, { id: clId }, ctx).catch((error) => {
    logger.error({ message: 'setProfile.getUserByIdError', error })
  })

  if (!clUser) {
    return null
  }

  if (clUser.isCorporate === null) {
    clUser.isCorporate = false
  }

  if (phoneNumber) {
    clUser.phone = phoneNumber
  }

  if (isCorporate) {
    clUser.isCorporate = true
    clUser.document = null
    clUser.corporateName = businessName
    clUser.corporateDocument = businessDocument
    clUser.stateInscription = stateRegistration
    if (phoneNumber) {
      clUser.corporatePhone = phoneNumber
    }

    if (tradeName) {
      clUser.tradeName = tradeName
    }
  }

  return clUser
}
