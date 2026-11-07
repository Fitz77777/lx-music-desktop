#!/usr/bin/env node
/**
 * Fork 版本号工具
 *
 * 版本格式：<上游版本>-fork.<fork 序号>，例如 2.12.6-fork.3
 * 规则：
 *   - 合并上游新版本后：version:sync <上游版本>
 *   - 发布 fork 自己的改动：version:bump
 *
 * 桌面端没有 versionCode，只需维护版本号本身。
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

const FORK_VERSION_RE = /^(\d+\.\d+\.\d+)-fork\.(\d+)$/
const UPSTREAM_VERSION_RE = /^\d+\.\d+\.\d+$/

const fail = (message) => {
  console.error(`\n[fork-version] ${message}\n`)
  process.exit(1)
}

const readForkVersion = () => {
  const match = FORK_VERSION_RE.exec(pkg.version)
  if (!match) {
    fail(`当前版本 "${pkg.version}" 不是 <上游版本>-fork.<序号> 格式。\n` +
      '首次使用前请先手动改成例如 2.12.6-fork.1，或运行 version:sync <上游版本>。')
  }
  return { base: match[1], revision: Number(match[2]) }
}

const write = () => {
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')
}

const printResult = (oldVersion) => {
  console.log(`[fork-version] version: ${oldVersion} -> ${pkg.version}`)
}

const bump = () => {
  const { base, revision } = readForkVersion()
  const oldVersion = pkg.version
  pkg.version = `${base}-fork.${revision + 1}`
  write()
  printResult(oldVersion)
}

const sync = (base) => {
  if (!base || !UPSTREAM_VERSION_RE.test(base)) {
    fail('用法: node scripts/fork-version.js sync <上游版本>\n例如: node scripts/fork-version.js sync 2.13.0')
  }

  const oldVersion = pkg.version
  pkg.version = `${base}-fork.1`
  write()
  printResult(oldVersion)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'bump':
    bump()
    break
  case 'sync':
    sync(args[0])
    break
  default:
    console.log(`用法:
  node scripts/fork-version.js bump
      发布 fork 改动：fork 序号 +1

  node scripts/fork-version.js sync <上游版本>
      合并上游新版本：重置为 <上游版本>-fork.1`)
    if (command) process.exit(1)
}
