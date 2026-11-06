declare namespace LX {

  namespace Sync {
    namespace UserApi {
      interface ListInfo {
        lastSyncDate?: number
        snapshotKey: string
      }

      interface SyncActionBase <A> {
        action: A
      }
      interface SyncActionData<A, D> extends SyncActionBase<A> {
        data: D
      }
      type SyncAction<A, D = undefined> = D extends undefined ? SyncActionBase<A> : SyncActionData<A, D>

      interface AddData {
        api: LX.UserApi.UserApiInfo
        script: string
      }
      interface UpdateData {
        api: LX.UserApi.UserApiInfo
        script?: string
      }
      interface RemoveData {
        ids: string[]
      }
      interface ActiveData {
        // 激活的自定义源 id；null 表示未激活任何自定义源（不传播内置源选择）
        id: string | null
      }

      type ActionList =
        | SyncAction<'user_api_add', AddData>
        | SyncAction<'user_api_update', UpdateData>
        | SyncAction<'user_api_remove', RemoveData>
        | SyncAction<'user_api_active', ActiveData>
        // 批量覆盖：仅用于初始同步/完全覆盖流程的下发，不作为实时增量
        | SyncAction<'user_api_data_overwrite', LX.UserApi.UserApiData>

      type SyncMode = 'merge_local_remote'
      | 'merge_remote_local'
      | 'overwrite_local_remote'
      | 'overwrite_remote_local'
      | 'overwrite_local_remote_full'
      | 'overwrite_remote_local_full'
      // | 'none'
      | 'cancel'
    }

  }
}
