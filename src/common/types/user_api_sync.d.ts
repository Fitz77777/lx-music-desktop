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
      type ActionList = SyncAction<'user_api_data_overwrite', LX.UserApi.UserApiData>

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
