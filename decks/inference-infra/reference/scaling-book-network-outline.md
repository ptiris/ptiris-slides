# 从单卡到多卡：Scaling Book 阅读索引与讲解提纲

本提纲接在现有第 16 页之后，继续使用 Qwen3-8B、BF16 和前文的 MLP。已按分工、互连范围、部署案例的顺序制作第 18–24 页，文字与图示结构均在 slides.md。

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

## 讲解顺序（第 18–24 页）

| 页码 | 主题 | 图示与步骤 |
| --- | --- | --- |
| 18 | 一张卡，什么时候不够用？ | 显存容量条：1 条请求与 64 条请求；提示容量、带宽与计算吞吐限制 |
| 19 | 把一个 MLP 分给两张 GPU | 两卡分别计算中间维度 6144 的分片，再由 AllReduce 合并部分结果 |
| 20 | 多张卡，可以怎样分工？ | DP、TP、PP、CP、EP，每次只展示一种方式 |
| 21 | 多卡协作，为什么会等待？ | 负载不均、链路争用、同一次 AllReduce 的慢流等待，分别切换 |
| 22 | 这些 GPU 怎样连接？ | 同一张图区分超节点内部 Scale-up 与超节点之间 Scale-out |
| 23 | P/D 分离 | 阶段干扰，再选择两池部署在不同超节点、通过 Scale-out 交接 KV 的案例 |
| 24 | KV 交接，可能堵在哪里？ | 沿用 P/D 案例，依次突出发送出口、路径负载不均和接收端汇聚 |

### 为什么需要多卡，以及怎样分工

第 18 页从权重和 KV Cache 的容量进入。Qwen3-8B 在 BF16 下，单 token 的全层 KV 为 `2 × 36 × 8 × 128 × 2 bytes = 144 KiB`。一条缓存 8192 token 的请求占 1.125 GiB；64 条独立请求占 72 GiB，再加约 15.3 GiB 权重，超过图中 80 GiB 的教学预算。预算不是某型号 GPU 的实测可用容量；尚未计工作空间，假设没有前缀共享和 KV 量化。

第 19 页沿用 Qwen MLP，将中间维度 12288 分为两个 6144。gate、up 与激活可以本地计算；down 产生形状相同的部分结果。需要每卡持有完整输出时，用 AllReduce 求和。每卡工作减少，同时新增通信，不承诺两倍加速。

第 20 页扩展分工方式：DP 分请求，TP 分矩阵，PP 分层，CP 分上下文，EP 分专家。DP 采用推理副本语境；CP 与 Megatron 中的 SP 命名区分；EP 明确切换为 MoE，不将专家画成 Qwen3-8B 的结构。

### 多卡协作的代价

第 21 页集中讨论通用的等待，避免在 Scale-out 部分重复介绍。先看独立请求负载不均，再看共享链路上的争用，最后换成同一次 AllReduce 中的慢流时间线。独立请求副本不必同步；集合通信里依赖完整结果的计算会受到必要慢流影响。这些机制不限定于某个互连范围。

### 分工与互连范围

第 22 页建立物理边界。超节点按一个高速 Scale-up 互连域理解，可能包含多台服务器；不同域通过网卡和交换网络形成 Scale-out 互连。服务器边界不直接等同于互连域边界。同一种并行分工可以留在域内，也可以跨域，不能把 TP、DP 或 P/D 与某一网络类型一一绑定。

### 用跨超节点 P/D 部署串起网络问题

第 23 页先展示长请求的 Prefill 对另一请求持续生成的干扰，再选用一个具体放置：P 池在超节点 A，D 池在超节点 B，KV 交接因此经过 Scale-out。P/D 分离本身不要求跨域；[DistServe §4.2](https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf)也讨论了通过节点内 NVLink 交接 KV 的放置方式。两侧都需要可运行完整模型的权重；后续生成通常在 D 侧维护新增 KV。

第 24 页扩大 P 池，在同一张图上观察三个独立的瓶颈假设。发送端出口不足时，KV 在发送前排队；出口充足而路径分配不均时，部分路径拥堵；多个 P 同时向一个 D 交接时，接收端可能成为瓶颈。这些问题不是 Scale-out 独有，本页解释它们在选定部署中发生的位置。不同请求的交接独立，不构成 AllReduce，不要求所有 KV 共同到齐。

只解释瓶颈位置，不展开协议和并行组合。PagedAttention 与缓存存储管理留到存储部分。网络机制参考 [Scaling Book GPU 章节](https://jax-ml.github.io/scaling-book/gpus/)、[NVIDIA Spectrum-X 网络架构说明](https://resources.nvidia.com/en-us-accelerated-networking-resource-library/nvidia-spectrum-x)及 [NCCL 网络诊断](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/networking_troubleshooting.html)。

## 编辑与验证

第 18–24 页共 18 个显示状态，其中第 22 页静态展示。右方向键或空格前进，左方向键回退。全部文字、标签、图形结构与来源保存在 slides.md；style.css 负责通用图示样式。构建与逐状态截图检查记录在 evidence/ 中。
