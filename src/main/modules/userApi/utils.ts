import { userApis as defaultUserApis } from './config'
import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'
import zlib from 'node:zlib'

let userApis: LX.UserApi.UserApiInfo[] | null
let scripts = new Map<string, string>()

const saveData = () => {
  getStore(STORE_NAMES.USER_API).set('userApis', userApis!.map(api => {
    return {
      ...api,
      script: scripts.get(api.id),
    }
  }))
}

export const getUserApis = (): LX.UserApi.UserApiInfo[] => {
  if (userApis) return userApis

  const electronStore_userApi = getStore(STORE_NAMES.USER_API)
  let infoFull = electronStore_userApi.get('userApis') as LX.UserApi.UserApiInfoFull[]
  let requiredUpdate = false
  if (infoFull) {
    for (let i = 0; i < infoFull.length; i++) {
      const api = infoFull[i]
      if (api.version != null) continue
      requiredUpdate ||= true
      try {
        infoFull.splice(i, 1, {
          ...parseScriptInfo(api.script),
          ...api,
        })
      } catch (e) {
        infoFull.splice(i, 1)
        i--
      }
    }
  } else {
    infoFull = defaultUserApis
    electronStore_userApi.set('userApis', userApis)
  }
  userApis = infoFull.map(api => {
    if (api.allowShowUpdateAlert == null) api.allowShowUpdateAlert = false
    const { script, ...info } = api
    scripts.set(api.id, script)
    return info
  })
  if (requiredUpdate) saveData()
  return userApis
}

const INFO_NAMES = {
  name: 24,
  description: 36,
  author: 56,
  homepage: 1024,
  version: 36,
} as const
type INFO_NAMES_Type = typeof INFO_NAMES
const matchInfo = (scriptInfo: string) => {
  const infoArr = scriptInfo.split(/\r?\n/)
  const rxp = /^\s?\*\s?@(\w+)\s(.+)$/
  const infos: Partial<Record<keyof typeof INFO_NAMES, string>> = {}
  for (const info of infoArr) {
    const result = rxp.exec(info)
    if (!result) continue
    const key = result[1] as keyof typeof INFO_NAMES
    if (INFO_NAMES[key] == null) continue
    infos[key] = result[2].trim()
  }

  for (const [key, len] of Object.entries(INFO_NAMES) as Array<{ [K in keyof INFO_NAMES_Type]: [K, INFO_NAMES_Type[K]] }[keyof INFO_NAMES_Type]>) {
    infos[key] ||= ''
    if (infos[key] == null) infos[key] = ''
    else if (infos[key].length > len) infos[key] = infos[key].substring(0, len) + '...'
  }

  return infos as Record<keyof typeof INFO_NAMES, string>
}
const parseScriptInfo = (script: string) => {
  const result = /^\/\*[\S|\s]+?\*\//.exec(script)
  if (!result) throw new Error('无效的自定义源文件')

  let scriptInfo = matchInfo(result[0])

  scriptInfo.name ||= `user_api_${new Date().toLocaleString()}`
  return scriptInfo
}
const deflateScript = async(script: string) => new Promise<string>((resolve, reject) => {
  zlib.deflate(Buffer.from(script, 'utf8'), (err, buf) => {
    if (err) {
      reject(err)
      return
    }
    resolve('gz_' + buf.toString('base64'))
  })
})
const inflateScript = async(script: string) => new Promise<string>((resolve, reject) => {
  if (script.startsWith('gz_')) {
    zlib.inflate(Buffer.from(script.substring(3), 'base64'), (err, buf) => {
      if (err) {
        reject(err)
        return
      }
      resolve(buf.toString('utf8'))
    })
  } else resolve(script)
})
/**
 * 解析脚本并生成源信息（不落盘）
 */
export const prepareApiInfo = async(scriptRaw: string): Promise<LX.UserApi.UserApiInfo> => {
  const scriptInfo = parseScriptInfo(scriptRaw)
  const script = await deflateScript(scriptRaw)
  const apis = getUserApis()
  for (const api of apis) {
    const existingScript = scripts.get(api.id)
    if (existingScript === script) {
      throw new Error(`导入失败，脚本内容与已有的源「${api.name}」相同`)
    }
  }
  return {
    id: `user_api_${Math.random().toString().substring(2, 5)}_${Date.now()}`,
    ...scriptInfo,
    allowShowUpdateAlert: true,
  }
}

const saveApiInfo = async(apiInfo: LX.UserApi.UserApiInfo, script?: string) => {
  const apis = getUserApis()
  const index = apis.findIndex(api => api.id == apiInfo.id)
  if (index < 0) apis.push(apiInfo)
  else apis.splice(index, 1, apiInfo)
  if (typeof script == 'string' && script != '') scripts.set(apiInfo.id, await deflateScript(script))
  saveData()
  return apiInfo
}

export const addApiInfo = async(apiInfo: LX.UserApi.UserApiInfo, script: string) => {
  await saveApiInfo(apiInfo, script)
  return apiInfo
}

export const updateApiInfo = async(apiInfo: LX.UserApi.UserApiInfo, script?: string) => {
  if (!getUserApis().some(api => api.id == apiInfo.id)) return false
  await saveApiInfo(apiInfo, script)
  return true
}

export const removeApiInfo = (ids: string[]): string[] => {
  const apis = getUserApis()
  const removedIds: string[] = []
  for (let index = apis.length - 1; index > -1; index--) {
    if (!ids.includes(apis[index].id)) continue
    removedIds.push(apis[index].id)
    scripts.delete(apis[index].id)
    apis.splice(index, 1)
  }
  if (removedIds.length) saveData()
  return removedIds
}

// 同步模块使用：读取完整自定义源数据（脚本内容为解压后的原始文本）
export const getUserApiData = async(): Promise<LX.UserApi.UserApiData> => {
  const apis = getUserApis()
  const scriptsData: Record<string, string> = {}
  for (const api of apis) {
    scriptsData[api.id] = await inflateScript(scripts.get(api.id) ?? '')
  }
  // 附加当前激活源选择（若为 user_api 源）：供完全覆盖类同步流程传递；md5/快照序列化会剔除该字段
  const apiSource = global.lx.appSetting['common.apiSource'] ?? null
  return {
    apis: apis.map(api => ({ ...api })),
    scripts: scriptsData,
    apiSource: /^user_api/.test(apiSource) ? apiSource : null,
  }
}

const sanitizeUserApiData = (data: LX.UserApi.UserApiData) => {
  const apis: LX.UserApi.UserApiInfo[] = []
  const newScripts: Array<{ id: string, script: string }> = []
  const ids = new Set<string>()
  for (const api of data.apis) {
    if (typeof api.id != 'string' || !api.id) continue
    if (ids.has(api.id)) continue
    ids.add(api.id)
    apis.push(api)
    const script = data.scripts[api.id]
    if (typeof script == 'string' && script != '') newScripts.push({ id: api.id, script })
  }
  return { apis, newScripts }
}

// 同步模块使用：以脚本 id 为单位全量覆盖自定义源数据
export const overwriteUserApiData = async(data: LX.UserApi.UserApiData) => {
  const { apis, newScripts } = sanitizeUserApiData(data)
  const newIds = new Set(apis.map(api => api.id))
  const removedIds = getUserApis().filter(api => !newIds.has(api.id)).map(api => api.id)
  const changedIds: string[] = []
  for (const { id, script } of newScripts) {
    const existing = await inflateScript(scripts.get(id) ?? '')
    if (existing == script) continue
    changedIds.push(id)
    scripts.set(id, await deflateScript(script))
  }
  for (const id of removedIds) scripts.delete(id)
  const target = getUserApis()
  target.splice(0, target.length, ...apis)
  saveData()
  return { changedIds, removedIds }
}

export const getScript = async(id: string) => {
  return inflateScript(scripts.get(id) ?? '')
}
