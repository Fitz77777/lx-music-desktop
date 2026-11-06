import { SYNC_CLOSE_CODE } from '@common/constants_sync'
import { getUserSpace } from '../../../user'
import { handleRemoteUserApiAction } from '@main/modules/sync/userApiEvent'
import { serializeUserApiData } from '../utils'


const handleUserApiAction = async(userName: string, param: LX.Sync.UserApi.ActionList) => {
  console.log('handleUserApiAction', userName, param.action)
  const userSpace = getUserSpace(userName)
  const before = await userSpace.userApiManage.getUserApiData()
  const beforeSignature = serializeUserApiData(before) + '|' + (before.apiSource ?? '')
  await handleRemoteUserApiAction(param)
  const after = await userSpace.userApiManage.getUserApiData()
  const afterSignature = serializeUserApiData(after) + '|' + (after.apiSource ?? '')
  const key = await userSpace.userApiManage.createSnapshot()
  return { key, changed: beforeSignature != afterSignature }
}
const handler: LX.Sync.ServerSyncHandlerUserApiActions<LX.Sync.Server.Socket> = {
  async onUserApiSyncAction(socket, action) {
    if (!socket.moduleReadys?.userApi) return
    const { key, changed } = await handleUserApiAction(socket.userInfo.name, action)
    console.log('user api action snapshot key', key, 'changed', changed)
    // 幂等去重：数据与激活源都与服务端当前状态一致时直接忽略，避免回声推送
    if (!changed) return
    const currentId = socket.keyInfo.clientId
    socket.broadcast((client) => {
      if (client.keyInfo.clientId == currentId || !client.moduleReadys?.userApi) return
      // 不推进目标设备的快照 key：推送可能被对方忽略（未就绪）或丢失，
      // 由对方下次连接时的 md5 对比决定是否需要基于其旧快照重新合并。
      void client.remoteQueueUserApi.onUserApiSyncAction(action).catch(err => {
        // TODO send status
        client.close(SYNC_CLOSE_CODE.failed)
        console.log(err.message)
      })
    })
  },
}

export default handler
