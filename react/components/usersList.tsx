/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl, defineMessages } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import { Table } from 'vtex.styleguide'
import { useRuntime } from 'vtex.render-runtime'

import QUERY_LIST_USERS from '../queries/ListUsers.gql'
import DELETE_USER from '../mutations/deleteUser.gql'

let deleteId: any = null
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

const Users: FC<any & WrappedComponentProps> = ({ intl }: any) => {
  const [state, setState] = useState({
    items: [],
  })

  const { loading, data } = useQuery(QUERY_LIST_USERS, {
    fetchPolicy: 'network-only',
  })

  const [deleteUser, { loading: deleteLoading }] = useMutation(DELETE_USER, {
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

  const { navigate, route } = useRuntime()

  const { params } = route

  const { items } = state

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

  if (data?.listUsers && !state.items.length) {
    const newItems: any = data?.listUsers

    if (
      params?.id &&
      !newItems.filter((item: any) => {
        return item.id === params.id
      }).length
    ) {
      newItems.push(params)
    }

    if (newItems.length) {
      setState({
        ...state,
        items: newItems,
      })
    }
  }

  const lineActions = [
    {
      label: ({ rowData }: any) => `Delete ${rowData.name}`,
      isDangerous: true,
      onClick: ({ rowData }: any) => {
        deleteId = rowData.id
        deleteUser({
          variables: {
            id: rowData.id,
            userId: rowData.userId,
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
            page: 'admin.app.storefront-permissions.users-edit',
            params: {
              id,
            },
          })
        }}
        toolbar={{
          newLine: {
            label: 'New',
            handleCallback: () => {
              navigate({ page: 'admin.app.storefront-permissions.users-new' })
            },
          },
        }}
      />
    </div>
  )
}

export default injectIntl(Users)
