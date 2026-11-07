# Fork 版本管理

本仓库是 [`lyswhut/lx-music-desktop`](https://github.com/lyswhut/lx-music-desktop) 的 fork。
版本号遵循以下约定：

```
<上游版本>-fork.<fork 序号>
```

例如上游 `v2.12.6` 对应的第一个 fork 版本是 `2.12.6-fork.1`。

## 分支策略

| 分支 | 用途 |
| --- | --- |
| `master` | **只用于同步上游**，保持与 `lyswhut/lx-music-desktop` 一致，不提交 fork 改动，不触发发布 |
| `release` | fork 的正式发布分支，所有构建与 Release 都由推送到该分支触发 |

版本检查读取的是 `release` 分支上的 `publish/version.json`。

## 版本规则

- `2.12.6` 跟随上游，不自行修改。
- `fork.N` 只统计当前上游版本下的 fork 发布次数。
- 每次合并上游新版本后，`fork.N` 重置为 `1`。
- Git tag 使用 `v<完整版本号>`，例如 `v2.12.6-fork.1`，由发布工作流自动创建。
- 桌面端没有 versionCode，无需额外维护数字版本。

## 发版命令

```bash
# fork 自己的改动发版：fork 序号 +1
npm run version:bump

# 合并上游新版本后：重置为 <上游版本>-fork.1
npm run version:sync -- 2.13.0
```

## 发布流程

1. `git fetch upstream --tags`
2. 更新纯上游镜像：在 `master` 上合并 `upstream/master` 并推送
3. 把 `master` 合并进 `release`
4. 合并上游版本时执行 `npm run version:sync -- <上游版本>`
5. fork 自己迭代时执行 `npm run version:bump`
6. 更新 `publish/changeLog.md`，运行 `npm run publish` 写入更新日志和 `publish/version.json`
7. 推送到 `release` 分支
8. `.github/workflows/release.yml` 的 `Tag` 任务先创建 `v<version>` tag，随后各平台构建并发布到 fork 的 GitHub Releases

> 不要直接向 `master` 推送 fork 改动；`master` 只作为上游镜像。

## 与上游的差异

- `package.json` 增加了 `fork.owner` / `fork.repo`。
- `build-config/build-pack.js` 的 electron-builder 发布目标改为 fork 仓库。
- `src/renderer/utils/update.js` 从 fork 仓库的 `release` 分支读取 `publish/version.json`。
- `publish/utils/githubRelease.js` 的 owner/repo 与 `target_commitish` 改为 fork / `release`。
- `UpdateModal.vue` 的软件发布页链接改为 fork。
- `publish-version-info.yml` 已移除（它原本会把 release 事件转发到上游的 version-info 仓库）。
- `publish/utils/parseChangelog.js` 支持解析带 `-fork.N` 的版本号。
- `publish/utils/updateChangeLog.js` 生成指向 fork 的 compare 链接。
- `release.yml` 由 `release` 分支触发，并新增创建 tag 的 `Tag` 任务。

## 注意

- electron-builder 默认创建的是 **draft release**，需要到 GitHub Releases 页面手动点击发布。
- `electron-updater` 在检测到当前版本是 prerelease 时会自动允许升级到 prerelease，所以 `2.12.6-fork.1 → 2.12.6-fork.2` 的自动更新可以正常工作。
- 从上游 `2.12.6` 切换到 `2.12.6-fork.1` 时，自定义的 `compareVer` 会把 fork 版本判定为更低，首次启动可能弹一次“版本降级”提示；这是预期行为，不影响使用。
- `publish/version.json` 的顶层 `version` 必须随 fork 发版更新，否则手动检查更新会拿到旧版本号。
