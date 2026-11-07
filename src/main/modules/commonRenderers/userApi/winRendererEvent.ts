import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { getUserApis } from '@main/modules/userApi/utils'

// 发送自定义源操作事件到渲染进程的注册方法
// 哪个渲染进程需要接收则引入此方法注册
export const registerRendererEvents = (sendEvent: <T = any>(name: string, params?: T | undefined) => void) => {
  const user_api_add = async(apiInfo: LX.UserApi.UserApiInfo) => {
    sendEvent<LX.UserApi.UserApiInfo>(WIN_MAIN_RENDERER_EVENT_NAME.user_api_add, apiInfo)
  }
  const user_api_update = async(apiInfo: LX.UserApi.UserApiInfo) => {
    sendEvent<LX.UserApi.UserApiInfo>(WIN_MAIN_RENDERER_EVENT_NAME.user_api_update, apiInfo)
  }
  const user_api_remove = async(ids: string[]) => {
    sendEvent<string[]>(WIN_MAIN_RENDERER_EVENT_NAME.user_api_remove, ids)
  }
  const user_api_data_overwrite = async() => {
    sendEvent<LX.UserApi.UserApiInfo[]>(WIN_MAIN_RENDERER_EVENT_NAME.user_api_data_overwrite, getUserApis())
  }
  global.lx.event_userApi.on('user_api_add', user_api_add)
  global.lx.event_userApi.on('user_api_update', user_api_update)
  global.lx.event_userApi.on('user_api_remove', user_api_remove)
  global.lx.event_userApi.on('user_api_data_overwrite', user_api_data_overwrite)

  return () => {
    global.lx.event_userApi.off('user_api_add', user_api_add)
    global.lx.event_userApi.off('user_api_update', user_api_update)
    global.lx.event_userApi.off('user_api_remove', user_api_remove)
    global.lx.event_userApi.off('user_api_data_overwrite', user_api_data_overwrite)
  }
}
