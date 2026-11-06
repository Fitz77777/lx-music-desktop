import { EventEmitter } from 'events'
import { overwriteUserApiData } from '@main/modules/userApi/utils'
import { closeWindow } from '@main/modules/userApi/main'


export class Event extends EventEmitter {
  user_api_changed() {
    this.emit('user_api_changed')
  }

  /**
   * 覆盖整个自定义源数据
   * @param userApiData 自定义源数据
   * @param isRemote 是否属于远程操作
   */
  async user_api_data_overwrite(userApiData: LX.UserApi.UserApiData, isRemote: boolean = false) {
    const { removedIds } = await overwriteUserApiData(userApiData)
    if (removedIds.length) {
      // 当前脚本窗口对应的源被移除时，关闭其沙箱窗口（与 removeApi 行为一致）
      const currentId = await import('@main/modules/userApi').then(({ getCurrentApiId }) => getCurrentApiId())
      if (currentId && removedIds.includes(currentId)) await closeWindow()
    }
    this.emit('user_api_data_overwrite', userApiData, isRemote)
  }
}


type EventMethods = Omit<EventType, keyof EventEmitter>
declare class EventType extends Event {
  on<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): this
  once<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): this
  off<K extends keyof EventMethods>(event: K, listener: EventMethods[K]): this
}
export type Type = Omit<EventType, keyof Omit<EventEmitter, 'on' | 'off' | 'once'>>
