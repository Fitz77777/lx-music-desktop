import * as list from './list'
import * as dislike from './dislike'
import * as userApi from './userapi'
// export * as theme from './theme'


export const callObj = Object.assign({},
  list.handler,
  dislike.handler,
  userApi.handler,
)


export const modules = {
  list,
  dislike,
  userApi,
}

export const featureVersion = {
  list: 1,
  dislike: 1,
  userApi: 2,
} as const
