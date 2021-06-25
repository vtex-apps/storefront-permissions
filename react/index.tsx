/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { InjectedIntlProps } from 'react-intl'
import { FormattedMessage, injectIntl } from 'react-intl'
import { useQuery } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Layout, PageBlock, PageHeader, Tabs, Tab } from 'vtex.styleguide'

import GET_CONFIG from './queries/getAppSettings.gql'

const AdminB2bWaffle: FC<InjectedIntlProps> = (props) => {
  const { navigate, route } = useRuntime()
  const [activeTab, setActiveTab] = useState(route.id)
  const [state, setState] = useState<any>({
    missingConfig: true,
  })

  const setActiveSection = (section: string) => () => {
    const path = `admin.app.storefront-permissions.${section}-list`

    setActiveTab(path)
    navigate({ page: path })
  }

  const { loading } = useQuery(GET_CONFIG, {
    onCompleted: (res: any) => {
      setState({
        ...state,
        missingConfig: res.getAppSettings,
      })
    },
  })

  const isActive = (currTab: string) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_, current] = activeTab.split('admin.app.storefront-permissions')
    const [section] = current.replace('.', '').split('-')

    return currTab === (section || 'users')
  }

  return (
    <Layout
      pageHeader={
        <PageHeader
          title={<FormattedMessage id="admin/storefront-permissions.title" />}
          subtitle={
            <FormattedMessage id="admin/storefront-permissions.description" />
          }
        />
      }
    >
      <PageBlock>
        <>
          <Tabs fullWidth>
            <Tab
              label={
                <FormattedMessage id="admin/storefront-permissions.tab.users" />
              }
              active={isActive('users')}
              onClick={setActiveSection('users')}
              disabled={loading}
            ></Tab>
            <Tab
              label={
                <FormattedMessage id="admin/storefront-permissions.tab.roles" />
              }
              active={isActive('roles')}
              onClick={setActiveSection('roles')}
              disabled={loading}
            ></Tab>
          </Tabs>
          {props.children}
        </>
      </PageBlock>
    </Layout>
  )
}

export default injectIntl(AdminB2bWaffle)
