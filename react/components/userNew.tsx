/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl, defineMessages } from 'react-intl'
import { useQuery, useMutation, useLazyQuery } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import {
  Input,
  Button,
  Dropdown,
  Toggle,
  AutocompleteInput,
} from 'vtex.styleguide'

import GET_ROLES from '../queries/ListRoles.gql'
import SEARCH_USERS from '../queries/SearchUsers.gql'
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
    id: 'admin/storefront-permissions.button.save',
    defaultMessage: 'Save',
  },
})

let _timeout: any = null

const UserNew: FC<any & WrappedComponentProps> = ({ intl }) => {
  const { navigate } = useRuntime()
  const [state, setState] = useState<any>({
    id: null,
    roleId: null,
    name: null,
    email: null,
    canImpersonate: false,
  })

  const [term, setTerm] = useState('')

  const { loading: loadingRoles, data: dataRoles } = useQuery(GET_ROLES)
  const [searchUsers, { loading, data: usersData }] = useLazyQuery(SEARCH_USERS)
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
        id: state.id,
        roleId: state.roleId,
        name: state.name,
        email: state.email,
        canImpersonate: state.canImpersonate,
      },
    })
  }

  console.log('usersData =>', usersData)

  const options = {
    onSelect: (args: any) => {
      console.log('onSelect: ', args)

      const selectedUser = usersData.users.find((user: any) => {
        console.log('loop =>', user)

        return user.id === args.value
      })

      console.log('selectedUser =>', selectedUser)

      const { id, firstName, lastName, email } = selectedUser

      setState({
        ...state,
        id,
        name: `${firstName} ${lastName}`,
        email,
      })
    },
    loading,
    value: usersData?.users?.length
      ? usersData.users.map((user: any) => {
          console.log('Values =>', {
            value: user.id,
            label: `${user.firstName} ${user.lastName}<${user.email}>`,
          })

          return {
            value: user.id,
            label: `${user.firstName} ${user.lastName}<${user.email}>`,
          }
        })
      : [],
    // --- This is what makes the Last Searched Terms work!
    // This can be stored anywhere the dev wants. To be persistent, for example.
  }

  const input = {
    onChange: (value: any) => {
      console.log('onChange =>', value)
      setTerm(value)
      clearTimeout(_timeout)
      _timeout = setTimeout(() => {
        searchUsers({
          variables: {
            perPage: 10,
            pageNumber: 0,
            filter: `_where=((email=*${term}* OR firstName=*${term}* OR lastName=*${term}*))`,
          },
        })
      }, 1000)
    },
    // onSearch: (...args: any) => {
    //   searchUsers({
    //     variables: {
    //       perPage: 10,
    //       pageNumber: 1,
    //       filter: term,
    //     },
    //   })
    //   console.log('onSearch:', ...args)
    // },
    onClear: () => setTerm(''),
    placeholder: 'Search user... (e.g.: Ana)',
    value: term,
  }

  return (
    <div className="w-100 pt6">
      <div className="mb5">
        <AutocompleteInput input={input} options={options} />
      </div>
      {!!state.id && (
        <>
          <div className="mb5">
            <Input
              label={intl.formatMessage(messages.name)}
              value={state.name}
              readOnly={!!state.id}
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
              readOnly={!!state.id}
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
        </>
      )}

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
        {!!state.id && (
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
        )}
      </div>
    </div>
  )
}

export default injectIntl(UserNew)
