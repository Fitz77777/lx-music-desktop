import { getUserApiData, getUserApis } from '@main/modules/userApi/utils'
import { toMD5 } from './server/utils'
import { serializeUserApiData } from './server/modules/userapi/utils'


// 应用远端数据期间抑制本地事件对客户端的回推（双向防回声）。
// 用计数而非布尔：并发应用多份远端数据时，先完成的一份不能提前解除抑制。
let remoteApplyingCount = 0
// 最近一次已与远端对齐（发送或接收）的状态签名，用于阻止把相同内容反复推回
let lastSyncedSignature: string | null = null

const getSignature = (data: LX.UserApi.UserApiData) => toMD5(serializeUserApiData(data) + '|' + (data.apiSource ?? ''))

/**
 * 应用同步数据携带的激活源选择：
 * - 携带且目标源存在 → 切换
 * - 未携带 → 保持本机选择
 * - 本机激活源已被同步删除 → 回退到剩余的第一个源
 */
const applyApiSource = (apiSource: string | null | undefined) => {
  const apis = getUserApis()
  const currentSource = global.lx.appSetting['common.apiSource']
  if (apiSource != null && /^user_api/.test(apiSource) && apis.some(api => api.id == apiSource)) {
    if (apiSource != currentSource) {
      // 通知渲染层设置变更，渲染层监听到 common.apiSource 变化后会加载对应脚本
      global.lx.event_app.update_config({ 'common.apiSource': apiSource })
    }
    return
  }
  if (/^user_api/.test(currentSource) && !apis.some(api => api.id == currentSource)) {
    global.lx.event_app.update_config({ 'common.apiSource': apis[0]?.id ?? '' })
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
  remoteApplyingCount++
  try {
    await global.lx.event_userApi.user_api_data_overwrite(data, true)
    applyApiSource(apiSource)
    // 记录应用后的本机状态，避免后续事件把相同内容再推回
    lastSyncedSignature = getSignature(await getUserApiData())
  } finally {
    remoteApplyingCount--
  }
}

export const registerUserApiActionEvent = (sendUserApiAction: (action: LX.Sync.UserApi.ActionList) => (void | Promise<void>)) => {
  const sendLocalData = async() => {
    if (remoteApplyingCount > 0) return
    const data = await getUserApiData()
    const signature = getSignature(data)
    // 与上次已同步状态一致则无需推送（可避免事件抖动/回声造成重复请求）
    if (signature == lastSyncedSignature) return
    lastSyncedSignature = signature
    await sendUserApiAction({ action: 'user_api_data_overwrite', data })
  }

  const user_api_changed = async() => {
    await sendLocalData()
  }
  const updated_config = async(keys: Array<keyof LX.AppSetting>) => {
    // 激活源选择变化也属于需要同步的状态
    if (!keys.includes('common.apiSource')) return
    await sendLocalData()
  }

  global.lx.event_userApi.on('user_api_changed', user_api_changed)
  global.lx.event_app.on('updated_config', updated_config)
  return () => {
    global.lx.event_userApi.off('user_api_changed', user_api_changed)
    global.lx.event_app.off('updated_config', updated_config)
  }
}

export const handleRemoteUserApiAction = async(event: LX.Sync.UserApi.ActionList) => {
  switch (event.action) {
    case 'user_api_data_overwrite':
      // 广播/推送同样应用激活源选择（源存在时）
      await setLocalUserApiData(event.data, event.data.apiSource ?? null)
      break
    default:
      throw new Error('unknown user api sync action')
  }
}
