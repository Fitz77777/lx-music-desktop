import { getUserApiData } from '@main/modules/userApi/utils'
import { toMD5 } from './server/utils'
import { serializeUserApiData } from './server/modules/userapi/utils'


// 应用远端数据期间抑制本地事件对客户端的回推（双向防回声）。
// 用计数而非布尔：并发应用多份远端数据时，先完成的一份不能提前解除抑制。
let remoteApplyingCount = 0

export const getUserApiDataMD5 = async(): Promise<string> => {
  const data = await getUserApiData()
  return toMD5(serializeUserApiData(data))
}

export const getLocalUserApiData = async(): Promise<LX.UserApi.UserApiData> => {
  return getUserApiData()
}

export const setLocalUserApiData = async(data: LX.UserApi.UserApiData) => {
  remoteApplyingCount++
  try {
    await global.lx.event_userApi.user_api_data_overwrite(data, true)
  } finally {
    remoteApplyingCount--
  }
}

export const registerUserApiActionEvent = (sendUserApiAction: (action: LX.Sync.UserApi.ActionList) => (void | Promise<void>)) => {
  const user_api_changed = async() => {
    if (remoteApplyingCount > 0) return
    const data = await getUserApiData()
    // 本地变更推送不携带激活源选择，避免把本机选择传播到其他设备
    await sendUserApiAction({
      action: 'user_api_data_overwrite',
      data: { ...data, apiSource: null },
    })
  }

  global.lx.event_userApi.on('user_api_changed', user_api_changed)
  return () => {
    global.lx.event_userApi.off('user_api_changed', user_api_changed)
  }
}

export const handleRemoteUserApiAction = async(event: LX.Sync.UserApi.ActionList) => {
  switch (event.action) {
    case 'user_api_data_overwrite':
      await setLocalUserApiData(event.data)
      break
    default:
      throw new Error('unknown user api sync action')
  }
}
