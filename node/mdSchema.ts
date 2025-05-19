export default [
  {
    name: 'b2b_roles',
    version: 'v0.0.3',
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
    version: 'v0.0.2',
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
    version: 'v0.1.2',
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
        'canImpersonate',
        'active',
        'selectedPriceTable',
      ],
      'v-cache': false,
    },
  },
]
