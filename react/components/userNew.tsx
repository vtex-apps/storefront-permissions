/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl, defineMessages } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Input, Button, Dropdown, Toggle } from 'vtex.styleguide'

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

const UserNew: FC<any & WrappedComponentProps> = ({ intl }) => {
  const { navigate } = useRuntime()
  const [state, setState] = useState<any>({
    roleId: null,
    name: null,
    email: null,
    canImpersonate: false,
  })

  const { loading: loadingRoles, data: dataRoles } = useQuery(GET_ROLES)
  const [saveUser, { loading: saveUserLoading }] = useMutation(SAVE_USER, {
    onCompleted: (res: any) => {
      navigate({
        page: 'admin.app.storefront-permissions.users-list',
        fetchPage: true,
        params: {
          ...state,
          id: res.saveUser.id,
        },
      })
    },
  })

  const handleSaveUser = () => {
    saveUser({
      variables: {
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
          errorMessage={
            state.name === '' ? intl.formatMessage(messages.required) : ''
          }
          disabled={loadingRoles || saveUserLoading}
          onChange={(e: any) => {
            setState({ ...state, name: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        <Input
          label={intl.formatMessage(messages.email)}
          value={state.email}
          errorMessage={
            state.email === '' ? intl.formatMessage(messages.required) : ''
          }
          disabled={loadingRoles || saveUserLoading}
          onChange={(e: any) => {
            setState({ ...state, email: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        <Dropdown
          label={intl.formatMessage(messages.role)}
          disabled={loadingRoles || saveUserLoading}
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
          disabled={loadingRoles || saveUserLoading}
          checked={state.canImpersonate}
          onChange={() => {
            setState({ ...state, canImpersonate: !state.canImpersonate })
          }}
        />
      </div>

      <div className="mv4 flex justify-between">
        <Button
          variation="tertiary"
          disabled={loadingRoles || saveUserLoading}
          collapseLeft
          onClick={() => {
            navigate({ page: 'admin.app.storefront-permissions.users-list' })
          }}
        >
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button
          variation="primary"
          disabled={
            loadingRoles || saveUserLoading || !state.name || !state.email
          }
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

export default injectIntl(UserNew)
