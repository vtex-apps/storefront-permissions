import { GetOrganizationByEmailBase } from '../../../typings/custom'
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
        name
        organization
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
  getOrganizationsPaginatedByEmail: `query OrganizationsPaginated($email: String!, $page: Int, $pageSize: Int) {
    getOrganizationsPaginatedByEmail(
      email: $email
      page: $page
      pageSize: $pageSize
    ) {
      data {
        id
        organizationStatus
        costId
        orgId
        costCenterName
      }
      pagination {
        page
        pageSize
        total
      }
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

/**
 * Retrieves the `costId` of an organization with a valid cost center for a given email.
 * Performs a paginated search and returns the first `costId` found.
 *
 * @param email - The email associated with the organizations.
 * @param pageSize - The number of records per page (default is 50).
 * @param ctx - The request context containing the organization client.
 * @returns The `costId` if found, otherwise `null`.
 */
export const getCostIdFromOrganizationWithValidCostCenter = async (
  email: string,
  ctx: Context,
  page: number = 1,
  pageSize: number = 50
): Promise<string | null> => {
  const { organizations } = ctx.clients;

  while (true) {
    const response = await organizations.getOrganizationsPaginatedByEmail(email, page, pageSize);
    const { data, pagination } = response?.data?.getOrganizationsPaginatedByEmail || {};
    if (!data?.length) {
      return null;
    }

    const organization = data.find(org => org.costCenterName !== null);
    if (organization) {
      return organization.costId;
    }

    const totalPages = Math.ceil((pagination?.total || 0) / pageSize);
    if (page >= totalPages) {
      break; // Stop iteration if all pages are processed
    }

    page++;
  }

  return null;
};

/**
 * Retrieves an organization with a status that is not 'inactive' for a given email.
 * Performs a paginated search and returns the first matching organization.
 *
 * @param email - The email associated with the organizations.
 * @param pageSize - The number of records per page (default is 50).
 * @param ctx - The request context containing the organization client.
 * @returns The organization if found, otherwise `null`.
 */
export const getOrganizationWithStatusNotInactive = async (
  email: string,
  ctx: Context,
  page: number = 1,
  pageSize: number = 50
): Promise<GetOrganizationByEmailBase | null> => {
  const { organizations } = ctx.clients;

  while (true) {
    const response = await organizations.getOrganizationsPaginatedByEmail(email, page, pageSize);
    const { data, pagination } = response?.data?.getOrganizationsPaginatedByEmail || {};
    if (!data?.length) {
      return null;
    }

    const organization = data.find(org => org.organizationStatus !== 'inactive');
    if (organization) {
      return organization;
    }

    const totalPages = Math.ceil((pagination?.total || 0) / pageSize);
    if (page >= totalPages) {
      break; // Stop iteration if all pages are processed
    }

    page++;
  }

  return null;
};
