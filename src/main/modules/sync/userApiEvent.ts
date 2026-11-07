import { getUserApiData } from '@main/modules/userApi/utils'
import { toMD5 } from './server/utils'
import { serializeUserApiData } from './server/modules/userapi/utils'

// 应用远端激活源期间抑制本地配置事件回推，避免 A/B 双端互相切换
let applyingRemoteSource = false

const getLocalActive = () => {
  const source = global.lx.appSetting['common.apiSource']
  return /^user_api/.test(source) ? source : null
}

/**
 * 应用同步数据携带的激活源选择：
 * - 携带且目标源存在 → 切换
 * - 未携带 → 保持本机选择
 * - 本机激活源已被同步删除 → 回退到剩余的第一个源
 */
const applyApiSource = (apiSource: string | null | undefined, apis: LX.UserApi.UserApiInfo[]) => {
  const currentSource = global.lx.appSetting['common.apiSource']
  let nextSource: string | null = null
  if (apiSource != null && /^user_api/.test(apiSource) && apis.some(api => api.id == apiSource)) {
    nextSource = apiSource
  } else if (/^user_api/.test(currentSource) && !apis.some(api => api.id == currentSource)) {
    nextSource = apis[0]?.id ?? ''
  }
  if (nextSource == null || nextSource == currentSource) return
  applyingRemoteSource = true
  try {
    // 通知渲染层设置变更，渲染层监听到 common.apiSource 变化后会加载对应脚本
    global.lx.event_app.update_config({ 'common.apiSource': nextSource })
  } finally {
    applyingRemoteSource = false
  }
}

export const getUserApiDataMD5 = async(): Promise<string> => {
  const data = await getUserApiData()
  return toMD5(serializeUserApiData(data))
}

export const getLocalUserApiData = async(): Promise<LX.UserApi.UserApiData> => {
  return getUserApiData()
}

export const setLocalUserApiData = async(data: LX.UserApi.UserApiData, apiSource?: string | null) => {
  await global.lx.event_userApi.user_api_data_overwrite(data, true)
  applyApiSource(apiSource, data.apis)
}

// 把服务端下发的细粒度 action 应用到本地数据（server/client 模式共用）
export const handleRemoteUserApiAction = async(action: LX.Sync.UserApi.ActionList) => {
  switch (action.action) {
    case 'user_api_add':
      await global.lx.event_userApi.user_api_add(action.data.api, action.data.script, true)
      break
    case 'user_api_update':
      await global.lx.event_userApi.user_api_update(action.data.api, action.data.script, true)
      break
    case 'user_api_remove': {
      await global.lx.event_userApi.user_api_remove(action.data.ids, true)
      // 当前激活源被同步删除时回退到剩余源
      const data = await getUserApiData()
      applyApiSource(null, data.apis)
      break
    }
    case 'user_api_active': {
      if (action.data.id == null) return
      const data = await getUserApiData()
      if (data.apis.some(api => api.id == action.data.id)) applyApiSource(action.data.id, data.apis)
      break
    }
    case 'user_api_data_overwrite':
      await setLocalUserApiData(action.data, action.data.apiSource ?? null)
      break
    default:
      throw new Error('unknown user api sync action')
  }
}

export const registerUserApiActionEvent = (sendUserApiAction: (action: LX.Sync.UserApi.ActionList) => (void | Promise<void>)) => {
  // 本地增删改直接对应一个增量 action；isRemote 为 true 的事件来自同步应用，忽略以防回声
  const user_api_add = async(apiInfo: LX.UserApi.UserApiInfo, script: string, isRemote: boolean = false) => {
    if (isRemote) return
    await sendUserApiAction({ action: 'user_api_add', data: { api: apiInfo, script } })
  }
  const user_api_update = async(apiInfo: LX.UserApi.UserApiInfo, script?: string, isRemote: boolean = false) => {
    if (isRemote) return
    await sendUserApiAction({ action: 'user_api_update', data: script != null ? { api: apiInfo, script } : { api: apiInfo } })
  }
  const user_api_remove = async(ids: string[], isRemote: boolean = false) => {
    if (isRemote || !ids.length) return
    await sendUserApiAction({ action: 'user_api_remove', data: { ids } })
  }
  const updated_config = async(keys: Array<keyof LX.AppSetting>) => {
    if (applyingRemoteSource || !keys.includes('common.apiSource')) return
    await sendUserApiAction({ action: 'user_api_active', data: { id: getLocalActive() } })
  }

  global.lx.event_userApi.on('user_api_add', user_api_add)
  global.lx.event_userApi.on('user_api_update', user_api_update)
  global.lx.event_userApi.on('user_api_remove', user_api_remove)
  global.lx.event_app.on('updated_config', updated_config)
  return () => {
    global.lx.event_userApi.off('user_api_add', user_api_add)
    global.lx.event_userApi.off('user_api_update', user_api_update)
    global.lx.event_userApi.off('user_api_remove', user_api_remove)
    global.lx.event_app.off('updated_config', updated_config)
  }
}
