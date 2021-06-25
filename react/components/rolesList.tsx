/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl, defineMessages } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Table } from 'vtex.styleguide'

import QUERY_LIST_ROLES from '../queries/ListRoles.gql'
import DELETE_ROLE from '../mutations/deleteRole.gql'

let deleteId: any = null
const messages = defineMessages({
  name: {
    id: 'admin/storefront-permissions.tab.roles.name.label',
    defaultMessage: 'Role',
  },
})

const Roles: FC<any & WrappedComponentProps> = ({ intl }: any) => {
  const [state, setState] = useState({
    items: [],
  })

  const { loading, data } = useQuery(QUERY_LIST_ROLES)

  const { navigate, route } = useRuntime()

  const [deleteRole, { loading: deleteLoading }] = useMutation(DELETE_ROLE, {
    onCompleted: () => {
      setState({
        ...state,
        items: state.items.filter((item: any) => {
          return item.id !== deleteId
        }),
      })
      deleteId = null
    },
  })

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

  const lineActions = [
    {
      label: ({ rowData }: any) => `Delete ${rowData.name}`,
      isDangerous: true,
      onClick: ({ rowData }: any) => {
        deleteId = rowData.id
        deleteRole({
          variables: {
            id: rowData.id,
          },
        })
      },
    },
  ]

  return (
    <div className="w-100 pt6">
      <Table
        fullWidth
        loading={loading || deleteLoading}
        schema={customSchema}
        items={items}
        lineActions={lineActions}
        onRowClick={({ rowData: { id } }: any) => {
          navigate({
            page: 'admin.app.storefront-permissions.roles-edit',
            params: {
              id,
            },
          })
        }}
        toolbar={{
          newLine: {
            label: 'New',
            handleCallback: () => {
              navigate({ page: 'admin.app.storefront-permissions.roles-new' })
            },
          },
        }}
      />
    </div>
  )
}

export default injectIntl(Roles)
