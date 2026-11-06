declare namespace LX {
  namespace UserApi {
    type UserApiSourceInfoType = 'music'
    type UserApiSourceInfoActions = 'musicUrl' | 'lyric' | 'pic'

    interface UserApiSourceInfo {
      name: string
      type: UserApiSourceInfoType
      actions: UserApiSourceInfoActions[]
      qualitys: LX.Quality[]
    }

    type UserApiSources = Record<LX.Source, UserApiSourceInfo>


    interface UserApiInfoFull {
      id: string
      name: string
      description: string
      script: string
      allowShowUpdateAlert: boolean
      author?: string
      homepage?: string
      version?: string
      sources?: UserApiSources
    }

    type UserApiInfo = Omit<UserApiInfoFull, 'script'>

    interface UserApiStatus {
      status: boolean
      message?: string
      apiInfo?: UserApiInfo
    }

    interface UserApiUpdateInfo {
      name: string
      description: string
      log: string
      updateUrl?: string
    }

    interface UserApiData {
      apis: UserApiInfo[]
      scripts: Record<string, string>
      /**
       * 激活源（同步传输用）：仅“完全覆盖”类同步流程携带真实值，
       * 合并/推送流程为 null（接收端忽略）；不参与 md5/快照序列化
       */
      apiSource?: string | null
    }

    interface UserApiRequestParams {
      requestKey: string
      data: any
    }
    type UserApiRequestCancelParams = string
    type UserApiSetApiParams = string

    interface UserApiSetAllowUpdateAlertParams {
      id: string
      enable: boolean
    }

    interface ImportUserApi {
      apiInfo: UserApiInfo
      apiList: UserApiInfo[]
    }

  }
}
