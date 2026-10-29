# 从单卡到多卡：Scaling Book 阅读索引与讲解提纲

本提纲接在单卡与跨算子优化之后，继续使用 Qwen3-8B、BF16 和前文的 MLP。第 19–35 页按分工、问题与应对、互连范围、P/D 部署组织。文字与图示均在 slides.md。

## 选择哪些章节

| 章节 | 本次取用的内容 | 用途 |
| --- | --- | --- |
| [1 · Roofline Analysis](https://jax-ml.github.io/scaling-book/roofline/) | 计算、内存访问与网络通信的时间下界 | 将前面的 HBM Roofline 延伸到跨卡通信 |
| [3 · Sharded Matrices](https://jax-ml.github.io/scaling-book/sharding/) | 矩阵分片、局部乘法、部分和，以及 AllGather / ReduceScatter / AllReduce | 主线：解释通信从哪一步产生 |
| [4 · Transformer Math](https://jax-ml.github.io/scaling-book/transformers/) | 参数量、计算量、KV Cache | 判断单卡容量是否足够 |
| [7 · Transformer Inference](https://jax-ml.github.io/scaling-book/inference/) | P/D 分离、KV Cache 交接、独立配置两阶段资源 | 从阶段间干扰引出部署方案 |
| [8 · Serving LLaMA 3](https://jax-ml.github.io/scaling-book/applied-inference/) | 将容量、并行度、延迟和成本放在同一个部署算例中 | 借用分析方法，收束到部署决策 |
| [12 · GPUs](https://jax-ml.github.io/scaling-book/gpus/) | GPU 网络、集合通信和并行方式的通信代价 | 解释链路争用及不同分片方案的取舍 |

全书大量算例使用 TPU。这里取用分析方法；GPU 部分以第 12 章为依据，不移用 TPU 的带宽、拓扑或最佳并行度。第 2 章可作为硬件背景，第 5–6 章偏训练，第 9–10 章偏 TPU 实现与调试，暂不展开。

补充参考：[DistServe](https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin)用于说明 P/D 分离的动机与代价；[vLLM 的 P/D 分离](https://docs.vllm.ai/en/latest/features/disagg_prefill/)与[推理 DP](https://docs.vllm.ai/en/latest/serving/data_parallel_deployment/)用于对应实际服务；[Megatron 的 CP 说明](https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/context_parallel.html)用于区分上下文并行与其语境下的 SP。GPU 章节中的训练 DP、FSDP 和零气泡流水线结论，不直接当作自回归推理的结论。

## 开场

单卡的显存容量、显存带宽和计算吞吐都有上限。模型和 KV Cache 可能放不下，也可能放得下，却无法满足请求数量或响应时间的要求。把存储和计算分担给多张卡，可以增加资源；接下来要算的是，跨卡传输和相互等待会花掉多少时间。

这里先区分两种扩展。不同请求可以交给不同的模型副本，各自完成推理；也可以把同一个模型拆到多张卡，让它们共同完成一条请求。后者会产生本段重点讨论的层内通信。更多 GPU 的显存并不会自动成为一块无需搬运的共享显存。

## 讲解顺序（第 19–35 页）

| 页码 | 分工 / 场景 | 典型问题与应对 |
| --- | --- | --- |
| 19 | 单卡限制 | KV 增长、权重放不下、算力不足 → 选择多卡分工 |
| 20–21 | DP 完整副本 | 请求数相同但工作量不同 → 按长度与当前负载分配新请求 |
| 22–23 | TP 原理与扩展问题 | 同形状部分和为何要 All-Reduce；本地计算减少，必要通信不同比例下降 |
| 24 | 算子与访存 | 直接写入通信缓冲区 → 融合归约后的 ResidualAdd / RMSNorm |
| 25 | 通信算法 | Ring 6 阶段 → MultiShot 2 阶段，明确 NVSwitch 支持 |
| 26 | 计算通信协同 | 整算子串行 → 输出 tile 就绪后流水重叠 |
| 27–28 | PP 按层分段 | 并发不足，流水线空闲 → 交错安排独立请求 |
| 29–30 | CP 分上下文 | 等待远端 KV → 分块交换与 Attention 计算重叠 |
| 31–32 | EP 分专家 | 热门专家拥堵 → 增加该专家的副本并均衡派发 |
| 33 | Scale-up / Scale-out | 服务器边界不等于高速互连域边界 |
| 34 | P/D 分离 | 回顾两阶段 → 展示干扰 → 独立配置资源、交接 KV |
| 35 | KV 交接网络 | 出口、路径偏斜、接收汇聚 |

各类并行先说明分工，再讨论实际代价。TP 保留一页原理、一页核心问题，并以三个独立动画解释算子与访存、通信算法、计算通信协同；其他并行方式各两页。时间条、队列数量为定性示意，不给没有测量依据的倍数。

DP 是推理副本，不存在训练梯度同步；调度新请求不意味着免费迁移活跃 KV。TP 先讲求和维切分与复制输出布局，再对比2卡和8卡的本地权重、计算量与部分输出形状。优化保留必要求和：减少拷贝与中间物化、用合适的collective减少阶段、在满足数据依赖时重叠。MultiShot不是把AllReduce改写成两种collective便自动得到2轮；NVSwitch多播是明确条件。重叠也可能竞争SM/HBM，不能用图的长度承诺加速。PP 只交错独立请求，不能提前计算尚未生成的 token。CP 案例限定长序列 Prefill，分块 Attention 需正确维护归一化与部分输出，仍有通信。EP 明确是 MoE，Qwen3-8B 稠密模型没有这些专家；复制热门专家需要额外显存。

P/D 是阶段分离，是否经过 Scale-out 取决于放置。两池都需要可运行完整模型的权重；图中选择跨超节点交接 KV，持续生成在 D 侧追加缓存。低批量 Decode 通常受显存带宽约束，长 Prefill 更容易受算力约束，但瓶颈随形状和硬件变化。

KV 交接页的三种瓶颈也不是 Scale-out 独有，只解释选定部署中的位置；各请求交接独立，不构成一次 AllReduce。PagedAttention 留在第 37–41 页的存储部分。

## 补充来源与验证

- [vLLM 专家并行与负载均衡](https://docs.vllm.ai/en/latest/serving/expert_parallel_deployment/)：额外专家副本、容量成本。
- [Ring Attention](https://arxiv.org/abs/2310.01889)：分块 KV 通信与 Attention 计算的重叠。
- [TensorRT-LLM User Buffer 与 Reduce Fusion](https://developer.nvidia.com/blog/boost-llama-model-performance-on-microsoft-azure-ai-foundry-with-nvidia-tensorrt-llm/)：减少拷贝与相邻算子开销。
- [MultiShot](https://developer.nvidia.com/blog/3x-faster-allreduce-with-nvswitch-and-tensorrt-llm-multishot/)：算法阶段及 NVSwitch 条件。
- [FLUX](https://arxiv.org/html/2406.06858v4)：tile 粒度的通信融合与重叠。
- [Megatron-LM 第 3 节](https://arxiv.org/html/1909.08053v4#S3)：非线性之前的同步、列并行与行并行配对。
- [Scaling Book GPU 章节](https://jax-ml.github.io/scaling-book/gpus/)：通信代价与互连。

图示、文字、条件与来源均在 slides.md。每次修改后构建，并检查初始、前进与回退状态。
