# WorldLens

**One world. Many ways of seeing.**

一个以原图为中心的中文观察工具。上传照片或拍照，选择 Designer’s Eye，点开标注看证据、解释、验证和迁移。第一次打开时看到的真实摄影样本附有明确的人工导览。对新照片运行分析，结果来自所选引擎。

## 在一张照片上练习观察

打开红色拨号电话，点拨盘右下方的标号。先回答「没有这块金属片，拨到哪儿停？」。「看线索」指出能从原图核对的细节，放大镜可以查看同一张照片的局部。「想原因」把人的任务和可能的机制连起来。「动手试」给出一个预测、一个检查办法，以及哪种结果会改变判断。「换场景」邀请你用同样的问题观察另一件物品。每次只打开一个问题的一层，也可以直接跳到自己关心的那一层。

这套读法是 WorldLens 对 Designer’s Eye 的教学编排。每个 Lens 可以在框架 JSON 的 `readingMethod` 里提供自己的阶段用语。分析结构新增可选的 `goal`、`disconfirm` 和 `takeaway`，旧手记仍可打开和导入。书籍全文校读和真实使用者的学习效果仍待验证。

## 开始使用

[打开 WorldLens 在线观察室](https://guspanxu.github.io/WorldLens/)。把这个网址发给朋友，他们可以用自己的浏览器打开、拍照和保存手记。访客无需 GitHub 账号。

电脑使用独立版可直接用 Chrome、Edge 或 Safari 打开 `WorldLens.html`。移动端推荐打开 HTTPS 网站。相机菜单取决于设备和浏览器；也可以从系统相册选择照片。建议用支持图片解码、WebAssembly、Web Workers 和 IndexedDB 的现代浏览器。

运行源码需要 Node.js 22 或更高版本，无需安装 npm 依赖。

```sh
npm start
```

打开 [本机观察室](http://127.0.0.1:4173)。关闭终端中的服务可按 Ctrl+C。若端口已占用，可运行 `PORT=4273 npm start`。

静态网站文件全部在 `dist/`。此仓库更新 `main` 后，GitHub Actions 会运行测试，再将该目录发布到 GitHub Pages。也可以将 `dist/` 原样发布到其他 HTTPS 静态网站主机。导出的 JSON 包含个人原图，请按照片本身的隐私程度保管。

```sh
npm test
npm run portable
```

第二条命令生成可直接转发的 `artifacts/WorldLens.html`。它包含案例、知识框架、文字识别权重与相应第三方许可。首次使用物件检测仍需联网下载视觉语言模型。网页型文件在部分手机即时通讯应用里会被当成文档预览，手机用网址体验更可靠。

## 三种图像分析

| 方式 | 运行地点 | 输入与适用范围 |
| --- | --- | --- |
| 物件与布局 | 浏览器 Worker | OWL-ViT 联合编码图像与文字查询，输出匹配分和候选框。通用场景优先尝试此项。适合控件、杯柄、标牌和其他有可见作用的物件。首次从 jsDelivr 和 Hugging Face 下载脚本、WASM 和约 155 MB 量化权重，需要相应网络及内存。 |
| 文字线索 | 浏览器 Worker | 随站提供约 8 MB 的 Tesseract LSTM 核心和英文语言数据。它读取可见字样与位置，再按设计师视角解释与操作有关的线索。适合英文动作标识；小字和模糊画面可能返回零条。 |
| 本机 Ollama，可选 | 电脑上的本地服务 | 支持图像输入与结构化输出的模型同时接收主图、最多两张补图、现场描述与整个 Lens 的推理规则。 |

浏览器物件检测与 OCR 使用显式的设计观察规则组织推理，模型匹配分是与候选特征的匹配程度。程序无法通过一张图读取使用者想法或作者意图。物件检测依靠有限的可见部件词表。知识和观察方法可以浏览，来源见 `dist/guides/Designers-Eye.md`。

如已安装 Ollama，下面是一种本地配置。模型文件为单独下载，取决于可用空间、网络和设备内存。

```sh
ollama pull qwen2.5vl:3b
WORLDLENS_OLLAMA_MODEL=qwen2.5vl:3b npm start
```

Ollama 应在本机默认端口 11434 运行。若使用命令行安装，另开一个终端运行 `ollama serve`。从本机入口打开网站，点击“分析这张照片”，即可选择“完整场景推理”。该服务只绑定回环地址。站点使用构造好的本机端点，浏览器无需保存任何 API 密钥。开发机没有对应 Ollama 权重，已测范围见测试报告。[Ollama 图像输入文档](https://docs.ollama.com/capabilities/vision) · [结构化输出](https://docs.ollama.com/capabilities/structured-outputs)

## 保存、导出与补证

原始文件的字节直接存入 IndexedDB；显示层和标记层彼此独立。用于模型的 JPEG 副本按浏览器显示方向解码、等比例缩小并去除原始元数据。分享网站链接只会打开空白个人空间和内置样本。每台设备、每个浏览器、每个网站来源各有一份数据。浏览器清理、磁盘配额和无痕会话会影响保存。

照片、笔记、使用的 Lens 与版本、识别引擎、补图、纠正前后坐标、历次分析和来源都可导出为 `worldlens.observation` 版本 1 的 JSON。照片与补图用带 MIME 的 base64 data URL 存放，坐标以左上角为原点，x 向右，y 向下，均在 0–1 之间。在“我的手记”中选择“导入备份”，可在另一台设备恢复为新的手记。导入会检查格式并重新分配记录 ID。数据也可由其他工具读取。轻量设备引擎不会解读现场文字，将它作为用户报告另存；Ollama 模式可以把报告与照片一起推理。

## 模块与新增视角

| 模块 | 入口 | 契约 |
| --- | --- | --- |
| Lens | `dist/lenses/index.json`、框架和 signals JSON | 独立来源、版本、九维观察框架、概念、反例、可见特征、验证问题与迁移。 |
| AI | `dist/app/analysis.js`、`vision-worker.js`、`dist/ocr`、`server/generator.mjs` | 真实模型输出经坐标、证据和概念校验后形成 findings。允许空结果。 |
| 原图标注 | `dist/app/core.js`、`annotations.js` | 点、矩形、关系、多边形、整体。无可靠坐标时回到整体。标记避让不改变证据位置。 |
| 学习 | `dist/app/main.js`、`views.js` | 先记再揭示、证据层次、人工并排比较、保留不同解释、反思和版本。 |
| 个人手记 | `dist/app/storage.js` | 本地记录、原始 Blob、历史与 JSON 归档。 |

新增一个 Lens 时，复制一份框架 JSON 和一份 signals JSON，编辑来源、版本与适用边界，再向注册表增加 `id/file/signals`。提供独立 `kinds` 映射定义自己的分类。物件分析读取该镜头的可见特征与关系定义。需要文字规则时，在镜头中提供相应的文字线索规则。完整场景模型读取所选镜头自身的推理规则。无需改照片画布、存储或学习界面。工程测试另注册了不同途径的分类契约；产品第一版对外提供一个有知识依据的镜头。

## 评估材料

- `dist/guides/Designers-Eye.md` 是完整暂定手册，`dist/lenses/designer.json` 是对应的机器可读版本。
- `docs/verification.md` 记录功能检查、两轮修正、测试边界和下一次朋友试用的验证方法。
- `docs/owl-room-evidence.json` 保存真实房间照片与项目词组运行 OWL-ViT 的结果，测试会将像素框送入产品适配器。
- `docs/ocr-results.json` 和 `docs/ocr-validation.md` 记录真实推理的数据、来源、置信分和坐标。未取得分发许可的测试照片仅保留来源与哈希。
- `scripts/verify-offline-ocr.mjs` 可复核运行，`test/fixtures/action-label.jpg` 为合成控制图，`test/worldlens.test.mjs` 为可运行测试。

```sh
node scripts/verify-offline-ocr.mjs dist/ocr test/fixtures/action-label.jpg dist/photos/clock.png
```
