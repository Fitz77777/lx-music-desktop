import { SYNC_CLOSE_CODE } from '@common/constants_sync'
import { registerUserApiActionEvent } from '@main/modules/sync/userApiEvent'

let unregisterLocalUserApiAction: (() => void) | null

export const registerEvent = (socket: LX.Sync.Client.Socket) => {
  unregisterEvent()
  unregisterLocalUserApiAction = registerUserApiActionEvent((action) => {
    if (!socket.moduleReadys?.userApi) return
    void socket.remoteQueueUserApi.onUserApiSyncAction(action).catch(err => {
      // TODO send status
      socket.moduleReadys.userApi = false
      socket.close(SYNC_CLOSE_CODE.failed)
      console.log(err.message)
    })
  })
}

export const unregisterEvent = () => {
  unregisterLocalUserApiAction?.()
  unregisterLocalUserApiAction = null
}
