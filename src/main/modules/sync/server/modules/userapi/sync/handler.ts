import { SYNC_CLOSE_CODE } from '@common/constants_sync'
import { getUserSpace } from '../../../user'
import { handleRemoteUserApiAction } from '@main/modules/sync/userApiEvent'


const handleUserApiAction = async(userName: string, param: LX.Sync.UserApi.ActionList) => {
  console.log('handleUserApiAction', userName, param.action)
  await handleRemoteUserApiAction(param)
  const userSpace = getUserSpace(userName)
  const key = await userSpace.userApiManage.createSnapshot()
  return key
}
const handler: LX.Sync.ServerSyncHandlerUserApiActions<LX.Sync.Server.Socket> = {
  async onUserApiSyncAction(socket, action) {
    if (!socket.moduleReadys?.userApi) return
    const key = await handleUserApiAction(socket.userInfo.name, action)
    console.log('user api action snapshot key', key)
    const userSpace = getUserSpace(socket.userInfo.name)
    const currentId = socket.keyInfo.clientId
    socket.broadcast((client) => {
      if (client.keyInfo.clientId == currentId || !client.moduleReadys?.userApi) return
      void client.remoteQueueUserApi.onUserApiSyncAction(action).then(async() => {
        return userSpace.userApiManage.updateDeviceSnapshotKey(client.keyInfo.clientId, key)
      }).catch(err => {
        // TODO send status
        client.close(SYNC_CLOSE_CODE.failed)
        console.log(err.message)
      })
    })
  },
}

export default handler
