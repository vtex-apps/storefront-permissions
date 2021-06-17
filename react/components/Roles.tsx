
import React, { FC } from 'react'
import {
  injectIntl,
  WrappedComponentProps,
  defineMessages,
} from 'react-intl'
import { useQuery} from 'react-apollo'
import { Table } from 'vtex.styleguide'

import QUERY_LIST_ROLES from '../queries/ListRoles.gql'


const messages = defineMessages({
  name: {
    id: 'admin/storefront-permissions.tab.roles.name.label',
    defaultMessage: 'Role',
  },
})

const Roles: FC<any & WrappedComponentProps> = ({
  intl
}: any) => {
  const { loading, data } = useQuery(QUERY_LIST_ROLES)


  const customSchema = {
    properties: {
      name: {
        title: intl.formatMessage(messages.name),
      },
    },
  }

  const items = data?.listRoles || []

  return (
    <div className="w-100 pt6">
      <Table
        fullWidth
        loading={loading}
        schema={customSchema}
        items={items}
        toolbar={
          {
            newLine: {
              label: 'New',
              handleCallback: () => alert('handle new line callback'),
            },
          }
        }
      />
    </div>
  )
}

export default injectIntl(Roles)
