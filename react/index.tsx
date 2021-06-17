/* eslint-disable no-console */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { InjectedIntlProps } from 'react-intl'
import { FormattedMessage, injectIntl } from 'react-intl'
import { useQuery } from 'react-apollo'
import {
  Layout,
  PageBlock,
  PageHeader,
  Tabs,
  Tab,
} from 'vtex.styleguide'

import GET_CONFIG from './queries/getAppSettings.gql'
import Users from './components/Users'
import Roles from './components/Roles'

const AdminB2bWaffle: FC<InjectedIntlProps> = () => {
  const [state, setState] = useState<any>({
    currentTab: 1,
    missingConfig: true,
  })

  const {
    currentTab,
  } = state


  const { loading } = useQuery(GET_CONFIG, {
    onCompleted: (res: any) => {
      setState({
        ...state,
        missingConfig: res.getAppSettings,
      })
    },
  })


  const changeTabTo = (current: number) => {
    setState({
      ...state,
      currentTab: current,
    })
  }


  return (
    <Layout
      pageHeader={
        <PageHeader
          title={<FormattedMessage id="admin/storefront-permissions.title" />}
          subtitle={<FormattedMessage id="admin/storefront-permissions.description" />}
        />
      }
    >
      <PageBlock>
        <Tabs fullWidth>
          <Tab
            label={<FormattedMessage id="admin/storefront-permissions.tab.users" />}
            active={currentTab === 1}
            onClick={() => {
              changeTabTo(1)
            }}
          >
            <Users/>
          </Tab>
          <Tab
            label={<FormattedMessage id="admin/storefront-permissions.tab.roles" />}
            active={currentTab === 2}
            onClick={() => {
              changeTabTo(2)
            }}
          >
            <Roles/>
          </Tab>
        </Tabs>
      </PageBlock>
    </Layout>
  )
}

export default injectIntl(AdminB2bWaffle)
