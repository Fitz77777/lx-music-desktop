export const sortScripts = (scripts: Record<string, string>) => {
  const newScripts: Record<string, string> = {}
  for (const id of Object.keys(scripts).sort()) newScripts[id] = scripts[id]
  return newScripts
}

/**
 * 序列化用户自定义源数据，scripts 按 id 排序以保证相同内容序列化结果一致
 */
export const serializeUserApiData = (data: LX.UserApi.UserApiData) => {
  return JSON.stringify({
    apis: data.apis,
    scripts: sortScripts(data.scripts),
  })
}

/**
 * 反序列化用户自定义源数据，解析失败返回 null
 */
export const parseUserApiData = (data: string) => {
  try {
    const parsed = JSON.parse(data) as LX.UserApi.UserApiData
    if (!Array.isArray(parsed.apis) || typeof parsed.scripts != 'object' || parsed.scripts == null) return null
    return {
      apis: parsed.apis,
      scripts: { ...parsed.scripts },
    }
  } catch (err) {
    console.warn('parse user api data failed:', err)
    return null
  }
}
