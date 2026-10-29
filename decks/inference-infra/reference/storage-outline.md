# 存储部分：沿一份 KV 追踪它的去向

接在第 36 页的 KV 交接之后。网络解决数据怎样到达，接下来讨论数据放在哪里、如何分配，以及访问外部容量要付出什么代价。

## 第 38 页：KV Cache 为什么越来越占显存？

继续使用 Qwen3-8B。Prefill 保存输入的 K/V，Decode 读取历史并追加新 KV。每个已缓存 token 的全层 BF16 KV 为 `2 × 36 × 8 × 128 × 2 = 144 KiB`。8192 token 为 1.125 GiB；32 份互不共享的缓存为 36 GiB。这个数值不含权重、分配浪费或其他运行空间，也不直接等于切分后的每卡占用。

三个状态分别展示保存、增长与并发。强调较早 token 的 KV 在活跃 Decode 中仍被反复读取。

## 第 39 页：PagedAttention 怎样分配 KV？

先画 A/B 按最大长度预留的空位，再将相同数据映射到非连续物理块，最后为增长的 A 领取新块。以 2 token/块做教学示意，逻辑块表和实际归属保持一致。减少的是预留与碎片，不是实际 KV 字节数；Attention kernel 按块表访问数据。

## 第 40 页：先建立外部 KV 池

请求结束后，可复用的前缀 KV 保存到 GPU 之外。另一节点遇到匹配前缀时取回，省去对应的 Prefill。用同一个场景引出容量独立扩展、缓存查找与回收，以及传输和重算的取舍。

这里讲软件管理的 KV 数据池。CXL 硬件容量池不会自动完成 KV 命中、共享和驱逐。也不把活跃请求的历史 KV 视作可以无代价卸载的冷数据。

## 第 41 页：RDMA 显式搬运

先注册和授权缓冲区，提交带远端位置与本地接收位置的读取请求，再由网卡搬运。最后将主机缓冲区中转改为受支持的 GPUDirect RDMA 接收路径。CPU 仍参与设置和完成协调；单边读取不需要远端 CPU 逐次处理。

## 第 42 页：CXL.mem 地址访问

先将内存池中的不同区域分别分配给 A/B，再聚焦 A 的 CPU load/store。地址框是映射关系，不是额外物理缓冲区。第三步单独画出将 KV 送入 GPU HBM 的示例，说明 CPU 可寻址不等于 GPU 已经可以直接、高效地使用。

池化和共享不是同一能力。CXL 2.0 池化可将不同区域分给主机；CXL 3.0 增加一致性共享能力，实际仍需系统支持。本页只画分配不同区域的场景。最后回到访问延迟、带宽和搬运代价，不给出无依据的 RDMA/CXL 性能排序。

## 主要来源

- [Qwen3-8B 配置](https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json)
- [PagedAttention 原论文](https://arxiv.org/abs/2309.06180) 与 [vLLM 原始图解](https://vllm.ai/blog/2023-06-20-vllm)
- [Mooncake，FAST 2025](https://www.usenix.org/conference/fast25/presentation/qin)：外部 KV 池的实际系统参考，不将其描述成 CXL 系统。
- [RDMA 编程指南](https://networking-docs.nvidia.com/doca/archive/3-5-0/rdma-aware-networks-programming-guide) 与 [GPUDirect RDMA 文档](https://docs.nvidia.com/cuda/gpudirect-rdma/)
- [CXL 2.0 内存池 FAQ](https://computeexpresslink.org/blog/cxl-2-0-specification-memory-pooling-questions-from-the-webinar-part-2-2391/)
- [CXL 3.0 白皮书](https://computeexpresslink.org/wp-content/uploads/2023/12/CXL_3.0_white-paper_FINAL-1.pdf)
- [Linux CXL 地址映射](https://www.kernel.org/doc/html/v6.12/driver-api/cxl/memory-devices.html)
- [CXL in Cloud Practice](https://pages.cs.wisc.edu/~markhill/papers/ieeetoc2026_cxl_practice.pdf)

这些页面不是硬件性能测评。图形大小、箭头长度和块数量除明确给出的教学算例外，不表示带宽、时间或实际产品配置。
