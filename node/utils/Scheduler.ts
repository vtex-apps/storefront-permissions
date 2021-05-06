import { JanusClient } from '@vtex/api'
import type { InstanceOptions, IOContext } from '@vtex/api'

const routes = {
  scheduler: (workspace: string, account: string) => `/api/scheduler/${workspace}/${account}?version=4`,
  getSchedule: (workspace: string, account: string) =>
    `/api/scheduler/${workspace}/${account}/b2b-admin-queue-schedule?version=4`,
}

export class Scheduler extends JanusClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
      },
    })
  }

  public createOrUpdate = (scheduler: any) => {
    return this.http.put(routes.scheduler(this.context.workspace, this.context.account), scheduler, {
      metric: 'b2b-admin-scheduler-createupdate',
    })
  }

  public get = () => {
    return this.http.get(routes.getSchedule(this.context.workspace, this.context.account), {
      metric: 'b2b-admin-scheduler-get',
    })
  }

  public delete = () => {
    return this.http.delete(routes.getSchedule(this.context.workspace, this.context.account), {
      metric: 'b2b-admin-scheduler-delete',
    })
  }
}
