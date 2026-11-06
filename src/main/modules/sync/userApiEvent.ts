import { getUserApiData } from '@main/modules/userApi/utils'
import { toMD5 } from './server/utils'
import { serializeUserApiData } from './server/modules/userapi/utils'


// 应用远端数据期间抑制本地事件对客户端的回推（双向防回声）
let isRemoteApplying = false

export const getUserApiDataMD5 = async(): Promise<string> => {
  const data = await getUserApiData()
  return toMD5(serializeUserApiData(data))
}

export const getLocalUserApiData = async(): Promise<LX.UserApi.UserApiData> => {
  return getUserApiData()
}

export const setLocalUserApiData = async(data: LX.UserApi.UserApiData, apiSource?: string | null) => {
  isRemoteApplying = true
  try {
    await global.lx.event_userApi.user_api_data_overwrite(data, true)

    // 完全覆盖类同步流程携带的激活源：目标脚本存在于同步数据中时跟随远端选择
    if (apiSource != null && /^user_api/.test(apiSource) && data.apis.some(api => api.id == apiSource)) {
      if (apiSource != global.lx.appSetting['common.apiSource']) {
        global.lx.event_app.update_config({ 'common.apiSource': apiSource })
      }
    }
  } finally {
    isRemoteApplying = false
  }
}

export const registerUserApiActionEvent = (sendUserApiAction: (action: LX.Sync.UserApi.ActionList) => (void | Promise<void>)) => {
  const user_api_changed = async() => {
    if (isRemoteApplying) return
    await sendUserApiAction({
      action: 'user_api_data_overwrite',
      data: await getUserApiData(),
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
