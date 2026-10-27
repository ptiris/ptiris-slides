# 推理基础设施介绍

当前报告共 30 页：开场案例、Infra 的作用、Qwen MLP 与 GEMM、Prefill / Decode 和 Roofline、多卡与网络，以及 KV 存储与内存池。

1. 模型评测：任务背景、HF 的串行执行示意、提问者报告的评测结果。
2. Robot Harness：任务预算、观察和动作的闭环、提高 reasoning effort 的预实验结果。

在仓库根目录运行：

```sh
npm ci
npm run dev -- inference-infra
```

打开 http://localhost:3030，按空格或右箭头翻页，按 P 进入演讲者模式。第 10–16、18–21、23–24、26–30 页含点击步骤；同一页的步骤完成后进入下一页。

```sh
npm run build
npm run export -- inference-infra
```

`npm run build` 会构建整个报告网站；本报告输出到根目录 `dist/inference-infra/`。导出需要 `playwright-chromium`。

## 编辑入口

- `slides.md`：所有演示文字，包括标题、正文、图内标签、表格、页脚和演讲者备注。
- `layouts/lecture.vue`：通用页面骨架，仅提供插槽，不包含案例内容。
- `style.css`：字体、尺寸、颜色、列布局，以及状态表和流程图的共用样式。
- [内容编辑与页面模板](reference/authoring.md)：新增页面、修改图示和调整布局的方法。
- [Ref 图示与叙述方式总结](reference/design-notes.md)：参考页、采用的绘图逻辑和排版约定。

## 报告结构

| 页码 | 内容 | 主线 |
| --- | --- | --- |
| 1–2 | 封面与总览 | 先看任务，再展开系统问题 |
| 3–7 | 为什么需要 Infra | 评测与 Robot Harness → Infra 职责与用途 |
| 8 | 计算章节页 | 一次 GEMM 怎样落到 GPU 上 |
| 9–16 | 单卡执行与优化 | PyTorch / GEMM → Prefill / Decode → Roofline 与调优 |
| 17 | 网络章节页 | 更多计算资源带来怎样的通信代价 |
| 18–24 | 多卡分工与通信 | 分工 → 等待与互连 → P/D 和 KV 交接 |
| 25 | 存储章节页 | KV 怎样省空间、少重算 |
| 26–30 | KV 管理与内存池 | 增长与分页 → 外部池 → RDMA / CXL |

封面和章节页只显示一个标题，章节名采用陈述式概括；目录保留章节与简短内容概括。正文页脚标明当前部分。所有文字仍在 `slides.md` 中编辑。

## 多卡与网络部分

第 18–24 页依次讲单卡限制、两卡 MLP、并行分工、多卡等待、Scale-up / Scale-out 互连范围、跨超节点 P/D 部署，以及 KV 交接的三个网络瓶颈。

慢流等待归入多卡协作的通用问题；P/D 是阶段分离，是否使用 Scale-out 取决于部署位置。最后一页始终追踪 KV 传输，不切换到集合通信。PagedAttention 从第 26 页起在存储部分展开。

- [讲解提纲与 Scaling Book 索引](reference/scaling-book-network-outline.md)
- [从第 18 页预览](http://localhost:3030/18)
- [从并行分工与网络部分预览](http://localhost:3030/20)

## 存储部分

第 26–30 页依次讲 KV 增长、PagedAttention、外部 KV 池、RDMA 取回，以及 CXL 内存池。继续用 Qwen3-8B 的服务场景串联；先说明为什么需要池，再比较数据访问方式。

CXL 页区分容量池化与同一数据的共享，也单独说明 CPU 可寻址与 GPU 可用之间的数据路径。实际条件、计算过程与来源均放在演讲者备注中。

- [存储讲解提纲与来源](reference/storage-outline.md)
- [从第 26 页预览](http://localhost:3030/26)

## 字体

使用本机已安装的 LXGW WenKai Regular / Medium，转换为保留常用汉字、拉丁字符和符号的 WOFF2，随工程本地加载，无需联网获取字体。

字体依据 [SIL OFL](public/fonts/OFL.txt) 使用。原字体来自 [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)。如需重建字体：

```sh
uv run --with fonttools --with brotli python decks/inference-infra/scripts/build-fonts.py
```

## 案例来源

- [EleutherAI / lm-evaluation-harness #2193](https://github.com/EleutherAI/lm-evaluation-harness/issues/2193) 及其[维护者回复](https://github.com/EleutherAI/lm-evaluation-harness/issues/2193#issuecomment-2305187873)。vLLM 精度配置未披露，不能计算严格加速倍数。
- [Pantograph：Benchmarking Frontier LLMs on Robots](https://pantograph.com/journal/vlm-harness)。20 分钟是整次任务上限；提高 effort 的结果来自单任务预实验。

## 使用的技能

- [Slidev 官方技能](https://github.com/slidevjs/slidev/blob/main/skills/slidev/SKILL.md)
- [Frontend Design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- [Presentation Design](https://github.com/rhuss/cc-slidev/blob/main/slidev/skills/presentation-design/SKILL.md)
- 本地 `explain-by-example` 与 `humanizer`，用于检查推理顺序和中文措辞。

具体设计以本工程的 Ref 样例和用户要求为准。原始 Slidev 默认示例保存在 `reference/starter-slides.md`。
