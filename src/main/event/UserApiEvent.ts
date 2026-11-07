import { EventEmitter } from 'events'
import { getUserApis, addApiInfo, removeApiInfo, updateApiInfo, overwriteUserApiData } from '@main/modules/userApi/utils'
import { closeWindow } from '@main/modules/userApi/main'

const closeRemovedApiWindow = async(removedIds: string[]) => {
  if (!removedIds.length) return
  const currentId = await import('@main/modules/userApi').then(({ getCurrentApiId }) => getCurrentApiId())
  if (currentId && removedIds.includes(currentId)) await closeWindow()
}

export class Event extends EventEmitter {
  user_api_changed() {
    this.emit('user_api_changed')
  }

  /**
   * 新增自定义源
   * @param apiInfo 源信息
   * @param script 脚本内容
   * @param isRemote 是否属于远程操作
   */
  async user_api_add(apiInfo: LX.UserApi.UserApiInfo, script: string, isRemote: boolean = false) {
    // 新增动作具有幂等语义：已存在的源不重复创建
    if (getUserApis().some(api => api.id == apiInfo.id)) return
    await addApiInfo(apiInfo, script)
    this.emit('user_api_add', apiInfo, script, isRemote)
    this.user_api_changed()
  }

  /**
   * 更新自定义源信息/脚本
   * @param apiInfo 源信息
   * @param script 脚本内容，未携带时保留已有脚本
   * @param isRemote 是否属于远程操作
   */
  async user_api_update(apiInfo: LX.UserApi.UserApiInfo, script?: string, isRemote: boolean = false) {
    if (!await updateApiInfo(apiInfo, script)) return
    this.emit('user_api_update', apiInfo, script, isRemote)
    this.user_api_changed()
  }

  /**
   * 删除自定义源
   * @param ids 源 id
   * @param isRemote 是否属于远程操作
   */
  async user_api_remove(ids: string[], isRemote: boolean = false) {
    const removedIds = removeApiInfo(ids)
    if (!removedIds.length) return
    await closeRemovedApiWindow(removedIds)
    this.emit('user_api_remove', removedIds, isRemote)
    this.user_api_changed()
  }

  /**
   * 覆盖整个自定义源数据
   * @param userApiData 自定义源数据
   * @param isRemote 是否属于远程操作
   */
  async user_api_data_overwrite(userApiData: LX.UserApi.UserApiData, isRemote: boolean = false) {
    const { removedIds } = await overwriteUserApiData(userApiData)
    // 当前脚本窗口对应的源被移除时，关闭其沙箱窗口（与删除单条源行为一致）
    await closeRemovedApiWindow(removedIds)
    this.emit('user_api_data_overwrite', userApiData, isRemote)
    this.user_api_changed()
  }
}


type EventMethods = Omit<EventType, keyof EventEmitter>
declare class EventType extends Event {
  on<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): this
  once<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): this
  off<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): this
}
export type Type = Omit<EventType, keyof Omit<EventEmitter, 'on' | 'off' | 'once'>>
