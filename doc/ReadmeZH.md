# Obsidian Eagle Image Organizer

这是一个用于 Obsidian 的示例插件，主要用于连接 Obsidian 与 Eagle 软件。

[eagle](https://eagle.cool) 是一款强大的附件管理软件，可以轻松管理大量图片、视频、音频素材，满足“收藏、整理、查找”的各类场景需求，支持 Windows 系统。

## 功能概述

本插件的功能包括：

- 在 Obsidian 中快速跳转 eagle 附件
- 标签同步
- 反向同步（更新链接标题）
- 文件查看
- 附件管理
- 搜索并插入 Eagle 素材

## 初次使用配置说明

1. **配置监听端口号**：需要设置一个 1000 到 9999 之间的四位复杂数值（例如 6060），以避免与常用端口号重复。为了保持附件链接的稳定性，该数值一旦设置好后，不建议进行修改。

2. **设置 Eagle 仓库位置**：通过 Eagle 软件的左上角选择仓库，并复制其路径，例如：`D:\onedrive\eagle\仓库.Library`。

完成这些操作后您需要重启obsidian，然后就可以开始使用该插件了。

## 示例展示

### 从 Eagle 中加载附件

<img src="../assets/fromeagle.gif" width="800">

### 从本地文件上传附件至 Eagle，并在 Obsidian 中查看

<img src="../assets/upload.gif" width="800">

### 搜索并插入 Eagle 素材

通过命令面板运行 `Eagle Bridge: Insert Image from Eagle`（建议设置快捷键）唤起搜索窗口：

- **多关键词搜索**：支持输入多个关键词（空格分隔），顺序不限（例如：`海报 日式`）。
- **键盘导航**：支持使用方向键 `↑` `↓` 选择图片，`Enter` 键直接插入。
- **所见即所得**：直接显示素材缩略图，支持 BMP/TIFF 等更多格式预览。
- **链接格式**：插入的链接直接指向本地服务器，确保在 Obsidian 中完美显示。

## 文件夹相关设置

插件在设置页的「文件夹指定设置」中，提供了三类和文件夹相关的功能：

- **传入指定文件夹**  
  为「上传到 Eagle」时指定一个固定的目标文件夹 ID。

- **项目文件夹移动设置**  
  为「设置项目文件夹」弹窗配置多个项目根文件夹：
  - 可以配置多条项目根（例如：`社媒`、`笔记`），每一条都是一个 Eagle 文件夹 ID。
  - 弹窗顶部会显示「全部」以及各个项目根的选项卡，只在当前选项卡对应的项目下显示子文件夹。
  - 如果仅选择某个项目选项卡而不勾选任何子文件夹，保存时会将素材放入该项目根文件夹中；
    勾选子文件夹时，则会移动 / 记录到这些子文件夹中。
  - 支持为同一素材配置多个项目文件夹。

- **插入图片文件夹设置**  
  为「从 Eagle 插入图片」搜索窗口提供多文件夹筛选能力：
  - 可以配置多条用于插入图片的 Eagle 文件夹 ID，每一条都会在对话框顶部显示为一个可切换的过滤标签。
  - 对话框中的「全部」标签会对所有配置的文件夹（及其子文件夹）进行搜索，其他标签只对对应文件夹及其子集生效。
  - 每条配置行右侧有一个「包含子文件夹」开关（默认开启，不显示文字，悬停有提示）。开启时，
    搜索会同时包含该文件夹及其所有子文件夹；关闭时仅在当前文件夹内搜索。

## 安装指南

### 通过 BRAT 安装

将 `https://github.com/zyjGraphein/Obsidian-EagleBridge` 添加到 [BRAT](https://github.com/TfTHacker/obsidian42-brat)。

### 手动安装

访问最新发布页面，下载 `main.js`、`manifest.json`、`style.css`，然后将它们放入 `<your_vault>/.obsidian/plugins/EagleBridge/`。


## 使用指南

- 文字教程（[中文](./TutorialZH.md) / [EN](./Tutorial.md)）
- 视频教程（[Obsidian EagleBridge -bilibili](https://www.bilibili.com/video/BV1voQsYaE5W/?share_source=copy_web&vd_source=491bedf306ddb53a3baa114332c02b93)）

### 注意事项
- 在使用该插件时，需要 eagle 在后台保持运行，并且打开状态是对应填写路径的仓库。
- 如果 eagle 没有运行，或不处于目标路径的仓库。依旧能够查看图片，但右键的功能菜单，以及附件上传eagle会无法上传。
- 笔记导出为 pdf，图片能够正常显示，但其他的链接（url, pdf, mp4）依旧能够正常点击打开，但分享给其他人（脱离本地）会无法打开。

## 开发指南

此插件遵循 [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) 的结构，更多详情请参阅。

- 克隆此仓库
- 确保你的 NodeJS 版本至少为 v16 (`node --version`)
- 运行 `npm i` 或 `yarn` 安装依赖
- 运行 `npm run dev` 启动编译并进入观察模式

## 待办事项

- [x] 支持多种格式文件的嵌入预览（如 PDF，MP4，PSD，OBJ 等）
- [ ] 支持 macOS 系统
- [ ] 支持拖拽时更新位置
- [ ] 导出时，替换所有附件的链接，并导出所有附件在一个文件夹中。


## 已知限制

为防止误删附件，删除源文件时遍历所有文件的引用目前没有好的方法。建议在 Eagle 内部删除并检索 ID 对 `.md` 文档中的链接进行删除。


## 问题或建议

欢迎提交 issue：

- Bug 反馈
- 新功能的想法
- 现有功能的优化

如果你计划实现一个大型功能，请提前与我联系，我们可以确认它是否适合此插件。


## 鸣谢

该插件主要基于 [eagle](https://api.eagle.cool) 的 API 调用，实现 Eagle 的查看、编辑、上传功能。

该插件的右键功能及图片放大参考了 [AttachFlow](https://github.com/Yaozhuwa/AttachFlow)对应的功能。

视频与PDF等外链嵌入式预览参考了[auto-embed](https://github.com/GnoxNahte/obsidian-auto-embed)对应的功能。

此外，受到[PicGo+Eagle+Python实现本地免费图床](https://zhuanlan.zhihu.com/p/695526765) ，[obsidian-auto-link-title](https://github.com/zolrath/obsidian-auto-link-title)，[obsidian-image-auto-upload-plugin](https://github.com/renmu123/obsidian-image-auto-upload-plugin) 一些功能的启发。

以及感谢来自 Obsidian 论坛回答 ([get-the-source-path-when-drag-and-drop-or-copying-a-file-image-from-outside](https://forum.obsidian.md/t/how-to-get-the-source-path-when-drag-and-drop-or-copying-a-file-image-from-outside/96437)) 的帮助，实现了通过复制或拖拽获得文件来源的功能。



## 许可证

该项目依据 [GNU 通用公共许可证 v3 (GPL-3.0)](https://github.com/zyjGraphein/EagleBridge/blob/master/LICENSE) 授权。


## 支持

如果你喜欢这个插件并想表示感谢，可以请我喝杯咖啡！

<img src="../assets/coffee.png" width="400">
