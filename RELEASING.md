# 维护与发布

## 本地检查

需要 Node.js 22 和 Python 3.10 或更高版本。打包工具只使用 Python 标准库，不需要安装 Python 依赖。

```text
python tools/package_release.py
```

输出在 `dist/`：

- `module.json`：供 FVTT 获取版本与下载地址。
- 与模组 ID 同名的 ZIP：已检查脚本语法、清单文件、合集数据文件及压缩包完整性。
- `SHA256SUMS.txt`：上述两个文件的 SHA-256 校验值。

ZIP 根目录直接包含 `module.json`。合集数据库的数字编号 `.log` 文件可能保存必要数据，不能按“日志文件”一概删除；工具只排除 LevelDB 的 `LOCK`、`LOG`、`LOG.old` 诊断文件。

## 发布新版本

1. 更新 `module.json` 的 `version`，以及 `download` 中的 `v版本号`。`manifest` 地址保持不变。
2. 更新 README 的当前版本和相关变更说明。
3. 执行本地检查，检查 `dist/` 生成的三个文件。
4. 提交代码，推送形如 `v1.0.1` 的标签。标签必须与清单版本一致。
5. 等待 GitHub Actions 的 **Release FVTT module** 成功。也可从默认分支的 Actions 页面手动执行该工作流。
6. 确认 Release 已包含 `module.json`、同名 ZIP 与校验文件，且属于正式发布，而非 Draft 或 Pre-release。
7. 从未登录 GitHub 的浏览器访问稳定安装地址，然后在干净的 FVTT 环境测试安装与依赖提示。

仓库须可公开读取，FVTT 才能直接访问安装清单和 ZIP。发布工作流只使用该仓库的临时 `GITHUB_TOKEN`，不需要把个人令牌写入代码。已经发布的同一版本不会被工作流覆盖；修改后应递增版本。

转移仓库或更换 GitHub 账号时，先更新清单、README 中的仓库地址和依赖清单链接，再打包发布。工作流会检查其实际仓库是否与清单一致。

## 安装与下载地址

安装链接格式：

```text
https://github.com/账号/模组ID/releases/latest/download/module.json
```

版本下载链接格式：

```text
https://github.com/账号/模组ID/releases/download/v版本号/模组ID.zip
```

上述地址只有在仓库与对应 Release 创建后才会生效。安装者使用的是 `module.json` 地址，而非仓库主页、源代码 ZIP 或本地文件路径。

## 参考

- [Foundry VTT 模组开发与清单说明](https://foundryvtt.com/article/module-development/)
- [GitHub Release 下载链接](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)
