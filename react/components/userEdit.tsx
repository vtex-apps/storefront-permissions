/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Input, Button, Dropdown, Toggle } from 'vtex.styleguide'

import GET_USER from '../queries/getUser.gql'
import GET_ROLES from '../queries/ListRoles.gql'
import SAVE_USER from '../mutations/saveUser.gql'

const UserEdit: FC<any & WrappedComponentProps> = () => {
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
          label="Name"
          value={state.name}
          disabled={loading}
          errorMessage={state.name === '' ? 'Required' : ''}
          onChange={(e: any) => {
            setState({ ...state, name: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        <Input
          label="Email"
          value={state.email}
          disabled={loading}
          errorMessage={state.email === '' ? 'Required' : ''}
          onChange={(e: any) => {
            setState({ ...state, email: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        <Dropdown
          label="Role"
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
          label="Can impersonate"
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
          Cancel
        </Button>
        <Button
          variation="primary"
          disabled={loading || saveUserLoading || !state.name || !state.email}
          collapseRight
          onClick={() => {
            handleSaveUser()
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

export default injectIntl(UserEdit)
