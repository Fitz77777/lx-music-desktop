// import { SYNC_CLOSE_CODE } from '../../../../constants'
import { removeSelectModeListener, sendCloseSelectMode, sendSelectMode } from '@main/modules/winMain'
import { getUserSpace } from '../../../user'
import { getLocalUserApiData, setLocalUserApiData } from '@main/modules/sync/userApiEvent'
import { SYNC_CLOSE_CODE } from '@common/constants_sync'

// let wss: LX.Sync.Server.SocketServer | null
let syncingId: string | null = null
const wait = async(time = 1000) => await new Promise((resolve, reject) => setTimeout(resolve, time))


const getRemoteData = async(socket: LX.Sync.Server.Socket): Promise<LX.UserApi.UserApiData> => {
  console.log('getRemoteData')
  return (await socket.remoteQueueUserApi.user_api_sync_get_list_data()) ?? { apis: [], scripts: {} }
}

const getRemoteDataMD5 = async(socket: LX.Sync.Server.Socket): Promise<string> => {
  return socket.remoteQueueUserApi.user_api_sync_get_md5()
}

const getSyncMode = async(socket: LX.Sync.Server.Socket): Promise<LX.Sync.UserApi.SyncMode> => new Promise((resolve, reject) => {
  const handleDisconnect = (err: Error) => {
    sendCloseSelectMode()
    removeSelectModeListener()
    reject(err)
  }
  const removeEventClose = socket.onClose(handleDisconnect)
  sendSelectMode(socket.keyInfo.deviceName, 'userApi', (mode) => {
    if (mode == null) {
      reject(new Error('cancel'))
      return
    }
    resolve(mode)
    removeSelectModeListener()
    removeEventClose()
  })
})

const finishedSync = async(socket: LX.Sync.Server.Socket) => {
  await socket.remoteQueueUserApi.user_api_sync_finished()
}


const setLocalData = async(socket: LX.Sync.Server.Socket, data: LX.UserApi.UserApiData) => {
  await setLocalUserApiData(data, data.apiSource ?? null)
  const userSpace = getUserSpace(socket.userInfo.name)
  return userSpace.userApiManage.createSnapshot()
}

const overwriteRemoteData = async(socket: LX.Sync.Server.Socket, data: LX.UserApi.UserApiData, key: string, excludeIds: string[] = []) => {
  const action = { action: 'user_api_data_overwrite', data } as const
  const tasks: Array<Promise<void>> = []
  socket.broadcast((client) => {
    if (excludeIds.includes(client.keyInfo.clientId) || client.userInfo?.name != socket.userInfo.name || !client.moduleReadys?.userApi) return
    // 不在此处推进目标设备的快照 key：推送可能因对方未就绪/断线而未真正应用，
    // 让对方在下次连接时通过 md5 对比自愈（checkDataLatest），避免误当作基线合并导致误删。
    tasks.push(client.remoteQueueUserApi.onUserApiSyncAction(action).catch(err => {
      // TODO send status
      client.close(SYNC_CLOSE_CODE.failed)
      console.log(err.message)
    }))
  })
  if (!tasks.length) return
  await Promise.all(tasks)
}

const setRemoteData = async(socket: LX.Sync.Server.Socket, data: LX.UserApi.UserApiData, key: string): Promise<void> => {
  await socket.remoteQueueUserApi.user_api_sync_set_list_data(data)
  const userSpace = getUserSpace(socket.userInfo.name)
  await userSpace.userApiManage.updateDeviceSnapshotKey(socket.keyInfo.clientId, key)
}

/**
 * 按脚本 id 合并两组源数据，id 冲突时 source 方胜出
 */
const mergeData = (sourceData: LX.UserApi.UserApiData, targetData: LX.UserApi.UserApiData): LX.UserApi.UserApiData => {
  const apis: LX.UserApi.UserApiInfo[] = [...sourceData.apis]
  const scripts: Record<string, string> = { ...sourceData.scripts }
  const sourceIds = new Set(apis.map(api => api.id))
  for (const api of targetData.apis) {
    if (sourceIds.has(api.id)) continue
    apis.push(api)
    scripts[api.id] = targetData.scripts[api.id] ?? ''
  }
  return { apis, scripts }
}

/**
 * 三方值选择：与快照相同的一侧视为“未变更”，取另一侧的值；两侧都变更时本机侧胜出
 */
const selectChanged = <T>(snapshot: T | null, local: T, remote: T): T => {
  if (local === remote) return local
  if (snapshot == null) return local
  if (snapshot === local) return remote
  return local
}

/**
 * 基于快照的三路合并：
 * - 仅一侧删除（快照中存在但该侧缺失）→ 删除
 * - 双侧删除或双侧缺失 → 删除
 * - 单侧新增 → 保留
 * - 双侧新增：脚本一致保留，冲突时本机侧胜出
 * - 双侧修改：按变更来源决定，双方都修改时本机侧胜出
 */
const mergeDataFromSnapshot = (localData: LX.UserApi.UserApiData, remoteData: LX.UserApi.UserApiData, snapshot: LX.UserApi.UserApiData | null): LX.UserApi.UserApiData => {
  const removedIds = new Set<string>()
  const localIds = new Set(localData.apis.map(api => api.id))
  const remoteIds = new Set(remoteData.apis.map(api => api.id))
  if (snapshot) {
    // 快照基线中存在的源，只要有一侧已缺失，即视为删除并传播到双方
    for (const api of snapshot.apis) {
      if (!remoteIds.has(api.id) || !localIds.has(api.id)) removedIds.add(api.id)
    }
  }

  const remoteApis = new Map(remoteData.apis.map(api => [api.id, api]))
  const apis: LX.UserApi.UserApiInfo[] = []
  const scripts: Record<string, string> = {}

  for (const api of localData.apis) {
    if (removedIds.has(api.id)) continue
    const remoteApi = remoteApis.get(api.id)
    if (!remoteApi) {
      // 仅本机侧拥有：快照中存在说明远端已删除
      apis.push(api)
      scripts[api.id] = localData.scripts[api.id] ?? ''
      continue
    }
    let snapshotApi: LX.UserApi.UserApiInfo | null = null
    let snapshotScript: string | null = null
    if (snapshot != null) {
      snapshotApi = snapshot.apis.find(snapshotApi => snapshotApi.id == api.id) ?? null
      snapshotScript = snapshot.scripts[api.id] ?? ''
    }
    const localScript = localData.scripts[api.id] ?? ''
    const remoteScript = remoteData.scripts[api.id] ?? ''
    const script = selectChanged(snapshotScript, localScript, remoteScript)
    let info = api
    if (snapshotApi != null && remoteScript != localScript && localScript == snapshotScript) {
      // 仅远端修改了脚本，远端 info 一并胜出
      info = remoteApi
    } else if (snapshotApi != null && remoteScript == localScript && remoteScript != snapshotScript) {
      // 仅远端信息变化：跟随远端 info
      info = selectChanged(snapshotApi, api, remoteApi)
    }
    // 其余情况（双侧新增冲突、双方都修改）：保留本机侧 info
    apis.push(info)
    scripts[api.id] = script
  }

  // 仅远端新增的源
  for (const api of remoteData.apis) {
    if (localIds.has(api.id) || removedIds.has(api.id)) continue
    apis.push(api)
    scripts[api.id] = remoteData.scripts[api.id] ?? ''
  }

  return { apis, scripts }
}

const checkDataLatest = async(socket: LX.Sync.Server.Socket) => {
  const remoteDataMD5 = await getRemoteDataMD5(socket)
  const userSpace = getUserSpace(socket.userInfo.name)
  const userCurrentDataKey = await userSpace.userApiManage.getDeviceCurrentSnapshotKey(socket.keyInfo.clientId)
  const currentDataKey = await userSpace.userApiManage.getCurrentDataKey()
  const latest = remoteDataMD5 == currentDataKey
  if (latest && userCurrentDataKey != currentDataKey) await userSpace.userApiManage.updateDeviceSnapshotKey(socket.keyInfo.clientId, currentDataKey)
  return latest
}

const handleMergeData = async(socket: LX.Sync.Server.Socket): Promise<[LX.UserApi.UserApiData, boolean, boolean]> => {
  const mode: LX.Sync.UserApi.SyncMode = await getSyncMode(socket)

  if (mode == 'cancel') throw new Error('cancel')
  const [remoteData, localData] = await Promise.all([getRemoteData(socket), getLocalUserApiData()])
  let data: LX.UserApi.UserApiData
  let requiredUpdateLocalData = true
  let requiredUpdateRemoteData = true
  switch (mode) {
    case 'merge_local_remote':
      // 合并流程不携带激活源选择（保持设备各自选择）
      data = { ...mergeData(localData, remoteData), apiSource: null }
      break
    case 'merge_remote_local':
      data = { ...mergeData(remoteData, localData), apiSource: null }
      break
    case 'overwrite_local_remote':
    case 'overwrite_remote_local':
    // 普通覆盖模式对自定义源语义退化为合并（源以独立脚本为单位，无“列表内子结构”）
      data = { ...mergeData(localData, remoteData), apiSource: null }
      break
    case 'overwrite_local_remote_full':
      // 完全覆盖保留数据中携带的激活源选择
      data = localData
      requiredUpdateLocalData = false
      break
    case 'overwrite_remote_local_full':
      data = remoteData
      requiredUpdateRemoteData = false
      break
    default: throw new Error('cancel')
  }
  return [data, requiredUpdateLocalData, requiredUpdateRemoteData]
}

const handleSyncData = async(socket: LX.Sync.Server.Socket) => {
  const [remoteData, localData] = await Promise.all([getRemoteData(socket), getLocalUserApiData()])
  const userSpace = getUserSpace(socket.userInfo.name)
  const clientId = socket.keyInfo.clientId
  if (localData.apis.length) {
    if (remoteData.apis.length) {
      const [data, requiredUpdateLocalData, requiredUpdateRemoteData] = await handleMergeData(socket)
      let key
      if (requiredUpdateLocalData) {
        key = await setLocalData(socket, data)
        await overwriteRemoteData(socket, data, key, [clientId])
        if (!requiredUpdateRemoteData) await userSpace.userApiManage.updateDeviceSnapshotKey(clientId, key)
      }
      if (requiredUpdateRemoteData) {
        if (!key) key = await userSpace.userApiManage.getCurrentDataKey()
        await setRemoteData(socket, data, key)
      }
    } else {
      await setRemoteData(socket, localData, await userSpace.userApiManage.getCurrentDataKey())
    }
  } else {
    if (remoteData.apis.length) {
      const key = await setLocalData(socket, remoteData)
      await overwriteRemoteData(socket, remoteData, key, [clientId])
    }
    const key = await userSpace.userApiManage.getCurrentDataKey()
    await userSpace.userApiManage.updateDeviceSnapshotKey(clientId, key)
  }
}

const handleSyncDataFromSnapshot = async(socket: LX.Sync.Server.Socket, snapshot: LX.UserApi.UserApiData | null) => {
  if (await checkDataLatest(socket)) return

  const [remoteData, localData] = await Promise.all([getRemoteData(socket), getLocalUserApiData()])
  const newData = { ...mergeDataFromSnapshot(localData, remoteData, snapshot), apiSource: null }

  const key = await setLocalData(socket, newData)
  const err = await setRemoteData(socket, newData, key).catch(err => err)
  await overwriteRemoteData(socket, newData, key, [socket.keyInfo.clientId])
  if (err) throw err
}

const syncData = async(socket: LX.Sync.Server.Socket) => {
  if (!socket.feature.userApi) throw new Error('userApi feature options not available')
  if (!socket.feature.userApi.skipSnapshot) {
    const user = getUserSpace(socket.userInfo.name)
    const userCurrentDataKey = await user.userApiManage.getDeviceCurrentSnapshotKey(socket.keyInfo.clientId)
    if (userCurrentDataKey) {
      const snapshotData = await user.userApiManage.snapshotDataManage.getSnapshotData(userCurrentDataKey)
      if (snapshotData) {
        console.log('handleSyncDataFromSnapshot')
        await handleSyncDataFromSnapshot(socket, snapshotData)
        return
      }
    }
  }
  await handleSyncData(socket)
}

export const sync = async(socket: LX.Sync.Server.Socket) => {
  let disconnected = false
  socket.onClose(() => {
    disconnected = true
    if (syncingId == socket.keyInfo.clientId) syncingId = null
  })

  while (true) {
    if (disconnected) throw new Error('disconnected')
    if (!syncingId) break
    await wait()
  }

  syncingId = socket.keyInfo.clientId
  // 用户取消同步方式选择不应导致 userApi 功能整体失活（取消仅跳过本次初始合并），
  // 仍然要通知客户端 finished 以便开启后续的实时推送。
  await syncData(socket).catch(err => {
    if (err?.message != 'cancel') throw err
  }).then(async() => {
    await finishedSync(socket)
    socket.moduleReadys.userApi = true
  }).finally(() => {
    syncingId = null
  })
}
