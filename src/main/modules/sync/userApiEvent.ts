import { getUserApiData } from '@main/modules/userApi/utils'
import { toMD5 } from './server/utils'
import { serializeUserApiData } from './server/modules/userapi/utils'


// 应用远端数据期间抑制本地事件对客户端/服务端的回推（双向防回声）。
// 用计数而非布尔：并发应用多份远端数据时，先完成的一份不能提前解除抑制。
let remoteApplyingCount = 0

interface SyncState {
  apis: Map<string, LX.UserApi.UserApiInfo>
  scripts: Map<string, string>
  active: string | null
}
// 最近一次已知的本地同步状态：本地事件触发时与它做 diff，只发送增量
let lastSyncState: SyncState | null = null

const getLocalActive = () => {
  const source = global.lx.appSetting['common.apiSource']
  return /^user_api/.test(source) ? source : null
}

const readSyncState = async(): Promise<SyncState> => {
  const data = await getUserApiData()
  return {
    apis: new Map(data.apis.map(api => [api.id, api])),
    scripts: new Map(Object.entries(data.scripts)),
    active: getLocalActive(),
  }
}

/**
 * 应用同步数据携带的激活源选择：
 * - 携带且目标源存在 → 切换
 * - 未携带 → 保持本机选择
 * - 本机激活源已被同步删除 → 回退到剩余的第一个源
 */
const applyApiSource = (apiSource: string | null | undefined, apis: LX.UserApi.UserApiInfo[]) => {
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

// 应用一份完整数据（初始同步/完全覆盖）并抑制回推
const writeLocalData = async(data: LX.UserApi.UserApiData, apiSource?: string | null) => {
  remoteApplyingCount++
  try {
    await global.lx.event_userApi.user_api_data_overwrite(data, true)
    applyApiSource(apiSource, data.apis)
  } finally {
    remoteApplyingCount--
  }
  // 记录应用后的本机状态，后续事件与它对比即可忽略回声
  lastSyncState = await readSyncState()
}

export const getUserApiDataMD5 = async(): Promise<string> => {
  const data = await getUserApiData()
  return toMD5(serializeUserApiData(data))
}

export const getLocalUserApiData = async(): Promise<LX.UserApi.UserApiData> => {
  return getUserApiData()
}

export const setLocalUserApiData = async(data: LX.UserApi.UserApiData, apiSource?: string | null) => {
  await writeLocalData(data, apiSource)
}

// 把服务端下发的细粒度 action 应用到本地数据（server/client 模式共用）
const applyRemoteAction = async(action: LX.Sync.UserApi.ActionList) => {
  switch (action.action) {
    case 'user_api_add': {
      const current = await getLocalUserApiData()
      if (current.apis.some(api => api.id == action.data.api.id)) return
      await writeLocalData({
        apis: [...current.apis, action.data.api],
        scripts: { ...current.scripts, [action.data.api.id]: action.data.script },
        apiSource: current.apiSource ?? null,
      })
      break
    }
    case 'user_api_update': {
      const current = await getLocalUserApiData()
      const index = current.apis.findIndex(api => api.id == action.data.api.id)
      if (index < 0) return
      const apis = [...current.apis]
      apis[index] = action.data.api
      const scripts = { ...current.scripts }
      if (typeof action.data.script == 'string' && action.data.script != '') {
        scripts[action.data.api.id] = action.data.script
      }
      await writeLocalData({ apis, scripts, apiSource: current.apiSource ?? null })
      break
    }
    case 'user_api_remove': {
      const current = await getLocalUserApiData()
      const ids = new Set(action.data.ids)
      if (!current.apis.some(api => ids.has(api.id))) return
      const apis = current.apis.filter(api => !ids.has(api.id))
      const scripts = { ...current.scripts }
      for (const id of ids) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete scripts[id]
      }
      await writeLocalData({ apis, scripts, apiSource: current.apiSource ?? null })
      break
    }
    case 'user_api_active': {
      if (action.data.id == null) return
      const current = await getLocalUserApiData()
      if (!current.apis.some(api => api.id == action.data.id)) return
      await writeLocalData(current, action.data.id)
      break
    }
    case 'user_api_data_overwrite':
      await writeLocalData(action.data, action.data.apiSource ?? null)
      break
    default:
      throw new Error('unknown user api sync action')
  }
}

export const handleRemoteUserApiAction = applyRemoteAction

export const registerUserApiActionEvent = (sendUserApiAction: (action: LX.Sync.UserApi.ActionList) => (void | Promise<void>)) => {
  // 与上次已知状态做 diff，只发送增量
  const flushLocalChanges = async() => {
    if (remoteApplyingCount > 0) return
    const next = await readSyncState()
    const prev = lastSyncState
    lastSyncState = next
    if (!prev) return

    const removedIds = [...prev.apis.keys()].filter(id => !next.apis.has(id))
    if (removedIds.length) await sendUserApiAction({ action: 'user_api_remove', data: { ids: removedIds } })

    for (const [id, api] of next.apis) {
      if (prev.apis.has(id)) continue
      await sendUserApiAction({ action: 'user_api_add', data: { api, script: next.scripts.get(id) ?? '' } })
    }

    for (const [id, api] of next.apis) {
      const prevApi = prev.apis.get(id)
      if (!prevApi) continue
      const scriptChanged = (prev.scripts.get(id) ?? '') != (next.scripts.get(id) ?? '')
      if (!scriptChanged && JSON.stringify(prevApi) == JSON.stringify(api)) continue
      await sendUserApiAction({ action: 'user_api_update', data: { api, script: next.scripts.get(id) ?? '' } })
    }

    if (prev.active != next.active) {
      await sendUserApiAction({ action: 'user_api_active', data: { id: next.active } })
    }
  }

  const user_api_changed = async() => {
    await flushLocalChanges()
  }
  const updated_config = async(keys: Array<keyof LX.AppSetting>) => {
    if (!keys.includes('common.apiSource')) return
    await flushLocalChanges()
  }

  void readSyncState().then(state => {
    lastSyncState = state
  })

  global.lx.event_userApi.on('user_api_changed', user_api_changed)
  global.lx.event_app.on('updated_config', updated_config)
  return () => {
    global.lx.event_userApi.off('user_api_changed', user_api_changed)
    global.lx.event_app.off('updated_config', updated_config)
  }
}
