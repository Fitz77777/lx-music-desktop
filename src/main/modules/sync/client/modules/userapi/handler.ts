// 这个文件导出的方法将暴露给服务端调用，第一个参数固定为当前 socket 对象
import { handleRemoteUserApiAction, getLocalUserApiData, setLocalUserApiData, getUserApiDataMD5 } from '@main/modules/sync/userApiEvent'
import { removeSelectModeListener, sendCloseSelectMode, sendSelectMode } from '@main/modules/winMain'
import log from '@main/modules/sync/log'
import { registerEvent, unregisterEvent } from './localEvent'

const logInfo = (eventName: string, success = false) => {
  log.info(`[${eventName}]${eventName.replace('userApi:sync:user_api_sync_', '').replaceAll('_', ' ')}${success ? ' success' : ''}`)
}

const getSyncMode = async(socket: LX.Sync.Client.Socket): Promise<LX.Sync.UserApi.SyncMode> => new Promise((resolve, reject) => {
  const handleDisconnect = (err: Error) => {
    sendCloseSelectMode()
    removeSelectModeListener()
    reject(err)
  }
  let removeEventClose = socket.onClose(handleDisconnect)
  sendSelectMode(socket.data.keyInfo.serverName, 'userApi', (mode) => {
    if (mode == null) {
      reject(new Error('cancel'))
      return
    }
    resolve(mode)
    removeSelectModeListener()
    removeEventClose()
  })
})

const handler: LX.Sync.ClientSyncHandlerUserApiActions<LX.Sync.Client.Socket> = {
  async onUserApiSyncAction(socket, action) {
    if (!socket.moduleReadys?.userApi) return
    await handleRemoteUserApiAction(action)
  },

  async user_api_sync_get_md5(socket) {
    logInfo('userApi:sync:user_api_sync_get_md5')
    return getUserApiDataMD5()
  },

  async user_api_sync_get_sync_mode(socket) {
    return getSyncMode(socket)
  },

  async user_api_sync_get_list_data(socket) {
    logInfo('userApi:sync:user_api_sync_get_list_data')
    return getLocalUserApiData()
  },

  async user_api_sync_set_list_data(socket, data) {
    logInfo('userApi:sync:user_api_sync_set_list_data')
    // 协商 set 流程（完全覆盖类）应用远端激活源；广播推送的 data 同样可携带选择
    await setLocalUserApiData(data, data.apiSource ?? null)
  },

  async user_api_sync_finished(socket) {
    logInfo('userApi:sync:finished')
    socket.moduleReadys.userApi = true
    registerEvent(socket)
    socket.onClose(() => {
      unregisterEvent(socket)
    })
  },
}

export default handler
