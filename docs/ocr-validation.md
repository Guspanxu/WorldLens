# WorldLens 离线图文识别验证

2026 年 11 月 24 日，使用 macOS arm64 上的 Node.js 22.14.0 执行网站随附的 WebAssembly 与英文 LSTM 权重。识别阶段全程读取本地文件。这组结果检验图片上的可读文字及其位置。观察解释、练习迁移和学习效果需要单独验证。

## 输入、处理和输出

网站将方向已校正的 JPEG 或 PNG 交给独立 Web Worker。Tesseract 的循环神经网络识别字形与词序，生成文字和包围框。位置以原图左上角为原点，横纵坐标各在 0 至 1 之间。每一行的分数取其中最低的词分数。它是引擎的内部度量，不代表解释正确的概率。

本次评估只统计分数至少 0.80 且含两个连续英文字母或数字的行。产品可进一步限制哪些文字能支持有意义的设计观察。英语为默认识别语言。小字、反光、斜拍、部分遮挡与无文字物件都可能得不到结果。

## 第一轮识别后做的修正

第一次用稀疏文字模式通读整图，四张真实 STOP 标志照片全部漏读。我们增加了候选色块处理。以实际像素的色相和相邻关系找色块，检查亮暗反差，对可能刻有字的区域再做一遍文字识别，并将坐标映回原图。程序不会根据红色或八角形补出字样。下表基于修改后的执行结果。四张调试照片参与了改进，因此不能用它们估计泛化准确率。

| 阶段 | 照片 | 实际结果 | 复查重点 |
| --- | --- | --- | --- |
| 调试 | 道路、自行车道旁的标志 `3.jpg` | STOP，0.928 | 框位于右侧牌面，范围较字母稍宽 |
| 调试 | 住宅区标志 `1.jpg` | STOP，0.945 | 框对应天空背景前的红牌 |
| 调试 | 蓝天前的路牌 `5.jpg` | STOP，0.967 | 无需从天空颜色推断含义 |
| 调试 | 举起手持牌的人 `6.jpg` | STOP，0.866 | 只定位牌上文字，未推断人的意图 |
| 负例 | 真实花朵 `color.jpg` | 0 行达标 | 花瓣形状产生了低置信候选 |
| 负例 | 含大量窗格的建筑开口 `gray.jpg` | 0 行达标 | 栅格造成假文字纹理，不能作为设计事实 |
| 改动后新测试 | 乡间道路 `11.jpg` | STOP，0.97 | 框中心约在原图的 (0.303, 0.225) |
| 改动后新测试 | 远距离道路交叉口 `101.jpg` | 0 行达标 | 路口内较小的标志不可可靠读取 |
| 改动后新测试 | 有停车牌的街道 `110.jpg` | PARKING，0.92 | 框中心约在原图的 (0.806, 0.570)，更远的街名未读出 |
| 改动后新测试 | 纸质收据 `254.jpg` | 17 行达标，抬头 PHO CAPITAL 正确 | 识别抬头能用于核查视觉定位。纸面上的每一行仍需核读 |
| 控制样本 | 专门绘制的 PUSH TO OPEN 标牌 | 0.959，框 [0.100, 0.353, 0.765, 0.522] | 空白背景下可重复检查坐标 |

这批场景很小，改动后的新测试也来自有限来源。STOP 识别到 5 次不构成通用场景的准确率。检测到 PARKING 的照片仍遗漏了同一块牌上的其他词。

## 如何复核

`ocr-results.json` 保存输入 SHA-256、每次真实耗时、原始行数和通过阈值的行及坐标。运行下述命令会将新的识别结果写到标准输出。参数可接受多个 JPEG 和 PNG，首次和后续推理都只读取本地模型。

```sh
node scripts/verify-offline-ocr.mjs dist/ocr /path/to/photo.jpg
```

街道照片源仓库中的图片按 `1.jpg`、`3.jpg`、`5.jpg`、`6.jpg`、`11.jpg`、`101.jpg`、`110.jpg` 取用。`ocr-results.json` 中分别对应 `stop1`、`public-stop-test`、`stop5`、`stop6`、`hold11`、`hold101`、`hold110`。图片权利信息不充分，复核者可从原来源取得。 [道路样例仓库](https://github.com/mbasilyan/Stop-Sign-Detection/tree/master/Stop%20Sign%20Dataset)

`holdlabel.jpg` 对应 PaddleOCR release/2.7 下的 254.jpg。 [票据测试图](https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/doc/imgs_en/254.jpg)

本机 CUPS 附带的 `color.jpg` 与 `gray.jpg` 位于 `/usr/share/cups/ipptool/`。本次系统分发的是 gzip 封装，测试对其解压后的 JPEG 执行。控制样本使用本地制作的黑字白底标牌。

## 两种模型的证据边界

另一项运行在真实 Chrome 上的检查使用同一 OWL-ViT 权重的公开 WebAI 示例。Winchester Mystery House 房间照片输入 4 个文字查询。CPU 推理耗时 8,437 毫秒，183 个低阈值候选中有 4 个达到 0.10。最高窗户候选分数 0.294，像素框左上角 (126, 120)、宽 77、高 133。灯具最高仅 0.103，书和植物均未达阈值。候选框是否准确仍应对照原图。此次测试属于公共页面对执行环境的验证。WorldLens 自身的完整产品流程另行记录。 [真实运行的模型示例](https://webai.show/models/owlvit-detection/) · [模型卡](https://huggingface.co/Xenova/owlvit-base-patch32)

## 依赖与出处

随包的英文识别参数是 4,113,088 字节，SHA-256 为 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`。WebAssembly 核心内嵌于 3,896,484 字节的脚本，SHA-256 为 `eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680`。两者均核对了上游 Git blob。随附目录的 LICENSE 和 THIRD_PARTY 文件保留原许可及依赖声明。 [Tesseract.js Core](https://github.com/naptha/tesseract.js-core) · [Tesseract 快速语言模型](https://github.com/tesseract-ocr/tessdata_fast)
