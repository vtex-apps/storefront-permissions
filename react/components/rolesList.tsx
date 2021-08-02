/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl, defineMessages } from 'react-intl'
import { useQuery } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Table } from 'vtex.styleguide'

import QUERY_LIST_ROLES from '../queries/ListRoles.gql'

// let deleteId: any = null
const messages = defineMessages({
  name: {
    id: 'admin/storefront-permissions.tab.roles.name.label',
    defaultMessage: 'Role',
  },
  new: {
    id: 'admin/storefront-permissions.tab.new.button',
    defaultMessage: 'New',
  },
  delete: {
    id: 'admin/storefront-permissions.button.delete',
    defaultMessage: 'Delete',
  },
})

const Roles: FC<any & WrappedComponentProps> = ({ intl }: any) => {
  const [state, setState] = useState({
    items: [],
  })

  const { loading, data } = useQuery(QUERY_LIST_ROLES)

  const { navigate, route } = useRuntime()

  const { params } = route

  const { items } = state

  const customSchema = {
    properties: {
      name: {
        title: intl.formatMessage(messages.name),
      },
    },
  }

  if (data?.listRoles && !state.items.length) {
    const newItems: any = data?.listRoles

    if (
      params?.id &&
      !newItems.filter((item: any) => {
        return item.id === params.id
      }).length
    ) {
      newItems.push(params)
    }

    setState({
      ...state,
      items: newItems,
    })
  }

  return (
    <div className="w-100 pt6">
      <Table
        fullWidth
        loading={loading}
        schema={customSchema}
        items={items}
        onRowClick={({ rowData: { id } }: any) => {
          navigate({
            page: 'admin.app.storefront-permissions.roles-edit',
            params: {
              id,
            },
          })
        }}
      />
    </div>
  )
}

export default injectIntl(Roles)
