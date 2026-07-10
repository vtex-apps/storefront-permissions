const SCHEMA_MAJOR = '3'

export const B2B_ROLES_SCHEMA_VERSION = `v${SCHEMA_MAJOR}.0.3`
export const B2B_PROFILES_SCHEMA_VERSION = `v${SCHEMA_MAJOR}.0.2`
export const B2B_USERS_SCHEMA_VERSION = `v${SCHEMA_MAJOR}.1.2`

export default [
  {
    name: 'b2b_roles',
    version: B2B_ROLES_SCHEMA_VERSION,
    body: {
      properties: {
        name: {
          type: 'string',
          title: 'Role Name',
        },
        slug: {
          type: ['null', 'string'],
          title: 'Role Slug',
        },
        locked: {
          type: ['null', 'boolean'],
          title: 'Can delete',
          default: false,
        },
        features: {
          type: 'array',
          items: {
            type: 'object',
          },
          title: 'Features',
        },
      },
      'v-indexed': ['name', 'slug'],
      'v-cache': false,
    },
  },
  {
    name: 'b2b_profiles',
    version: B2B_PROFILES_SCHEMA_VERSION,
    body: {
      properties: {
        roleId: {
          type: 'string',
          title: 'Role ID',
        },
        features: {
          type: 'array',
          items: {
            type: 'string',
          },
          title: 'Features',
        },
      },
      'v-indexed': ['roleId'],
      'v-cache': false,
    },
  },
  {
    name: 'b2b_users',
    version: B2B_USERS_SCHEMA_VERSION,
    body: {
      properties: {
        roleId: {
          type: 'string',
          title: 'Role ID',
        },
        name: {
          type: 'string',
          title: 'Name',
        },
        email: {
          type: 'string',
          title: 'Email',
        },
        userId: {
          type: ['null', 'string'],
          title: 'User ID',
        },
        clId: {
          type: ['null', 'string'],
          title: 'CL ID',
        },
        orgId: {
          type: ['null', 'string'],
          title: 'Organization ID',
        },
        costId: {
          type: ['null', 'string'],
          title: 'Cost Center ID',
        },
        canImpersonate: {
          type: 'boolean',
          title: 'Can impersonate',
        },
        active: {
          type: 'boolean',
          title: 'Current Profile active',
        },
        selectedPriceTable: {
          type: ['null', 'string'],
          title: 'Selected Price Table',
        },
      },
      'v-immediate-indexing': true,
      'v-indexed': [
        'userId',
        'clId',
        'roleId',
        'orgId',
        'costId',
        'email',
        'name',
        'canImpersonate',
        'active',
        'selectedPriceTable',
      ],
      'v-cache': false,
    },
  },
]
