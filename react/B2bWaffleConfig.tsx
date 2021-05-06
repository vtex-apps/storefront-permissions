/* eslint-disable no-console */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { InjectedIntlProps } from 'react-intl'
import { FormattedMessage, defineMessages, injectIntl } from 'react-intl'
import { useMutation, useQuery, useLazyQuery } from 'react-apollo'
import {
  Layout,
  PageBlock,
  PageHeader,
  Input,
  Button,
  Alert,
  Tabs,
  Tab,
  Dropdown,
  Toggle,
  Table,
} from 'vtex.styleguide'

import saveMutation from './mutations/saveConfiguration.gql'
import saveDefaultsMutation from './mutations/saveDefaultsConfiguration.gql'
import processItemMutation from './mutations/processItem.gql'
import removeItemMutation from './mutations/removeItem.gql'
import GET_CONFIG from './queries/getAppSettings.gql'
import GET_SHOPS from './queries/getShops.gql'
import GET_REGISTERS from './queries/getRegisters.gql'
import GET_EMPLOYEES from './queries/getEmployees.gql'
import GET_QUEUE from './queries/getQueue.gql'

import './styles.global.css'

let timeout: any = null

const messages: any = defineMessages({
  success: {
    id: 'admin/b2b-waffle.alert.success',
    defaultMessage: 'Saved successfully',
  },
  error: {
    id: 'admin/b2b-waffle.alert.error',
    defaultMessage: "Couldn't save",
  },
  errorLabel: {
    id: 'admin/b2b-waffle.queue.error',
    defaultMessage: 'Error',
  },
  processingLabel: {
    id: 'admin/b2b-waffle.queue.processing',
    defaultMessage: 'Processing',
  },
  viewOrder: {
    id: 'admin/b2b-waffle.queue.viewOrder',
    defaultMessage: 'View Order',
  },
  reprocessLabel: {
    id: 'admin/b2b-waffle.queue.reprocess',
    defaultMessage: 'Reprocess order',
  },
  orderLabel: {
    id: 'admin/b2b-waffle.queue.orderLabel',
    defaultMessage: 'Order',
  },
  statusLabel: {
    id: 'admin/b2b-waffle.queue.statusLabel',
    defaultMessage: 'Status',
  },
  detailLabel: {
    id: 'admin/b2b-waffle.queue.detailLabel',
    defaultMessage: 'Label',
  },
  emptyLabel: {
    id: 'admin/b2b-waffle.queue.emptyLabel',
    defaultMessage: 'There are no items on the Queue',
  },
  emptyMessage: {
    id: 'admin/b2b-waffle.queue.emptyMessage',
    defaultMessage: 'Items only last on the Queue for 24 hours',
  },
  refresh: {
    id: 'admin/b2b-waffle.queue.refresh',
    defaultMessage: 'Refresh',
  },
  shopLabel: {
    id: 'admin/b2b-waffle.defaults.shopLabel',
    defaultMessage: 'Shop',
  },
  shopError: {
    id: 'admin/b2b-waffle.defaults.shopError',
    defaultMessage: 'Error loading Shops',
  },
  registerLabel: {
    id: 'admin/b2b-waffle.defaults.registerLabel',
    defaultMessage: 'Register',
  },
  registerError: {
    id: 'admin/b2b-waffle.defaults.registerError',
    defaultMessage: 'Error loading Registers',
  },
  employeeLabel: {
    id: 'admin/b2b-waffle.defaults.employeeLabel',
    defaultMessage: 'Employee',
  },
  employeeError: {
    id: 'admin/b2b-waffle.defaults.employeeError',
    defaultMessage: 'Error loading Employees',
  },
  remove: {
    id: 'admin/b2b-waffle.queue.remove',
    defaultMessage: 'Remove item',
  },
  confirm: {
    id: 'admin/b2b-waffle.queue.confirm',
    defaultMessage: 'Confirm removing this item?',
  },
  yes: {
    id: 'admin/b2b-waffle.queue.yes',
    defaultMessage: 'Yes',
  },
  cancel: {
    id: 'admin/b2b-waffle.queue.cancel',
    defaultMessage: 'Cancel',
  },
})

let deleteId: any = null

const Adminb2b-waffle: FC<InjectedIntlProps> = ({ intl }) => {
  const [state, setState] = useState<any>({
    currentTab: 1,
    missingConfig: true,
    submit: false,
    accountID: null,
    clientID: null,
    clientSecret: null,
    refreshToken: null,
    shopID: null,
    employeeID: null,
    registerID: null,
    queueItems: [],
  })

  const {
    currentTab,
    missingConfig,
    submit,
    accountID,
    clientID,
    clientSecret,
    refreshToken,
    shopID,
    employeeID,
    registerID,
    queueItems,
  } = state

  const [saveConfig, { loading: loadingSave, called: calledSave, error: errorSave, data: saveData }] = useMutation(
    saveMutation
  )

  const [processItem] = useMutation(processItemMutation)

  const [
    saveDefaults,
    { loading: loadingSaveDefaults, called: calledSaveDefaults, error: errorSaveDefaults },
  ] = useMutation(saveDefaultsMutation)

  const [removeItem, { called: deleteCalled, loading: deleteLoading, error: deleteError }] = useMutation(
    removeItemMutation
  )

  const { loading } = useQuery(GET_CONFIG, {
    skip: loadingSave || !!clientID,
    onCompleted: (res: any) => {
      setState({
        ...state,
        missingConfig: !(
          res.getAppSettings?.accountID &&
          res.getAppSettings?.clientID &&
          res.getAppSettings?.clientSecret &&
          res.getAppSettings?.refreshToken
        ),
        ...res.getAppSettings,
      })
    },
  })

  const [getQueue, { data: queueData, loading: queueLoading, called: queueCalled }] = useLazyQuery(GET_QUEUE, {
    fetchPolicy: 'no-cache',
  })

  const { data: shops, loading: shopsLoading, error: shopsError } = useQuery(GET_SHOPS)

  const { data: registers, loading: registersLoading, error: registersError } = useQuery(GET_REGISTERS)

  const { data: employees, loading: employeesLoading, error: employeesError } = useQuery(GET_EMPLOYEES)

  if (calledSave && !loadingSave && !errorSave) {
    window.location.reload()
  }

  const handleChange = (value: string, key: string) => {
    setState({
      ...state,
      [key]: value,
    })
  }

  const handleSave = () => {
    saveConfig({
      variables: {
        submit,
        accountID,
        clientID,
        clientSecret,
        refreshToken,
      },
    })
  }

  const handleSaveDefaults = () => {
    saveDefaults({
      variables: {
        shopID,
        registerID,
        employeeID,
      },
    })
  }

  const changeTabTo = (current: number) => {
    setState({
      ...state,
      currentTab: current,
    })
  }

  const defaultSchema = {
    properties: {
      orderId: {
        title: intl.formatMessage(messages.orderLabel),
        width: 160,
      },
      status: {
        title: intl.formatMessage(messages.statusLabel),
        width: 100,
        cellRenderer: ({ rowData }: any) => {
          return (
            <>
              {rowData.error ? intl.formatMessage(messages.errorLabel) : intl.formatMessage(messages.processingLabel)}
            </>
          )
        },
      },
      detail: {
        title: intl.formatMessage(messages.detailLabel),
        cellRenderer: ({ rowData }: any) => {
          return (
            <>
              {rowData.error !== ''
                ? rowData.error
                : rowData.steps.find((item: any) => {
                    return item.complete === false
                  })?.name}
            </>
          )
        },
      },
    },
  }

  const lineActions = [
    {
      label: () => intl.formatMessage(messages.viewOrder),
      onClick: ({ rowData }: any) => {
        window.open(`/admin/checkout/#/orders/${rowData.orderId}`, '_blank')
      },
    },
    {
      label: ({ rowData }: any) => `${intl.formatMessage(messages.reprocessLabel)} ${rowData.orderId}`,
      // eslint-disable-next-line no-alert
      onClick: ({ rowData }: any) => {
        processItem({
          variables: {
            orderId: rowData.orderId,
          },
        }).then(() => {
          getQueue()
        })
      },
    },
    {
      label: ({ rowData }: any) => `${intl.formatMessage(messages.remove)} ${rowData.orderId}`,
      isDangerous: true,
      onClick: ({ rowData }: any) => {
        // eslint-disable-next-line no-alert
        if (window.confirm(`${intl.formatMessage(messages.confirm)}`)) {
          deleteId = rowData.id

          removeItem({
            variables: {
              id: rowData.id,
            },
          })
        }
      },
    },
  ]

  if (!queueCalled) {
    getQueue()
  }

  if (!queueItems.length && queueData?.getQueue && queueData?.getQueue.length) {
    setState({
      ...state,
      queueItems: queueData.getQueue,
    })
  }

  console.log('queueData =>', queueData)

  clearTimeout(timeout)
  timeout = setTimeout(() => {
    getQueue()
  }, 60000)

  if (deleteCalled && !deleteLoading && !deleteError) {
    if (deleteId !== null) {
      setState({
        ...state,
        queueItems: state.queueItems.filter((item: any) => {
          return item.id !== deleteId
        }),
      })
      deleteId = null
    }
  }

  if (!missingConfig && !(shopID && registerID && employeeID) && currentTab !== 3) {
    setState({
      ...state,
      currentTab: 3,
    })
  }

  console.log('Missing Config =>', missingConfig)

  return (
    <Layout
      pageHeader={
        <PageHeader
          title={<FormattedMessage id="admin/b2b-waffle.title" />}
          subtitle={<FormattedMessage id="admin/b2b-waffle.description" />}
        />
      }
    >
      <PageBlock>
        <Tabs fullWidth>
          <Tab
            label={<FormattedMessage id="admin/b2b-waffle.queue.title" />}
            active={!missingConfig && currentTab === 1}
            disabled={missingConfig}
            onClick={() => {
              changeTabTo(1)
            }}
          >
            <div className="w-100 mt6">
              <Table
                fullWidth
                updateTableKey={`LS-${queueItems.length ? queueItems[0].updatedIn : new Date().getTime()}`}
                schema={defaultSchema}
                items={queueItems}
                lineActions={lineActions}
                loading={queueLoading}
                emptyStateLabel={intl.formatMessage(messages.emptyLabel)}
                emptyStateChildren={
                  <React.Fragment>
                    <div className="pt5">
                      <p>{intl.formatMessage(messages.emptyMessage)}</p>
                      <Button
                        variation="secondary"
                        size="small"
                        onClick={() => {
                          getQueue()
                        }}
                      >
                        <span className="flex align-baseline">{intl.formatMessage(messages.refresh)}</span>
                      </Button>
                    </div>
                  </React.Fragment>
                }
              />
            </div>
          </Tab>
          <Tab
            label={<FormattedMessage id="admin/b2b-waffle.configuration.title" />}
            active={missingConfig || currentTab === 2}
            onClick={() => {
              changeTabTo(2)
            }}
          >
            <div className="w-100 mt6">
              <div className="mb5">
                <Input
                  type="text"
                  value={accountID}
                  required
                  disabled={loadingSave || loading}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleChange(e.target.value, 'accountID')
                  }}
                  label={<FormattedMessage id="admin/b2b-waffle.configuration.accountID" />}
                />
              </div>
              <div className="mb5">
                <Input
                  type="text"
                  value={clientID}
                  required
                  disabled={loadingSave || loading}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleChange(e.target.value, 'clientID')
                  }}
                  label={<FormattedMessage id="admin/b2b-waffle.configuration.clientID" />}
                />
              </div>
              <div className="mb5">
                <Input
                  type="text"
                  value={clientSecret}
                  required
                  disabled={loadingSave || loading}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleChange(e.target.value, 'clientSecret')
                  }}
                  label={<FormattedMessage id="admin/b2b-waffle.configuration.clientSecret" />}
                />
              </div>
              <div className="mb5">
                <Input
                  type="text"
                  value={refreshToken}
                  required
                  disabled={loadingSave || loading}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    handleChange(e.target.value, 'refreshToken')
                  }}
                  label={<FormattedMessage id="admin/b2b-waffle.configuration.refreshToken" />}
                />
              </div>
              <div className="mb5">
                <Toggle
                  label={<FormattedMessage id="admin/b2b-waffle.configuration.submit" />}
                  disabled={loadingSave || loading}
                  size="large"
                  checked={submit}
                  onChange={() =>
                    setState(() => ({
                      ...state,
                      submit: !submit,
                    }))
                  }
                />
              </div>
              <div className="mb5">
                <Button
                  size="regular"
                  disabled={!accountID || !clientID || !clientSecret || !refreshToken}
                  isLoading={loadingSave || loading}
                  onClick={handleSave}
                >
                  <FormattedMessage id="admin/b2b-waffle.configuration.saveCredentials" />
                </Button>
              </div>
              {(errorSave ||
                (saveData?.saveAppSettings?.status !== 'conflict' && !loadingSave && calledSave && !errorSave)) && (
                <Alert type={errorSave ? 'error' : 'success'}>
                  {intl.formatMessage(messages[errorSave ? 'error' : 'success'])}
                </Alert>
              )}
            </div>
          </Tab>
          <Tab
            label="Defaults"
            active={!missingConfig && currentTab === 3}
            onClick={() => {
              changeTabTo(3)
            }}
          >
            <div className="w-100 mt6">
              <div className="mv5">
                <p>
                  <FormattedMessage id="admin/b2b-waffle.defaults.headmessage" />
                </p>
              </div>
              <div className="mb5">
                <Dropdown
                  label={intl.formatMessage(messages.shopLabel)}
                  options={shops?.getShops ?? []}
                  value={shopID}
                  disabled={shopsLoading}
                  errorMessage={shopsError ? intl.formatMessage(messages.shopError) : ''}
                  onChange={(_: any, v: any) => {
                    setState({
                      ...state,
                      shopID: v,
                    })
                  }}
                />
              </div>
              <div className="mb5">
                <Dropdown
                  label={intl.formatMessage(messages.registerLabel)}
                  options={registers?.getRegisters ?? []}
                  value={registerID}
                  disabled={registersLoading}
                  errorMessage={registersError ? intl.formatMessage(messages.registerError) : ''}
                  onChange={(_: any, v: any) => {
                    setState({
                      ...state,
                      registerID: v,
                    })
                  }}
                />
              </div>
              <div className="mb5">
                <Dropdown
                  label={intl.formatMessage(messages.employeeLabel)}
                  options={employees?.getEmployees ?? []}
                  value={employeeID}
                  disabled={employeesLoading}
                  errorMessage={employeesError ? intl.formatMessage(messages.employeeError) : ''}
                  onChange={(_: any, v: any) => {
                    setState({
                      ...state,
                      employeeID: v,
                    })
                  }}
                />
              </div>
              <div className="mb5">
                <Button
                  size="regular"
                  disabled={!shopID || !registerID || !employeeID}
                  isLoading={loadingSaveDefaults || loading}
                  onClick={handleSaveDefaults}
                >
                  <FormattedMessage id="admin/b2b-waffle.configuration.saveDefaults" />
                </Button>
              </div>
              {(errorSaveDefaults || (!loadingSaveDefaults && calledSaveDefaults && !errorSaveDefaults)) && (
                <Alert type={errorSaveDefaults ? 'error' : 'success'}>
                  {intl.formatMessage(messages[errorSaveDefaults ? 'error' : 'success'])}
                </Alert>
              )}
            </div>
          </Tab>
        </Tabs>
      </PageBlock>
    </Layout>
  )
}

export default injectIntl(Adminb2b-waffle)
