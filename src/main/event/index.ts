import { Event as App, type Type as AppType } from './AppEvent'
import { Event as List, type Type as ListType } from './ListEvent'
import { Event as Dislike, type Type as DislikeType } from './DislikeEvent'
import { Event as UserApi, type Type as UserApiType } from './UserApiEvent'

export type {
  AppType,
  ListType,
  DislikeType,
  UserApiType,
}

export const createAppEvent = (): AppType => {
  return new App()
}

export const createListEvent = (): ListType => {
  return new List()
}

export const createDislikeEvent = (): DislikeType => {
  return new Dislike()
}

export const createUserApiEvent = (): UserApiType => {
  return new UserApi()
}

