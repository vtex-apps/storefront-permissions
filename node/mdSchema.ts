export default [
  {
    name: 'b2b_roles',
    version: 'v0.0.1',
    body: {
      properties: {
        name: {
          type: 'string',
          title: 'Role Name',
        },
      },
      'v-indexed': ['name'],
      'v-cache': false,
    }
  },
  {
    name: 'b2b_profiles',
    version: 'v0.0.1',
    body: {
      properties: {
        roleId: {
          type: 'string',
          title: 'Role ID',
        },
        scoped: {
          type: 'boolean',
          title: 'Scoped access',
        },
        features: {
          type: 'array',
          title: 'Features',
        },
      },
      'v-indexed': ['roleId'],
      'v-cache': false,
    }
  },
  {
    name: 'b2b_users',
    version: 'v0.0.3',
    body: {
      properties: {
        profileId: {
          type: 'string',
          title: 'Profile ID',
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
      'v-indexed': ['userId','profileId','email','canImpersonate'],
      'v-cache': false,
    }
  },
  {
    name: 'b2b_features',
    version: 'v0.0.2',
    body: {
      properties: {
        module: {
          type: 'string',
          title: 'Module name',
        },
        features: {
          type: 'array',
          title: 'List of available features',
        },
        hash: {
          type: 'string',
          title: 'Hash',
        },
      },
      'v-indexed': ['module','hash'],
      'v-cache': false,
    }
  }
]
