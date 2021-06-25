/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl, defineMessages } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Input, Button, Dropdown, Toggle } from 'vtex.styleguide'

import GET_USER from '../queries/getUser.gql'
import GET_ROLES from '../queries/ListRoles.gql'
import SAVE_USER from '../mutations/saveUser.gql'

const messages = defineMessages({
  role: {
    id: 'admin/storefront-permissions.tab.roles.name.label',
    defaultMessage: 'Role',
  },
  canImpersonate: {
    id: 'admin/storefront-permissions.tab.users.canImpersonate.label',
    defaultMessage: 'Can impersonate',
  },
  name: {
    id: 'admin/storefront-permissions.tab.users.name.label',
    defaultMessage: 'Name',
  },
  email: {
    id: 'admin/storefront-permissions.tab.users.email.label',
    defaultMessage: 'Email',
  },
  required: {
    id: 'admin/storefront-permissions.required',
    defaultMessage: 'Required',
  },
  cancel: {
    id: 'admin/storefront-permissions.button.cancel',
    defaultMessage: 'Cancel',
  },
  save: {
    id: 'admin/storefront-permissions.button.delete',
    defaultMessage: 'Delete',
  },
})

const UserEdit: FC<any & WrappedComponentProps> = ({ intl }) => {
  const { navigate, route } = useRuntime()
  const [saveUser, { loading: saveUserLoading }] = useMutation(SAVE_USER, {
    onCompleted: () => {
      navigate({
        page: 'admin.app.storefront-permissions.users-list',
        fetchPage: true,
      })
    },
  })

  const [state, setState] = useState<any>({
    id: null,
    roleId: null,
    userId: null,
    name: null,
    email: null,
    canImpersonate: false,
  })

  const { loading } = useQuery(GET_USER, {
    skip: !route?.params?.id,
    variables: {
      id: route?.params?.id,
    },
    fetchPolicy: 'network-only',
    onCompleted: (res: any) => {
      setState({
        ...state,
        ...res.getUser,
      })
    },
  })

  const { loading: loadingRoles, data: dataRoles } = useQuery(GET_ROLES)

  const handleSaveUser = () => {
    saveUser({
      variables: {
        id: state.id,
        userId: state.userId,
        roleId: state.roleId,
        name: state.name,
        email: state.email,
        canImpersonate: state.canImpersonate,
      },
    })
  }

  return (
    <div className="w-100 pt6">
      <div className="mb5">
        <Input
          label={intl.formatMessage(messages.name)}
          value={state.name}
          disabled={loading}
          errorMessage={
            state.name === '' ? intl.formatMessage(messages.required) : ''
          }
          onChange={(e: any) => {
            setState({ ...state, name: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        <Input
          label={intl.formatMessage(messages.email)}
          value={state.email}
          disabled={loading}
          errorMessage={
            state.email === '' ? intl.formatMessage(messages.required) : ''
          }
          onChange={(e: any) => {
            setState({ ...state, email: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        <Dropdown
          label={intl.formatMessage(messages.role)}
          disabled={loadingRoles || loading}
          options={
            dataRoles?.listRoles?.map((role: any) => {
              return {
                value: role.id,
                label: role.name,
              }
            }) ?? []
          }
          value={state.roleId}
          onChange={(_: any, v: any) => {
            setState({ ...state, roleId: v })
          }}
        />
      </div>

      <div className="mb5">
        <Toggle
          label={intl.formatMessage(messages.canImpersonate)}
          size="large"
          checked={state.canImpersonate}
          onChange={() => {
            setState({ ...state, canImpersonate: !state.canImpersonate })
          }}
        />
      </div>

      <div className="mv4 flex justify-between">
        <Button
          variation="tertiary"
          disabled={loading}
          collapseLeft
          onClick={() => {
            navigate({ page: 'admin.app.storefront-permissions.users-list' })
          }}
        >
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button
          variation="primary"
          disabled={loading || saveUserLoading || !state.name || !state.email}
          collapseRight
          onClick={() => {
            handleSaveUser()
          }}
        >
          {intl.formatMessage(messages.save)}
        </Button>
      </div>
    </div>
  )
}

export default injectIntl(UserEdit)
