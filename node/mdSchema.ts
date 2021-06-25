export default [
  {
    name: 'b2b_roles',
    version: 'v0.0.2',
    body: {
      properties: {
        name: {
          type: 'string',
          title: 'Role Name',
        },
        features: {
          type: 'array',
          items: {
            type: 'object',
          },
          title: 'Features',
        },
      },
      'v-indexed': ['name'],
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
    version: 'v0.0.5',
    body: {
      properties: {
        roleId: {
          type: 'string',
          title: 'Role ID',
        },
        userId: {
          type: 'string',
          title: 'User ID',
        },
        name: {
          type: 'string',
          title: 'Name',
        },
        email: {
          type: 'string',
          title: 'Email',
        },
        canImpersonate: {
          type: 'boolean',
          title: 'Can impersonate',
        },
      },
      'v-indexed': ['userId', 'roleId', 'email', 'canImpersonate'],
      'v-cache': false,
    },
  },
]
