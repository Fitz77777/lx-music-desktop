import { closeWindow } from './main'
import { getUserApis, prepareApiInfo } from './utils'
import { loadApi, setAllowShowUpdateAlert as setRendererEventAllowShowUpdateAlert, init } from './rendererEvent/rendererEvent'

let userApiId: string | null

export const getCurrentApiId = () => userApiId

export const getApiList = getUserApis

export const importApi = async(script: string): Promise<LX.UserApi.ImportUserApi> => {
  const apiInfo = await prepareApiInfo(script)
  await global.lx.event_userApi.user_api_add(apiInfo, script, false)
  return {
    apiInfo,
    apiList: getUserApis(),
  }
}
export const removeApi = async(ids: string[]): Promise<LX.UserApi.UserApiInfo[]> => {
  await global.lx.event_userApi.user_api_remove(ids, false)
  return getUserApis()
}

export const setApi = async(id: string) => {
  if (userApiId) {
    userApiId = null
    await closeWindow()
  }
  const apiList = getUserApis()
  if (!apiList.some(a => a.id === id)) return
  userApiId ||= id
  await loadApi(id)
}

export const setAllowShowUpdateAlert = async(id: string, enable: boolean) => {
  const targetApi = getUserApis().find(api => api.id == id)
  if (!targetApi) return
  await global.lx.event_userApi.user_api_update({ ...targetApi, allowShowUpdateAlert: enable }, undefined, false)
  setRendererEventAllowShowUpdateAlert(id, enable)
}


export * from './rendererEvent/rendererEvent'

export default () => {
  init()

  global.lx.event_app.on('main_window_close', () => {
    void closeWindow()
  })
}
