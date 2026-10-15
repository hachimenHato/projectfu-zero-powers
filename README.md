# Project FU：零界力量自动化

适用于 Foundry VTT 13 与 Project FU 4.16.x 的独立功能模组。规则依据《最终物语：史诗奇幻图鉴》印刷页 124–131（PDF 页码 125–132）实现，不修改 Project FU 系统文件。

## 功能

- 三个合集：7 项零界条件、11 项零界效果、9 张零界力量命名表。
- 人物卡“特性”页中的零界力量创建/配置按钮，可自定义或随机命名；保存后自动加入首页收藏，并使用 FU 原生命刻控件。
- 标准“零界力量”、觉醒之力、联结之力及两者组合四种世界级模式。
- 冲突中常驻的暗红色命刻面板：查看进度、手动确认条件、觉醒及释放效果；可拖动并缩成“分瓣命刻盘＋加号＋对勾”三枚小按钮，命刻盘直接以亮起瓣数表示当前格数。
- 条件自动监测、命刻聊天卡与单次撤回。
- 效果聊天卡和可点击操作，尽量复用 Project FU 原生伤害、恢复、异常状态与检定管线。
- 冲突开始和结束时清空玩家角色命刻及本模组的场景效果。
- 自动化总开关。关闭后不注入创建器、面板或自动化 Hook，但合集仍可使用，并可把合集条目拖到 Project FU 原生零界力量的条件/效果区域。

## 安装与启用

在 Foundry VTT 的设置首页打开“附加模组 → 安装模组”，将下面的地址填入“Manifest URL / 模组清单网址”：

```text
https://github.com/hachimenHato/projectfu-zero-powers/releases/latest/download/module.json
```

该地址会始终指向最新正式版；安装后可通过 Foundry 的模组更新功能检查新版本。当前发布版本为 **1.0.5**。

需要 Foundry VTT 13 和 Project FU 4.16.0 或更高版本；当前兼容基线为 Project FU 4.16.1，尚未声明支持其他大版本系统。

在世界“管理模组”中启用“Project FU：零界力量自动化”，并在 Project FU 系统设置中启用原生“底力 / Zero Powers”选项。随后在模组设置中选择规则模式。

手动安装时，从本仓库 Releases 下载 `projectfu-zero-powers.zip`，将内容放入 `Data/modules/projectfu-zero-powers/`，确保该目录下能直接找到 `module.json`，然后重启 Foundry。

## 使用

1. 打开玩家角色人物卡的能力页。
2. 点击“创建 / 配置零界力量”。
3. 选择条件和效果；只有选中爱恋、零界元素或零界灾厄时，对应必填参数才会出现。
4. 输入名称并保存，或让命名表逻辑随机组合名称。
5. 冲突开始后，屏幕底部会显示当前受控角色的零界面板。拖动角色名称区可改变位置；缩小后拖动小面板边缘或命刻按钮可移动，点击命刻按钮重新展开。

“爱恋”的牺牲/放弃抵抗、叙事性觉醒时机，以及规则中需要判断“看见”的少数情况，仍需要玩家或主持人确认。使用面板的“手动触发条件”即可精确补记。

## 开发命令

在本目录执行：

```powershell
npm test
npm run check
node scripts/build-packs.mjs
```

合集已经预先构建，普通使用者不需要运行开发命令。需要重新生成合集时，请先把 `FOUNDRY_APP_PATH` 环境变量设为 Foundry 程序内的 `resources/app` 目录；构建脚本会使用其中的 `classic-level`。

## 发布与反馈

更新版本号后推送对应的 `v版本号` 标签，GitHub Actions 会校验并生成安装包。完整发布步骤见 [RELEASING.md](./RELEASING.md)。

反馈问题时，请在 [Issues](https://github.com/hachimenHato/projectfu-zero-powers/issues) 附上 Foundry、Project FU 和本模组版本，以及复现步骤。

本项目是独立的社区功能扩展。Foundry VTT、Project FU、《最终物语》及原规则资料的权利属于各自权利人；本仓库不包含规则书 PDF。详见 [NOTICE.md](./NOTICE.md)。
