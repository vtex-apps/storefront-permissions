
import React, { FC } from 'react'
import {
  injectIntl,
  WrappedComponentProps,
  defineMessages,
} from 'react-intl'
import { useQuery} from 'react-apollo'
import { Table } from 'vtex.styleguide'

import QUERY_LIST_USERS from '../queries/ListUsers.gql'


const messages = defineMessages({
  email: {
    id: 'admin/storefront-permissions.tab.users.email.label',
    defaultMessage: 'Email',
  },
  name: {
    id: 'admin/storefront-permissions.tab.users.name.label',
    defaultMessage: 'Name',
  },
})

const Users: FC<any & WrappedComponentProps> = ({
  intl
}: any) => {
  const { loading, data } = useQuery(QUERY_LIST_USERS)


  const customSchema = {
    properties: {
      name: {
        title: intl.formatMessage(messages.name),
      },
      email: {
        title: intl.formatMessage(messages.email),
      },
    },
  }

  const items = data?.listUsers || []

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

export default injectIntl(Users)
