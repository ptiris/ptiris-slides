# 推理基础设施介绍

当前报告共 45 页：开场案例与 Infra 职责、Qwen GEMM 与 Roofline、Mega Kernel、多卡网络和 KV 存储；最后以端侧 VLA 的当前延迟、优化目标与实现方向收尾。

1. 模型评测：任务背景、HF 的串行执行示意、提问者报告的评测结果。
2. Robot Harness：任务预算、观察和动作的闭环、提高 reasoning effort 的预实验结果。

在仓库根目录运行：

```sh
npm ci
npm run dev -- inference-infra
```

打开 http://localhost:3030，按空格或右箭头翻页，按 P 进入演讲者模式。第 10–16、19–20、22、24–27、29、31、33、35–36、38–42、45 页含点击步骤；同一页的步骤完成后进入下一页。

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
| 17 | 跨算子优化 | Mega Kernel 的执行方式与取舍 |
| 18 | 网络章节页 | 更多计算资源带来怎样的通信代价 |
| 19–20 | 多卡的起点 | 单卡限制 → 两卡 MLP |
| 21–22 | DP | 完整副本与请求负载 |
| 23–27 | TP | 部分和 → 扩展收益 → 算子、通信算法与重叠 |
| 28–33 | PP / CP / EP | 各自分工、典型问题与应对 |
| 34–36 | 互连与 P/D | 互连范围 → 回顾 P/D → 阶段分离与 KV 交接 |
| 37 | 存储章节页 | KV 怎样省空间、少重算 |
| 38–42 | KV 管理与内存池 | 增长与分页 → 外部池 → RDMA / CXL |
| 43–45 | 端侧 VLA | 公开延迟与 Thor 优化目标 → UMA / Persistent MegaKernel |

封面和章节页只显示一个标题，章节名采用陈述式概括；目录保留章节与简短内容概括。正文页脚标明当前部分。所有文字仍在 `slides.md` 中编辑。

## 多卡与网络部分

第 19–20 页讲单卡限制与两卡 MLP。第 21–33 页依次讲 DP、TP、PP、CP、EP。TP 用第 23–27 页展开：部分和为何求和、计算节省与通信代价，以及三个动画例子；其余方式各用两页展示分工与应对。第 34 页区分 Scale-up / Scale-out，第 35 页先回顾 Prefilling / Decoding，再展示阶段干扰与分离部署，第 36 页追踪 KV 交接的网络瓶颈。

- [讲解提纲与 Scaling Book 索引](reference/scaling-book-network-outline.md)
- [从第 19 页预览](http://localhost:3030/19)
- [从并行分工部分预览](http://localhost:3030/21)
- [TP 扩展问题与三类优化](http://localhost:3030/24)

## 存储部分

第 38–42 页依次讲 KV 增长、PagedAttention、外部 KV 池、RDMA 取回，以及 CXL 内存池。继续用 Qwen3-8B 的服务场景串联；先说明为什么需要池，再比较数据访问方式。

CXL 页区分容量池化与同一数据的共享，也单独说明 CPU 可寻址与 GPU 可用之间的数据路径。实际条件、计算过程与来源均放在演讲者备注中。

- [存储讲解提纲与来源](reference/storage-outline.md)
- [从第 38 页预览](http://localhost:3030/38)

## 字体

使用本机已安装的 LXGW WenKai Regular / Medium，转换为保留常用汉字、拉丁字符和符号的 WOFF2，随工程本地加载，无需联网获取字体。

字体依据 [SIL OFL](public/fonts/OFL.txt) 使用。原字体来自 [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)。如需重建字体：

```sh
uv run --with fonttools --with brotli python decks/inference-infra/scripts/build-fonts.py
```

## 新增内容的口径

- 第 10 页以 Blackwell SM100 的 128×256×64 tile 展示 X/W 沿 K 移动、固定输出块累加：当前输入块暂存 SMEM，部分和在 TMEM，寄存器承担地址、循环与输出处理；64 轮后写回。第 13–14 页仍是独立的 A100 Roofline 算例。
- 第 12 页统一 GFLOPs / MiB，访存按冷数据、X/W 各读一次、Y 写一次估算。倍数均以 m=1 为基准，实际流量取决于复用。
- 第 24–27 页将 TP 的扩展问题与三类优化分开：计算量对比不等于耗时预测；缓冲区和算子融合保留必要求和；Ring / MultiShot 比较通信阶段且明确 NVSwitch 条件；tile 流水图只表示执行顺序，不计算加速比。
- 第 17 页介绍 Mega Kernel 的调度方式与取舍，不承诺所有中间数据留在片上。
- 第 44 页统一为 π0.5 的 3-view 公开记录：RTX 4090 BF16 55.4 ms（FlashVLA 基线，H=50）；Thor BF16 约 135 ms（PhyAI，H=50，由 batch=1 吞吐 7.43 samples/s 换算）；Thor FP8 49.02 ms（FlashRT，H=10、完整 infer() P50）。均为 batch 1、10 步，但实现、H 和计时范围不同，不计算跨行加速比。原来的 2-view OpenPi / APXInf 数据已移除。右侧保留 Thor BF16 约 70 ms、FP8 30 ms 量级的目标。第 45 页为 UMA 与 Persistent MegaKernel 两步，对比逐算子 kernel 和常驻 worker。

## 案例来源

- [EleutherAI / lm-evaluation-harness #2193](https://github.com/EleutherAI/lm-evaluation-harness/issues/2193) 及其[维护者回复](https://github.com/EleutherAI/lm-evaluation-harness/issues/2193#issuecomment-2305187873)。vLLM 精度配置未披露，不能计算严格加速倍数。
- [Pantograph：Benchmarking Frontier LLMs on Robots](https://pantograph.com/journal/vlm-harness)。20 分钟是整次任务上限；提高 effort 的结果来自单任务预实验。

## 使用的技能

- [Slidev 官方技能](https://github.com/slidevjs/slidev/blob/main/skills/slidev/SKILL.md)
- [Frontend Design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
- [Presentation Design](https://github.com/rhuss/cc-slidev/blob/main/slidev/skills/presentation-design/SKILL.md)
- 本地 `explain-by-example` 与 `humanizer`，用于检查推理顺序和中文措辞。

具体设计以本工程的 Ref 样例和用户要求为准。原始 Slidev 默认示例保存在 `reference/starter-slides.md`。
