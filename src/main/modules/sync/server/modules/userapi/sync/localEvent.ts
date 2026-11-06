import { SYNC_CLOSE_CODE } from '@common/constants_sync'
import { registerUserApiActionEvent } from '@main/modules/sync/userApiEvent'
import { getUserSpace } from '../../../user'

// let socket: LX.Sync.Server.Socket | null
let unregisterLocalUserApiAction: (() => void) | null


const sendUserApiAction = async(wss: LX.Sync.Server.SocketServer, action: LX.Sync.UserApi.ActionList) => {
  const userSpace = getUserSpace()
  let key = ''
  for (const client of wss.clients) {
    if (!client.moduleReadys?.userApi) continue
    // eslint-disable-next-line require-atomic-updates
    if (!key) key = await userSpace.userApiManage.createSnapshot()
    void client.remoteQueueUserApi.onUserApiSyncAction(action).then(async() => {
      return userSpace.userApiManage.updateDeviceSnapshotKey(client.keyInfo.clientId, key)
    }).catch(err => {
      // TODO send status
      client.close(SYNC_CLOSE_CODE.failed)
      console.log(err.message)
    })
  }
}

export const registerEvent = (wss: LX.Sync.Server.SocketServer) => {
  unregisterEvent()
  unregisterLocalUserApiAction = registerUserApiActionEvent((action) => {
    void sendUserApiAction(wss, action)
  })
}

export const unregisterEvent = () => {
  unregisterLocalUserApiAction?.()
  unregisterLocalUserApiAction = null
}
