import { type UserDataManage } from '../../user'
import { SnapshotDataManage } from './snapshotDataManage'
import { toMD5 } from '../../utils'
import { serializeUserApiData } from './utils'
import { getLocalUserApiData } from '@main/modules/sync/userApiEvent'

export class UserApiManage {
  snapshotDataManage: SnapshotDataManage

  constructor(userDataManage: UserDataManage) {
    this.snapshotDataManage = new SnapshotDataManage(userDataManage)
  }

  createSnapshot = async() => {
    const data = await getLocalUserApiData()
    const md5 = toMD5(serializeUserApiData(data))
    const snapshotInfo = await this.snapshotDataManage.getSnapshotInfo()
    console.log('createSnapshot', md5, snapshotInfo.latest)
    if (snapshotInfo.latest == md5) return md5
    if (snapshotInfo.list.includes(md5)) {
      snapshotInfo.list.splice(snapshotInfo.list.indexOf(md5), 1)
    } else await this.snapshotDataManage.saveSnapshot(md5, serializeUserApiData(data))
    if (snapshotInfo.latest) snapshotInfo.list.unshift(snapshotInfo.latest)
    snapshotInfo.latest = md5
    snapshotInfo.time = Date.now()
    this.snapshotDataManage.saveSnapshotInfo(snapshotInfo)
    return md5
  }

  getCurrentDataKey = async() => {
    return this.createSnapshot()
  }

  getDeviceCurrentSnapshotKey = async(clientId: string) => {
    return this.snapshotDataManage.getDeviceCurrentSnapshotKey(clientId)
  }

  updateDeviceSnapshotKey = async(clientId: string, key: string) => {
    await this.snapshotDataManage.updateDeviceSnapshotKey(clientId, key)
  }

  removeDevice = async(clientId: string) => {
    this.snapshotDataManage.removeSnapshotInfo(clientId)
  }

  getUserApiData = async() => {
    return getLocalUserApiData()
  }
}
