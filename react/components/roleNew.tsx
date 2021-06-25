/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FC } from 'react'
import React, { useState } from 'react'
import type { WrappedComponentProps } from 'react-intl'
import { injectIntl } from 'react-intl'
import { useQuery, useMutation } from 'react-apollo'
import { useRuntime } from 'vtex.render-runtime'
import { Input, Button, Divider, Checkbox, Collapsible } from 'vtex.styleguide'

import GET_FEATURES from '../queries/ListFeatures.gql'
import SAVE_ROLE from '../mutations/saveRole.gql'

const RoleNew: FC<any & WrappedComponentProps> = () => {
  const { navigate } = useRuntime()
  const [state, setState] = useState<any>({
    name: null,
    features: [],
    toggle: {},
  })

  const { name, toggle, features } = state
  const {
    loading: loadingFeatures,
    data: dataFeatures,
    called: calledFeatures,
  } = useQuery(GET_FEATURES)

  const [saveRole, { loading: saveRoleLoading }] = useMutation(SAVE_ROLE, {
    onCompleted: (res: any) => {
      navigate({
        page: 'admin.app.storefront-permissions.roles-list',
        fetchPage: true,
        params: {
          id: res.saveRole.id,
          name,
        },
      })
    },
  })

  const handleSaveRole = () => {
    saveRole({
      variables: {
        name,
        features,
      },
    })
  }

  const toggleApp = (app: string) => {
    const newToggle = toggle

    newToggle[app] = !toggle[app]
    setState({
      ...state,
      toggle: newToggle,
    })
  }

  const handleFeature = (module: string, feature: string) => {
    const newFeatures = features
    const hasModule = newFeatures.findIndex((item: any) => {
      return item.module === module
    })

    if (hasModule !== -1) {
      const hasFeature = newFeatures[hasModule].features.indexOf(feature)

      if (hasFeature !== -1) {
        newFeatures[hasModule].features.splice(hasFeature, 1)
      } else {
        newFeatures[hasModule].features.push(feature)
      }
    } else {
      newFeatures.push({
        module,
        features: [feature],
      })
    }

    setState({
      ...state,
      features: newFeatures,
    })
  }

  const checkChecked = (module: string, feature: string) => {
    const hasModule = features.findIndex((item: any) => {
      return item.module === module
    })

    if (hasModule !== -1) {
      const hasFeature = features[hasModule].features.indexOf(feature)

      if (hasFeature !== -1) {
        return true
      }
    }

    return false
  }

  return (
    <div className="w-100 pt6">
      <div className="mb5">
        <Input
          label="Name"
          value={name}
          errorMessage={name === '' ? 'Required' : ''}
          disabled={loadingFeatures || saveRoleLoading}
          onChange={(e: any) => {
            setState({ ...state, name: e.target.value })
          }}
        />
      </div>

      <div className="mb5">
        {!loadingFeatures &&
          calledFeatures &&
          !dataFeatures.listFeatures.length && (
            <div>
              Could't find any apps connected to the Storefront Permissions
            </div>
          )}

        {dataFeatures?.listFeatures?.map((app: any) => {
          return (
            <div key={`key-${app.module}`}>
              <Collapsible
                header={
                  <div className="pv2 hover-c-on-action-secondary">
                    {app.name}
                  </div>
                }
                onClick={() => {
                  toggleApp(app.module)
                }}
                isOpen={!!toggle[app.module]}
              >
                <div className="pb2">
                  {app.features.map((feature: any) => {
                    return (
                      <div
                        key={`option-${app.module}-${feature.value}`}
                        className="pv2"
                      >
                        <Checkbox
                          checked={checkChecked(app.module, feature.value)}
                          id={`option-${app.module}-${feature.value}`}
                          label={feature.label}
                          name="default-checkbox-group"
                          onChange={() => {
                            handleFeature(app.module, feature.value)
                          }}
                          value={feature.value}
                        />
                      </div>
                    )
                  })}
                </div>
              </Collapsible>
              <div className="mv2">
                <Divider orientation="horizontal" />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mv4 flex justify-between">
        <Button
          variation="tertiary"
          disabled={loadingFeatures || saveRoleLoading}
          collapseLeft
          onClick={() => {
            navigate({ page: 'admin.app.storefront-permissions.roles-list' })
          }}
        >
          Cancel
        </Button>
        <Button
          variation="primary"
          disabled={loadingFeatures || saveRoleLoading || !state.name}
          collapseRight
          onClick={() => {
            handleSaveRole()
          }}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

export default injectIntl(RoleNew)
