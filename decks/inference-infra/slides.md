---
theme: default
title: 推理基础设施介绍
titleTemplate: '%s'
info: |
  面向算法研究者的推理基础设施分享。
  开场案例：模型评测与 Robot Harness。
colorSchema: light
aspectRatio: 16/9
canvasWidth: 1280
fonts:
  sans: 'LXGW WenKai, PingFang SC, Microsoft YaHei'
  provider: none
transition: fade
drawings:
  persist: false
htmlAttrs:
  lang: zh-CN
exportFilename: inference-infra-opening
defaults:
  layout: lecture
class: cover-page
clicks: 0
---

# Introduction to Inference Infra

<!--
从大家熟悉的模型评测和机器人任务出发，讨论模型设计完成后，系统怎样影响实际运行效率。随后沿Qwen的执行过程，依次分析单卡计算、多卡通信和KV存储。
-->


---
class: outline-page
clicks: 0
---

# 讲解路线

::left::

<div class="outline-map" role="group" aria-label="讲解路线：Infra 的作用、计算、网络、存储。">
  <ol class="outline-rows">
    <li><span class="outline-topic">Infra 的作用</span><span class="outline-description">模型评测与机器人任务</span></li>
    <li><span class="outline-topic">计算</span><span class="outline-description">单卡执行与优化</span></li>
    <li><span class="outline-topic">网络</span><span class="outline-description">多卡分工与通信</span></li>
    <li><span class="outline-topic">存储</span><span class="outline-description">KV 管理与内存池</span></li>
  </ol>
</div>

::footer::

<span>{{ $page }} / {{ $nav.total }}</span>

<!--
先通过模型评测和Robot Harness建立动机，再讲Infra的职责以及理解系统的实际用途。技术主体用三个连续问题组织：单卡如何执行、多卡如何协作、KV如何存放。计算会访问显存，通信也会搬运缓存；三个部分按讲解重点区分，不是彼此独立的系统边界。
-->


---

# A real case in production

::lead::

开发者用 8 张 H100，通过lm-evaluation-harness 的 HF 后端，<br> 在 GSM8K 上评测 Llama 3.1 405B。<br>


::left::

## HF Backend 当时**采用朴素流水执行**

<div class="state-matrix" role="group" aria-label="HF 朴素流水执行的两个阶段示意，不表示实测时长">

| 阶段 | GPU 0 | GPU 1 | GPU 2 | GPU 3 | GPU 4 | GPU 5 | GPU 6 | GPU 7 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 先执行 | <span class="state-active">计算</span> | 等待 | 等待 | 等待 | 等待 | 等待 | 等待 | 等待 |
| 再执行 | 等待 | <span class="state-active">计算</span> | 等待 | 等待 | 等待 | 等待 | 等待 | 等待 |

</div>

::right::

## 开发者报告

### HF 后端

约一天，完成约 5%

<div class="tone-accent">

### vLLM 后端

约 3 小时，全部完成

</div>

::takeaway::

推理后端如何使用这些 GPU，会直接影响效率

::footer::

<span>引入 · 为什么需要 Infra</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
先讲任务和 GPU 利用率，再沿两行示意说明计算如何交接，最后看右侧的评测结果。
来源：https://github.com/EleutherAI/lm-evaluation-harness/issues/2193
维护者解释：https://github.com/EleutherAI/lm-evaluation-harness/issues/2193#issuecomment-2305187873
2024 年的个案。图示只表示先后关系，不表示实测时长。vLLM 的完整精度配置未披露，不计算严格加速倍数；维护者还指出显存不足可能触发 CPU / 磁盘 offload，不能将全部耗时差异归于串行执行。
-->

---

# Robot Harness：推理耗时影响任务效率

::lead::

Pantograph 用大模型控制机器人，完成放球、收毛巾等操作。<br>
每次任务最多 20 分钟或 96 轮，先到即停。

::left::

## 观察、推理、执行，逐轮推进任务

<figure class="flow-cycle flow-with-media" aria-label="Robot Harness 的观察、推理、执行闭环。两张照片来自 Pantograph 同一次放球任务的视频，表示不同阶段，并非相邻的两轮。箭头表示先后依赖，不表示耗时。">
  <div class="flow-row">
    <div class="flow-node has-media">
      <h3>获取观察</h3>
      <img class="flow-image" src="/images/robot-harness/ball-into-bowl-observation.jpg" alt="机器人摄像头的真实画面：碗和球在地面上，前方可见双臂。" />
    </div>
    <span class="flow-arrow" aria-hidden="true"></span>
    <div class="flow-node tone-warm">
      <h3>大模型推理</h3>
      <p>返回工具调用</p>
    </div>
    <span class="flow-arrow" aria-hidden="true"></span>
    <div class="flow-node has-media tone-accent">
      <h3>执行动作</h3>
      <img class="flow-image" src="/images/robot-harness/ball-into-bowl-action.jpg" alt="同一次任务中的执行画面：机器人右侧夹爪将球移到碗口附近。" />
    </div>
  </div>
  <figcaption class="flow-return"><span>执行后返回新图像</span></figcaption>
</figure>

::right::


### 提高 reasoning effort

响应变慢，两种模型的<br>
成功率均下降

<div class="tone-accent result-gap">

限制模型采用 low effort

</div>

::takeaway::

推理耗时直接影响任务效率，也可能影响限时任务的成功率

::footer::

<span>引入 · 为什么需要 Infra</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
从“把球放进碗里”进入，沿图走一轮：摄像头返回真实画面，模型根据图像和近期动作记录给出工具调用，Harness 执行动作并返回新画面。照片展示同一次任务的不同阶段，并非相邻的两轮，不用它们推断具体调用或动作耗时。
来源：https://pantograph.com/journal/vlm-harness ，2026-09。
观察画面：原文所选 GPT 成功视频的 0.1 秒帧，视频为 30 倍速：https://pantograph.com/videos/journal/vlm-harness/ball-into-bowl__gpt__g4__h0323__01M2HB3Y9D1S5JJ87FB237B9K4__30x.mp4
执行画面：同一视频的原始封面帧：https://pantograph.com/images/journal/vlm-harness/posters/ball-into-bowl__gpt__g4__h0323__01M2HB3Y9D1S5JJ87FB237B9K4__30x.jpg
报告评测 GPT-6 Astra 和 Claude Fable 5.1。推理处在逐轮交互的关键路径上，会计入任务总耗时。原文在单任务预实验中发现，提高 reasoning effort 后，两种模型响应更慢、成功率更低，因此正式实验使用 low effort。这个结果支持在限时场景中同时关注延迟与成功率，但没有隔离推理质量等变量，不能据此断言“推理越快，成功率必然越高”。20 分钟是整次任务的上限，不是一次模型调用的延迟。图示只表示流程关系，不表示实测耗时。
-->

---
class: diagram-page question-led
---

# Inference Infra：如何让模型高效部署、运行

::lead::

<div class="question-strip">
  <div class="question-context"><span>为了让模型</span><strong>高效部署、运行</strong></div>
  <p>我们需要关注哪些问题？</p>
</div>

::left::

<figure class="system-map compact-map" aria-label="模型运行涉及数据放置、请求合批、多卡协作和结果交接。上方模型参数分配到两张 GPU，GPU 内保存参数和运行状态；左侧请求合批进入计算，结果从右侧交给下一步。箭头表示数据去向，不表示耗时或特定并行算法。">
  <svg class="map-wires" viewBox="0 0 1168 400" aria-hidden="true">
    <defs>
      <marker id="system-map-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <path class="map-placement-wire" d="M 605 110 V 160 H 435 V 182" marker-end="url(#system-map-arrow)" />
    <path class="map-placement-wire" d="M 605 160 H 775 V 182" marker-end="url(#system-map-arrow)" />
    <path d="M 158 256 H 192 L 216 282 M 158 282 H 216 M 158 308 H 192 L 216 282" />
    <path d="M 216 282 H 324" marker-end="url(#system-map-arrow)" />
    <path d="M 548 282 H 662" marker-start="url(#system-map-arrow)" marker-end="url(#system-map-arrow)" />
    <path d="M 886 282 H 1007" marker-end="url(#system-map-arrow)" />
  </svg>
  <div class="map-object" style="left: 510px; top: -15px; width: 190px;">
    <h3>模型</h3>
    <svg class="map-model" viewBox="0 0 126 62" aria-hidden="true"><rect x="1" y="1" width="124" height="60" rx="2" /><path d="M 32 1 V 61 M 63 1 V 61 M 94 1 V 61 M 1 21 H 125 M 1 41 H 125" /></svg>
  </div>
  <p class="map-caption" style="left: 638px; top: 112px; width: 206px;">数据放置</p>
  <div class="map-object" style="left: 0; top: 193px; width: 162px;">
    <h3>请求</h3>
    <div class="map-request-stack" aria-hidden="true"><i></i><i></i><i></i></div>
  </div>
  <p class="map-caption" style="left: 187px; top: 225px; width: 138px;">请求合批</p>
  <div class="map-object map-accelerator" style="left: 330px; top: 190px; width: 210px;">
    <h3>GPU 0</h3>
    <div class="map-memory"><span class="memory-region">参数</span><span class="memory-region is-state">状态</span></div>
  </div>
  <div class="map-object map-accelerator" style="left: 670px; top: 190px; width: 210px;">
    <h3>GPU 1</h3>
    <div class="map-memory"><span class="memory-region">参数</span><span class="memory-region is-state">状态</span></div>
  </div>
  <p class="map-caption" style="left: 543px; top: 225px; width: 124px;">多卡协作</p>
  <p class="map-caption" style="left: 883px; top: 225px; width: 128px;">结果交接</p>
  <div class="map-object map-destination" style="left: 1015px; top: 246px; width: 153px;">
    <h3>下一步</h3>
  </div>
</figure>

::footer::

<span>引入 · 为什么需要 Infra</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
承接两个案例：模型有了，接下来还要安排它怎样在机器上执行。
从上往下看，模型参数需要分配到 GPU，执行时还要给运行状态留出空间；沿左到右看，请求怎样合批，GPU 怎样协作，算出的结果怎样交给后续步骤。这些就是 Inference Infra 要处理的问题。
“下一步”可以是返回评测结果，也可以是执行机器人动作。两张 GPU 仅用于说明分工；连线不指定流水并行或张量并行，也不表达实测耗时。上方分支表示模型放置，运行状态由请求执行过程产生。
参考：https://bojieli.github.io/ai-infra-book/manuscripts/00-前言.html
参考：https://bojieli.github.io/ai-infra-book/manuscripts/01-初识%20AI%20Infra.html
-->

---
class: diagram-page
---

# 从操作系统到推理 Infra

::left::

<figure class="system-map comparison-map" aria-label="左右对照：程序由操作系统安排进程执行，使用 CPU 和内存；模型与上下文交给推理引擎，由引擎安排请求执行，使用 GPU 和显存。中间虚线表示职责对应，竖直箭头表示执行依赖，处理器与存储之间的双向箭头表示数据读写。">
  <svg class="map-wires" viewBox="0 0 1168 510" aria-hidden="true">
    <defs><marker id="comparison-map-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker></defs>
    <path d="M 262 116 V 157" marker-end="url(#comparison-map-arrow)" />
    <path d="M 906 116 V 157" marker-end="url(#comparison-map-arrow)" />
    <path d="M 262 298 V 326 H 162 V 350" marker-end="url(#comparison-map-arrow)" />
    <path d="M 262 326 H 362 V 362" marker-end="url(#comparison-map-arrow)" />
    <path d="M 906 298 V 326 H 806 V 350" marker-end="url(#comparison-map-arrow)" />
    <path d="M 906 326 H 1006 V 362" marker-end="url(#comparison-map-arrow)" />
    <path class="map-comparison-wire" d="M 486 223 H 682 M 486 410 H 682" />
    <path d="M 226 410 H 286" marker-start="url(#comparison-map-arrow)" marker-end="url(#comparison-map-arrow)" />
    <path d="M 870 410 H 930" marker-start="url(#comparison-map-arrow)" marker-end="url(#comparison-map-arrow)" />
  </svg>
  <div class="map-object" style="left: 38px; top: 0; width: 448px;">
    <h3>程序</h3>
    <svg class="object-drawing" width="132" height="62" viewBox="0 0 132 62" aria-hidden="true"><rect class="drawing-paper" x="1" y="1" width="130" height="60" rx="3" /><path d="M 1 15 H 131 M 9 8 H 12 M 18 8 H 21 M 27 8 H 30" /><path class="drawing-accent-stroke" d="M 45 29 L 34 38 L 45 47 M 87 29 L 98 38 L 87 47 M 73 25 L 60 51" /></svg>
  </div>
  <div class="map-object" style="left: 682px; top: 0; width: 448px;">
    <h3>模型与上下文</h3>
    <svg class="object-drawing" width="230" height="62" viewBox="0 0 230 62" aria-hidden="true"><rect class="drawing-accent" x="1" y="1" width="94" height="60" rx="2" /><path d="M 24 1 V 61 M 48 1 V 61 M 72 1 V 61 M 1 21 H 95 M 1 41 H 95" /><path class="drawing-paper" d="M 142 1 H 226 Q 229 1 229 4 V 45 Q 229 48 226 48 H 166 L 148 60 V 48 H 142 Q 139 48 139 45 V 4 Q 139 1 142 1 Z" /><path d="M 153 16 H 214 M 153 28 H 200 M 111 23 V 39 M 103 31 H 119" /></svg>
  </div>
  <div class="map-object execution-zone" style="left: 38px; top: 164px; width: 448px;">
    <h3>操作系统</h3>
    <div class="queue-row"><span>进程</span><div class="queue-cells" aria-hidden="true"><i></i><i></i><i></i></div></div>
  </div>
  <div class="map-object execution-zone" style="left: 682px; top: 164px; width: 448px;">
    <h3>推理引擎</h3>
    <div class="queue-row"><span>请求</span><div class="queue-cells" aria-hidden="true"><i></i><i></i><i></i></div></div>
  </div>
  <p class="map-caption" style="left: 536px; top: 201px; width: 96px;">调度</p>
  <p class="map-caption" style="left: 501px; top: 387px; width: 166px;">计算与存储</p>
  <div class="map-object hardware-object" style="left: 90px; top: 358px; width: 144px;">
    <div class="processor-icon" aria-hidden="true"><div class="processor-cells"><i></i><i></i><i></i><i></i></div></div>
    <h3>CPU</h3>
  </div>
  <div class="map-object hardware-object" style="left: 288px; top: 370px; width: 148px;">
    <div class="memory-stick" aria-hidden="true"><i></i><i></i><i></i></div>
    <h3>内存</h3>
  </div>
  <div class="map-object hardware-object" style="left: 734px; top: 358px; width: 144px;">
    <div class="processor-icon" aria-hidden="true"><div class="processor-cells is-dense"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
    <h3>GPU</h3>
  </div>
  <div class="map-object hardware-object" style="left: 932px; top: 370px; width: 148px;">
    <div class="memory-stick" aria-hidden="true"><i></i><i></i><i></i></div>
    <h3>显存</h3>
  </div>
</figure>

::footer::

<span>引入 · 为什么需要 Infra</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
沿左右两列对照讲：写程序时，操作系统安排进程运行并管理内存，实际计算和读写由处理器与存储器完成。调用模型时，推理引擎也需要安排哪些请求运行、为它们管理状态，再组织 GPU 执行。
先看中间同样形状的队列，对照进程与请求的调度；再看下方处理器和存储的双向连线，说明计算离不开数据读取与写回。这些熟悉的系统问题，在模型推理中仍然存在。
本图按职责建立类比，未展示完整软件栈。推理引擎仍运行在操作系统之上；编译器、算子运行时、CPU 控制和设备互联均未展开。操作系统与推理引擎的调度对象和机制不同。芯片内方块只帮助区分图形，不对应实际核心数或性能比例；存储图形不表示物理封装。
参考：https://bojieli.github.io/ai-infra-book/manuscripts/00-前言.html
参考：https://bojieli.github.io/ai-infra-book/manuscripts/01-初识%20AI%20Infra.html
-->

---
class: diagram-page
---

# Understanding Infra

::left::

<figure class="diagram-triptych" aria-label="理解 Infra 的三个用途：估算模型需要的 GPU 和完成时间；比较理论耗时下界与实际耗时，寻找瓶颈；结合模型的计算需求和硬件约束改进结构设计。三者共同服务于减少资源开销、缩短实验周期。耗时条仅为关系示意，没有实测数值或比例含义。">
  <svg class="map-wires" viewBox="0 0 1168 510" aria-hidden="true">
    <defs><marker id="benefits-outcome-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker></defs>
    <path class="diagram-collector" d="M 180 405 V 416 H 988 V 405" />
    <path class="diagram-collector" d="M 584 416 V 437" marker-end="url(#benefits-outcome-arrow)" />
  </svg>
  <div class="diagram-panels">
    <section class="diagram-panel">
      <h2>估算资源</h2>
      <div class="mini-diagram" role="img" aria-label="根据模型需求，估算需要的 GPU 数量和运行时间。">
        <svg class="object-drawing mini-wires" viewBox="0 0 360 220" aria-hidden="true">
          <defs><marker id="resource-estimate-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker></defs>
          <rect class="drawing-accent" x="17" y="70" width="78" height="60" rx="2" />
          <path d="M 43 70 V 130 M 69 70 V 130 M 17 90 H 95 M 17 110 H 95" />
          <path class="drawing-neutral" d="M 105 100 H 168 V 57 H 203" marker-end="url(#resource-estimate-arrow)" />
          <path class="drawing-neutral" d="M 168 100 V 166 H 203" marker-end="url(#resource-estimate-arrow)" />
          <rect class="drawing-paper" x="213" y="15" width="65" height="65" rx="2" />
          <rect class="drawing-paper drawing-neutral" x="222" y="24" width="65" height="65" rx="2" />
          <rect class="drawing-accent" x="233" y="35" width="43" height="43" />
          <path d="M 247 35 V 78 M 262 35 V 78 M 233 49 H 276 M 233 64 H 276" />
          <path class="drawing-neutral" d="M 233 18 V 24 M 247 18 V 24 M 261 18 V 24 M 275 18 V 24 M 233 89 V 95 M 247 89 V 95 M 261 89 V 95 M 275 89 V 95" />
          <circle class="drawing-warm" cx="248" cy="166" r="28" />
          <path class="drawing-warm-stroke" d="M 248 145 V 166 L 263 175 M 248 139 V 143 M 248 189 V 193 M 221 166 H 225 M 271 166 H 275" />
        </svg>
        <span class="mini-label" style="left: 0; top: 143px; width: 112px;">模型</span>
        <span class="mini-label" style="left: 287px; top: 40px; width: 73px;">GPU</span>
        <span class="mini-label" style="left: 284px; top: 150px; width: 76px;">耗时</span>
      </div>
      <p class="diagram-question">需要几张卡？<br>跑多久？</p>
    </section>
    <section class="diagram-panel">
      <h2>判断瓶颈</h2>
      <div class="mini-diagram" role="img" aria-label="上下两条耗时条起点相同，分别表示理论下界与实际耗时。暖色标出需要进一步解释的差距；差距不能直接等同于可消除的实现开销。">
        <svg class="object-drawing mini-wires" viewBox="0 0 360 220" aria-hidden="true">
          <path class="drawing-guide" d="M 128 31 V 151 M 214 31 V 151" />
          <rect class="drawing-accent" x="128" y="47" width="86" height="27" />
          <rect class="drawing-accent" x="128" y="112" width="86" height="27" />
          <rect class="drawing-warm" x="214" y="112" width="110" height="27" />
          <path class="drawing-warm-stroke" d="M 214 151 V 163 H 324 V 151" />
        </svg>
        <span class="mini-label" style="left: 0; top: 44px; width: 115px;">理论下界</span>
        <span class="mini-label" style="left: 0; top: 109px; width: 115px;">实际耗时</span>
        <span class="mini-label is-warm" style="left: 214px; top: 172px; width: 110px;">差距</span>
      </div>
      <p class="diagram-question">时间花在哪里？</p>
    </section>
    <section class="diagram-panel">
      <h2>改进模型设计</h2>
      <div class="mini-diagram" role="img" aria-label="模型结构向 GPU 提出计算需求，硬件的容量、带宽等约束反过来影响模型结构的选择。">
        <svg class="object-drawing mini-wires" viewBox="0 0 360 220" aria-hidden="true">
          <defs><marker id="codesign-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker></defs>
          <path d="M 56 86 V 96 M 56 116 V 126" />
          <rect class="drawing-accent" x="17" y="66" width="78" height="20" rx="2" />
          <rect class="drawing-accent" x="17" y="96" width="78" height="20" rx="2" />
          <rect class="drawing-accent" x="17" y="126" width="78" height="20" rx="2" />
          <path class="drawing-neutral" d="M 108 79 H 242" marker-end="url(#codesign-arrow)" />
          <path class="drawing-neutral" d="M 242 133 H 108" marker-end="url(#codesign-arrow)" />
          <rect class="drawing-paper drawing-neutral" x="253" y="64" width="80" height="80" rx="2" />
          <rect class="drawing-accent" x="264" y="75" width="58" height="58" />
          <path d="M 279 75 V 133 M 293 75 V 133 M 307 75 V 133 M 264 90 H 322 M 264 104 H 322 M 264 118 H 322" />
          <path class="drawing-neutral" d="M 265 57 V 64 M 279 57 V 64 M 293 57 V 64 M 307 57 V 64 M 321 57 V 64 M 265 144 V 151 M 279 144 V 151 M 293 144 V 151 M 307 144 V 151 M 321 144 V 151" />
        </svg>
        <span class="mini-label" style="left: 8px; top: 165px; width: 96px;">模型</span>
        <span class="mini-label" style="left: 246px; top: 165px; width: 96px;">GPU</span>
        <span class="mini-label" style="left: 106px; top: 39px; width: 138px;">计算需求</span>
        <span class="mini-label" style="left: 115px; top: 145px; width: 120px;">硬件约束</span>
      </div>
      <p class="diagram-question">怎样设计，<br>才能跑得更高效？</p>
    </section>
  </div>
  <figcaption class="diagram-outcome">减少资源开销，优化模型设计</figcaption>
</figure>

::footer::

<span>引入 · 为什么需要 Infra</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
从大家准备启动一次实验讲起：先估算模型权重、运行状态和工作区需要多少显存，检查每张卡能否放下；再结合计算、数据读写、通信和依赖关系估算完成时间。第一幅图的 GPU 数量只是示意，并未给出某个模型的配置建议。
运行之后，用测量与估算对照，判断主要时间花在哪里。第二幅图只表达实际耗时与理论下界之间存在差距，不是实测图，也不表达特定比例。差距可能来自估算漏项，也可能来自实现开销，需要进一步测量，不能把暖色部分全部当作可消除的浪费。
理解硬件以后，还能反过来指导模型设计：不同结构对计算、运行状态和通信提出不同需求，容量与带宽等条件也影响哪些设计更合适。要在满足任务质量要求的前提下比较完整系统的效率，不能只看模型参数量或某个算子。
最终把这些判断落回实验：减少不必要的资源开销，更早拿到结果，在同样预算下比较更多方案。GPU 使用时间、资源单价和实验周期让性能收益能够转化为可核算的成本与迭代收益。
参考：https://bojieli.github.io/ai-infra-book/manuscripts/00-前言.html
参考：https://bojieli.github.io/ai-infra-book/manuscripts/01-初识%20AI%20Infra.html
-->

---
class: chapter-page
clicks: 0
---

# 计算 · 单卡执行与优化

<!--
承接Infra用途：要能估算资源和识别瓶颈，先把代码对应到真实硬件。下一页从Qwen的MLP出发，展开计算图、CUDA与GPU；再比较Prefill和Decode，利用Roofline分析计算与搬运的限制，最后讨论输出分块、K步长和双缓冲的取舍。
-->


---
class: diagram-page
---

# Behind PyTorch

::left::

<figure class="execution-map" aria-label="以 Qwen3-8B 的 MLP 为例。左上是 PyTorch 代码，右上是对应的数学计算图。蓝色突出 gate_proj 矩阵乘，并沿此运算展开下方的 CUDA 分块执行：输出矩阵的块交给线程块计算，线程块由 GPU 分配到 SM，计算时从显存读取输入和权重，再写回输出。图中的块与 SM 数量仅为示意。">
  <h2 class="diagram-heading" style="left: 0; top: 0;">PyTorch</h2>
  <p class="diagram-subject" style="left: 0; top: 43px;">Qwen3-8B 的 MLP</p>
  <div class="source-excerpt" style="left: 0; top: 91px; width: 405px;" aria-label="Qwen MLP 核心代码，按中间变量展开。">
    <code><span class="source-line is-traced">g = self.gate_proj(x)</span><span class="source-line">u = self.up_proj(x)</span><span class="source-line">h = self.act_fn(g) * u</span><span class="source-line">y = self.down_proj(h)</span></code>
  </div>
  <h2 class="diagram-heading" style="left: 500px; top: 0;">计算图</h2>
  <h2 class="diagram-heading" style="left: 0; top: 255px;">CUDA kernel</h2>
  <h2 class="diagram-heading" style="left: 652px; top: 255px;">GPU</h2>
  <svg class="execution-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="execution-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
      <marker id="execution-trace-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
      <marker id="execution-memory-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <path d="M 419 129 H 478" marker-end="url(#execution-arrow)" />
    <text class="annotation" x="448" y="109">展开</text>
    <text x="514" y="126">x</text>
    <path d="M 533 118 H 538 V 164 H 562" marker-end="url(#execution-arrow)" />
    <path class="trace-line" d="M 538 118 V 72 H 562" marker-end="url(#execution-trace-arrow)" />
    <rect class="traced-operation" x="568" y="50" width="144" height="44" rx="3" />
    <text class="operation-label trace-text" x="640" y="78">gate_proj</text>
    <rect class="operation" x="568" y="142" width="144" height="44" rx="3" />
    <text class="operation-label" x="640" y="170">up_proj</text>
    <path d="M 713 72 H 741" marker-end="url(#execution-arrow)" />
    <rect class="operation" x="748" y="50" width="84" height="44" rx="3" />
    <text x="790" y="79">SiLU</text>
    <path d="M 833 72 H 888 V 92" marker-end="url(#execution-arrow)" />
    <path d="M 713 164 H 888 V 144" marker-end="url(#execution-arrow)" />
    <circle class="operation" cx="888" cy="118" r="19" />
    <text class="math-symbol" x="888" y="128">×</text>
    <path d="M 909 118 H 937" marker-end="url(#execution-arrow)" />
    <rect class="operation" x="944" y="96" width="150" height="44" rx="3" />
    <text class="operation-label" x="1019" y="124">down_proj</text>
    <path d="M 1095 118 H 1127" marker-end="url(#execution-arrow)" />
    <text x="1147" y="126">y</text>
    <rect class="equation-focus" x="500" y="194" width="668" height="42" />
    <path class="trace-line" d="M 500 194 V 236" />
    <text class="tensor-equation trace-text" x="834" y="222">X[m,4096] × W[4096,12288] = Y[m,12288]</text>
    <path class="trace-guide" d="M 500 215 H 444 V 307 L 400 337" marker-end="url(#execution-trace-arrow)" />
    <text class="annotation" x="84" y="326">输出 Y</text>
    <rect class="tile" x="18" y="340" width="66" height="42" />
    <rect class="tile" x="84" y="340" width="66" height="42" />
    <rect class="tile" x="18" y="382" width="66" height="42" />
    <rect class="tile" x="84" y="382" width="66" height="42" />
    <text class="block-label" x="51" y="369">B0</text>
    <text class="block-label" x="117" y="369">B1</text>
    <text class="block-label" x="51" y="411">B2</text>
    <text class="block-label" x="117" y="411">B3</text>
    <path class="trace-line" d="M 165 382 H 226" marker-end="url(#execution-trace-arrow)" />
    <text class="annotation" x="195" y="364">分块</text>
    <text class="annotation" x="315" y="326">Thread blocks</text>
    <rect class="tile" x="244" y="340" width="62" height="34" rx="3" />
    <rect class="tile" x="324" y="340" width="62" height="34" rx="3" />
    <rect class="tile" x="244" y="390" width="62" height="34" rx="3" />
    <rect class="tile" x="324" y="390" width="62" height="34" rx="3" />
    <text class="block-label" x="275" y="365">B0</text>
    <text class="block-label" x="355" y="365">B1</text>
    <text class="block-label" x="275" y="415">B2</text>
    <text class="block-label" x="355" y="415">B3</text>
    <path class="trace-line" d="M 401 357 H 670" marker-end="url(#execution-trace-arrow)" />
    <path class="trace-line" d="M 401 407 H 670" marker-end="url(#execution-trace-arrow)" />
    <text class="annotation" x="534" y="390">调度到 SM</text>
    <rect class="hardware-boundary" x="652" y="302" width="516" height="137" rx="3" />
    <rect class="compute-unit" x="679" y="340" width="140" height="34" rx="3" />
    <rect class="compute-unit" x="679" y="390" width="140" height="34" rx="3" />
    <text x="749" y="366">SM</text>
    <text x="749" y="416">SM</text>
    <text class="annotation" x="1078" y="326">显存</text>
    <rect class="memory-region-drawing" x="1010" y="340" width="136" height="84" rx="3" />
    <path class="memory-line" d="M 1010 382 H 1146" />
    <text class="memory-text" x="1078" y="369">权重 / 输入</text>
    <text class="memory-text" x="1078" y="411">输出</text>
    <path class="memory-line" d="M 819 357 H 841 V 407 H 819" />
    <path class="memory-line" d="M 850 382 H 1001" marker-start="url(#execution-memory-arrow)" marker-end="url(#execution-memory-arrow)" />
    <text class="annotation memory-text" x="925" y="365">读取</text>
    <text class="annotation memory-text" x="925" y="414">写回</text>
  </svg>
  <figcaption class="diagram-outcome">以 Qwen 的MLP 为例，在底层经历了什么过程？</figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
从左上四行代码讲起。代码把 Hugging Face 的 Qwen3MLP.forward 按中间变量展开，act_fn 在 Qwen3-8B 中是 SiLU。两个线性投影读取同一个 x，gate 分支经过 SiLU，与 up 分支逐元素相乘，最后通过 down_proj。两路在数学上没有先后依赖，不表示当前 eager 实现会并发提交或执行它们。
蓝色选定 gate_proj，下方只继续展开这个矩阵乘，不是整个 MLP 的执行轨迹。图中的 X 为 m×4096，数学记号 W 为 4096×12288，Y 为 m×12288；PyTorch Linear 实际保存的 weight 是 out_features×in_features，公式里的 W 对应其转置。m 是本次参与投影的 token 总数；对等长请求 m=BP，普通 decode 时 P=1，故 m=B。Qwen3-8B 有 36 层，MLP 中间维度为 12288，这些尺寸为后续资源计算提供依据。
计算图表示数学运算与张量依赖，不是 CUDA Graph，也不表示 PyTorch eager 必须先捕获或编译整张图。框架选择算子实现，运行时由 CPU 发起 kernel launch；实现可能来自 cuBLAS 等算子库，也可能由编译器生成。一个算子可以由多个 kernel 完成，多个算子也可能融合为一个 kernel，不把代码行、图节点和 kernel 画成固定的一一对应。
下方采用单个矩阵乘 kernel 的一种常见分块方式：输出被划成 tile，线程块负责计算相应输出块。B0 至 B3 同时标记输出区域和负责该区域的线程块，帮助追踪对应关系。GPU 将线程块安排到有可用资源的 SM 上，四个块和两个 SM 仅为示意，不是实际 grid 尺寸、SM 数量或性能测量；不同实现也可能让多个块协作一个输出块。CPU 提交的是 kernel，不是逐个指定 SM。
SM 中的线程协作读取输入和权重、完成计算，再写回输出。图省略 L2、shared memory、寄存器和具体执行单元，显存与 SM 的箭头概括数据路径，不表示绕过片上存储。Tensor Core 的使用取决于形状、精度与实现选择。权重可在多次调用间驻留显存，但执行仍要读取它；这里没有画每次从 CPU 重新加载权重。
后续保持本页对象与颜色对应：由矩阵尺寸求参数量和 FLOPs，由精度换算字节，再结合容量、带宽、算力估算耗时。MLP 不产生 KV cache，后面若讨论 KV 状态，需要另外展开注意力部分。
来源：Qwen3-8B 配置 https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
来源：Hugging Face Qwen3MLP 实现 https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen3/modeling_qwen3.py
参考：https://bojieli.github.io/ai-infra-book/manuscripts/02-模型架构.html
参考：https://bojieli.github.io/ai-infra-book/manuscripts/05-算子与运行时.html
-->

---
class: diagram-page
clicks: 4
---

# GEMM：一个输出块怎样算出来

::left::

<figure class="gemm-figure tile-walk" :data-phase="Math.min($clicks, 4)" aria-label="Qwen3-8B gate_proj 的一种分块执行示意。输入为 8192 乘 4096，权重为 4096 乘 12288，使用 BF16 输入和 FP32 累加。追踪一个 64 乘 64 输出块，每轮沿 K 读取 32 个元素。按下一步依次展示读取、累加、下一段 K，以及全部 128 轮完成后的写回。">
  <p class="gemm-context">gate_proj：X [8192, 4096] × W [4096, 12288] = Y [8192, 12288]</p>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="tile-walk-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
      <marker id="tile-walk-warm" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
      <marker id="tile-walk-blue" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <text class="matrix-name" x="148" y="73">X 的 64 行</text>
    <rect class="matrix-base" x="28" y="101" width="240" height="66" />
    <path class="grid-line" d="M 88 101 V 167 M 148 101 V 167 M 208 101 V 167" />
    <rect class="k-window" x="28" y="101" width="60" height="66" :style="{ transform: `translateX(${$clicks >= 4 ? 180 : $clicks >= 3 ? 60 : 0}px)` }" />
    <text class="block-label" x="58" y="143">X₀</text>
    <text class="block-label" x="118" y="143">X₁</text>
    <text x="178" y="143">…</text>
    <text class="block-label" x="238" y="143">X₁₂₇</text>
    <text class="annotation" x="148" y="201">每块 64 × 32</text>
    <text class="matrix-name" x="449" y="73">W 的 64 列</text>
    <rect class="matrix-base" x="402" y="94" width="94" height="128" />
    <path class="grid-line" d="M 402 126 H 496 M 402 158 H 496 M 402 190 H 496" />
    <rect class="k-window" x="402" y="94" width="94" height="32" :style="{ transform: `translateY(${$clicks >= 4 ? 96 : $clicks >= 3 ? 32 : 0}px)` }" />
    <text class="block-label" x="449" y="118">W₀</text>
    <text class="block-label" x="449" y="150">W₁</text>
    <text x="449" y="182">…</text>
    <text class="block-label" x="449" y="214">W₁₂₇</text>
    <text class="annotation" x="581" y="171">32 × 64</text>
    <text class="matrix-name" x="1070" y="73">输出 Y</text>
    <rect class="matrix-base" x="1000" y="101" width="140" height="112" />
    <path class="grid-line" d="M 1070 101 V 213 M 1000 157 H 1140" />
    <rect class="output-window" :class="{ 'is-complete': $clicks >= 4 }" x="1000" y="101" width="70" height="56" />
    <text class="annotation" x="1070" y="243">64 × 64 输出块</text>
    <text x="777" y="101">K 每轮推进 32</text>
    <text class="trace-text" x="777" y="145">4096 ÷ 32 = 128 轮</text>
    <text class="annotation" x="777" y="188">BF16 输入 · FP32 累加</text>
    <path class="walk-read" d="M 84 214 V 356 H 201" marker-end="url(#tile-walk-warm)" />
    <path class="walk-read" d="M 402 233 H 154 V 356" />
    <rect class="cache-box" x="208" y="322" width="60" height="70" rx="3" />
    <text class="annotation" x="238" y="365">L2</text>
    <path class="walk-read" d="M 269 356 H 313" marker-end="url(#tile-walk-warm)" />
    <rect class="hardware-boundary" x="300" y="262" width="796" height="172" rx="3" />
    <text class="left-label matrix-name" x="323" y="291">SM：一个线程块</text>
    <text class="annotation" x="434" y="323">共享内存</text>
    <rect class="operand-buffer" x="324" y="336" width="220" height="67" rx="3" />
    <g class="resident-operands" :class="{ 'is-ready': $clicks >= 1 }">
      <rect class="tile-input" x="338" y="350" width="84" height="38" />
      <rect class="tile-input" x="446" y="350" width="84" height="38" />
      <text class="memory-text" x="380" y="377">X 块</text>
      <text class="memory-text" x="488" y="377">W 块</text>
    </g>
    <g v-if="$clicks === 1 || $clicks === 3" :key="`x-${$clicks}`" class="transfer-packet" :style="{ '--packet-dx': `${$clicks === 3 ? -250 : -310}px`, '--packet-dy': '-249px', '--packet-via-x': '-142px', '--packet-via-y': '-12px' }">
      <rect class="tile-input" x="338" y="350" width="84" height="38" />
    </g>
    <g v-if="$clicks === 1 || $clicks === 3" :key="`w-${$clicks}`" class="transfer-packet" :style="{ '--packet-dx': '-44px', '--packet-dy': `${$clicks === 3 ? -224 : -256}px`, '--packet-via-x': '-250px', '--packet-via-y': '-12px' }">
      <rect class="tile-input" x="446" y="350" width="84" height="38" />
    </g>
    <path class="walk-compute" d="M 553 369 H 602" marker-end="url(#tile-walk-blue)" />
    <rect class="compute-stage" :class="{ 'is-computing': $clicks >= 2 }" x="610" y="336" width="184" height="67" rx="3" />
    <text x="702" y="361">Tensor Cores</text>
    <text class="annotation" x="702" y="394">乘加</text>
    <path class="walk-compute" d="M 803 369 H 853" marker-end="url(#tile-walk-blue)" />
    <text class="annotation" x="962" y="323">寄存器 · FP32</text>
    <rect class="accumulator-stage" :class="{ 'has-sum': $clicks >= 2 }" x="862" y="336" width="200" height="67" rx="3" />
    <text v-if="$clicks &lt; 2" x="962" y="379">C = 0</text>
    <text v-else-if="$clicks === 2" x="962" y="379">C += X₀W₀</text>
    <text v-else-if="$clicks === 3" x="962" y="379">C += X₁W₁</text>
    <text v-else x="962" y="379">128 轮累加完成</text>
    <path class="walk-store" d="M 1070 369 H 1156 V 255 H 944 V 129 H 992" marker-end="url(#tile-walk-blue)" />
    <text class="annotation" x="1127" y="314">写回</text>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">一个线程块负责一个输出块，沿 K 分段计算</span>
    <span v-else-if="$clicks === 1">先读入 X、W 的小块，在片上反复使用</span>
    <span v-else-if="$clicks === 2">计算本轮乘加，部分结果保留在寄存器中</span>
    <span v-else-if="$clicks === 3">推进到下一段 K，继续累加到同一个输出块</span>
    <span v-else>全部 128 轮完成后，再写回这个输出块</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 4) + 1 }} / 5</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
承接 Behind PyTorch，固定 Qwen3-8B gate_proj 的一个 prefill GEMM：m=8192、K=4096、N=12288。模型维度与 FLOPs 口径沿用 infra-book 第二章；下方补充 NVIDIA 传统分块 Tensor Core GEMM 的教学执行示意，不声称这是书中第二章的 kernel 实现，也不声称捕获了某一版本 PyTorch、cuBLAS 或 vLLM 的实际执行轨迹。
选择输出 64×64、K 步长 32、BF16 输入、FP32 累加作为教学设定。这个输出块固定需要 X 的 64 行和 W 的 64 列；K=4096 分为 128 段，不能把图上省略的中间段当成只有四轮。X 与 W 都只画第一、第二、最后一段及省略号，输出 Y 只画几个代表性块，图形不按全矩阵尺寸比例缩放。
[click] 线程协作读取当前 X、W 块，经 L2 缓存路径进入共享内存。L2 命中时不必重新访问显存芯片，不能把全局加载请求直接等同于 DRAM 流量。本页采用串行阶段示意，不表达同步机制、异步复制或流水重叠。
[click] Warp 以片段组织数据，发出矩阵乘加指令。图省略输入操作数寄存器、warp 细分与指令级布局，Tensor Cores 与 FP32 累加器分开画是为了说明执行与结果驻留；累加器并不是 Tensor Core 外的一条额外全局存储访问。本图按传统 register-accumulator 路径讲解，不泛化到采用 Tensor Memory 等不同累加器存储的所有 GPU。
[click] 将 K 偏移从 0 推进到 32，复用同一组输入缓冲，继续累加同一个输出块。动画只示范第二轮，其余轮用省略号跳过。
[click] 累加全部 4096 个 K 元素后，在 epilogue 中按需要转换为 BF16 并写回输出。选择的 64×64 输出块含 4096 个元素；一轮输入共 8 KiB，计算 262144 FLOPs，FP32 累加器逻辑数据为 16 KiB，下一页比较这些量。这个单块历经 128 轮，总矩阵工作量为 33554432 FLOPs。单 kernel、无 split-K 的示意让一个线程块完成一个输出块；真实实现也可能采用 split-K 等策略，需另计归约和额外开销。
来源：https://bojieli.github.io/ai-infra-book/manuscripts/02-模型架构.html
来源：https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
硬件执行参考：https://docs.nvidia.com/cutlass/latest/media/docs/cpp/efficient_gemm.html
数据路径参考：https://developer.nvidia.com/blog/cutlass-linear-algebra-cuda/
-->

---
class: diagram-page
clicks: 2
---

# Prefill / Decode：同一条请求的两段计算

::left::

<figure class="gemm-figure request-stages" :data-phase="Math.min($clicks, 2)" aria-label="普通自回归生成。Prefill 同时处理四个已知输入 token，保存其 KV，并产生首个输出 y0。第一次 Decode 输入 y0，读取已有 KV，追加 y0 的 KV，产生 y1；下一次调用输入 y1，再产生 y2。框的宽度不表示时间。">
  <p class="gemm-context">已知输入可以一起处理；尚未生成的 token 需要等待</p>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="request-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
      <marker id="request-memory-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <text class="matrix-name trace-text" x="196" y="73">Prefill</text>
    <text class="matrix-name" :class="{ 'trace-text': $clicks >= 1 }" x="826" y="73">Decode</text>
    <path class="rule-line" d="M 528 90 V 419" />
    <g class="prompt-tokens">
      <rect class="matrix-base" x="50" y="99" width="58" height="44" /><text x="79" y="129">x₀</text>
      <rect class="matrix-base" x="128" y="99" width="58" height="44" /><text x="157" y="129">x₁</text>
      <rect class="matrix-base" x="206" y="99" width="58" height="44" /><text x="235" y="129">x₂</text>
      <rect class="matrix-base" x="284" y="99" width="58" height="44" /><text x="313" y="129">x₃</text>
      <path class="trace-line" d="M 79 144 V 180" marker-end="url(#request-arrow)" />
      <path class="trace-line" d="M 157 144 V 180" marker-end="url(#request-arrow)" />
      <path class="trace-line" d="M 235 144 V 180" marker-end="url(#request-arrow)" />
      <path class="trace-line" d="M 313 144 V 180" marker-end="url(#request-arrow)" />
    </g>
    <rect class="compute-stage is-computing" x="34" y="188" width="324" height="66" rx="3" />
    <text x="196" y="230">Qwen</text>
    <path class="trace-line" d="M 359 221 H 414" marker-end="url(#request-arrow)" />
    <rect class="output-tile" x="422" y="199" width="58" height="44" /><text class="trace-text" x="451" y="229">y₀</text>
    <text class="annotation" x="437" y="180">首个输出</text>
    <path class="memory-line" d="M 196 255 V 327" marker-end="url(#request-memory-arrow)" />
    <text class="annotation" x="337" y="311">保存输入的 KV</text>
    <rect class="operand-buffer" x="34" y="335" width="446" height="62" rx="3" />
    <rect class="tile-input" x="48" y="348" width="96" height="36" /><text class="cache-label" x="96" y="374">KV(x₀)</text>
    <rect class="tile-input" x="155" y="348" width="96" height="36" /><text class="cache-label" x="203" y="374">KV(x₁)</text>
    <rect class="tile-input" x="262" y="348" width="96" height="36" /><text class="cache-label" x="310" y="374">KV(x₂)</text>
    <rect class="tile-input" x="369" y="348" width="96" height="36" /><text class="cache-label" x="417" y="374">KV(x₃)</text>
    <g v-if="$clicks >= 1" class="step-arrival">
      <text class="annotation" x="583" y="167">{{ $clicks === 1 ? '输入 y₀' : '输入 y₁' }}</text>
      <path v-if="$clicks === 1" class="trace-line" d="M 481 221 H 669" marker-end="url(#request-arrow)" />
      <g v-else><rect class="output-tile" x="554" y="199" width="58" height="44" /><text class="trace-text" x="583" y="229">y₁</text><path class="trace-line" d="M 613 221 H 669" marker-end="url(#request-arrow)" /></g>
      <rect class="compute-stage is-computing" x="678" y="188" width="224" height="66" rx="3" />
      <text x="790" y="230">Qwen</text>
      <path class="trace-line" d="M 903 221 H 967" marker-end="url(#request-arrow)" />
      <rect class="output-tile" x="975" y="199" width="58" height="44" /><text class="trace-text" x="1004" y="229">{{ $clicks === 1 ? 'y₁' : 'y₂' }}</text>
      <text class="annotation" x="1004" y="180">新的输出</text>
      <path class="memory-line" d="M 711 334 V 263" marker-end="url(#request-memory-arrow)" />
      <path class="memory-line" d="M 870 255 V 327" marker-end="url(#request-memory-arrow)" />
      <text class="annotation" x="643" y="307">读取</text><text class="annotation" x="927" y="307">追加</text>
      <rect class="operand-buffer" x="570" y="335" width="552" height="62" rx="3" />
      <rect class="tile-input" x="584" y="348" width="320" height="36" /><text class="cache-label" x="744" y="374">KV(x₀ … x₃)</text>
      <rect class="tile-input cache-new" x="914" y="348" width="92" height="36" /><text class="cache-label" x="960" y="374">KV(y₀)</text>
      <g v-if="$clicks >= 2"><rect class="tile-input cache-new" x="1016" y="348" width="92" height="36" /><text class="cache-label" x="1062" y="374">KV(y₁)</text></g>
    </g>
    <text v-else class="annotation" x="826" y="222">等待首个输出，再开始下一次调用</text>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">Prefill 处理已知输入，并产生首个输出 token</span>
    <span v-else-if="$clicks === 1">单请求 Decode 每次输入一个新 token，复用已有 KV</span>
    <span v-else>下一次调用依赖当前输出，同一请求逐步向前生成</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
本页限定普通串行、自回归、decoder-only 推理，不展开 speculative decoding 或 multi-token prediction。x0 到 x3 是抽象 token 编号，不假设一个中文字就是一个 token。图表达调用依赖，框宽与箭头长度不代表时长。
Prefill 在每一层可以一起处理已经知道的多个输入位置，但仍有层间依赖和因果 attention 约束。取最后一个输入位置的 logits 采样 y0；首个输出来自 prefill 结束时的结果，不需要再额外执行一次完整 decode。左侧四组 KV 指整个模型各层中这些位置的缓存集合。
[click] 以 y0 作为新输入执行第一步 decode。attention 读取 x0 到 x3 的 KV，计算并追加 y0 的 KV，产生 y1。MLP 本次只处理 y0 这一行。右侧缓存是左侧缓存随请求延续后的状态，两幅快照不是复制两份常驻缓存。
[click] 下一步输入 y1，追加 KV(y1)，生成 y2。y2 刚被采样时尚未经过模型，所以此刻不画 KV(y2)。权重不随这些步骤改变，KV 随请求增长。与当前 GEMM 例子衔接：一条请求 prefill 的 m 是本次输入 token 数；单请求 decode 的 m=1，64 条独立请求各推进一步时 m=64。多请求可以合批，同一请求未来尚未生成的位置不能用普通合批提前处理。
来源：https://bojieli.github.io/ai-infra-book/manuscripts/02-模型架构.html
-->

---
class: diagram-page
clicks: 2
---

# 输入行数改变，GEMM 的形状也改变

::left::

<figure class="gemm-figure shape-comparison" :data-phase="Math.min($clicks, 2)" aria-label="Qwen3-8B 同一个 gate_proj 的形状变化。单请求 decode 的 m 为 1，64 条请求各推进一个 token 时 m 为 64，单请求 8192 token prefill 时 m 为 8192。权重始终为 4096 乘 12288，BF16 占 96 MiB；输入输出和矩阵计算量随 m 变化。矩阵图形示意行数变化，不按三种行数的实际比例缩放。">
  <p class="gemm-context">同一个 gate_proj，BF16 输入与输出</p>
  <div class="scenario-rail" aria-label="当前演示场景" aria-live="polite">
    <span v-if="$clicks === 0" class="is-current">单请求 decode</span>
    <span v-else-if="$clicks === 1" class="is-current">64 请求 decode</span>
    <span v-else class="is-current">8192 token prefill</span>
  </div>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <pattern id="shape-weight-grid" width="30" height="26" patternUnits="userSpaceOnUse"><path class="grid-line" d="M 30 0 H 0 V 26" /></pattern>
      <pattern id="shape-token-grid" width="36" height="20" patternUnits="userSpaceOnUse"><path class="grid-line" d="M 36 0 H 0 V 20" /></pattern>
    </defs>
    <text class="matrix-name" x="144" y="128">输入 X</text>
    <text class="matrix-name" x="571" y="128">权重 W</text>
    <text class="matrix-name" x="1000" y="128">输出 Y</text>
    <rect class="matrix-vary matrix-base" x="34" :y="$clicks === 0 ? 268 : $clicks === 1 ? 228 : 144" width="220" :height="$clicks === 0 ? 8 : $clicks === 1 ? 48 : 132" />
    <rect class="matrix-vary" x="34" :y="$clicks === 0 ? 268 : $clicks === 1 ? 228 : 144" width="220" :height="$clicks === 0 ? 8 : $clicks === 1 ? 48 : 132" fill="url(#shape-token-grid)" />
    <text class="math-symbol" x="332" y="219">×</text>
    <rect class="weight-fixed" x="421" y="146" width="300" height="130" />
    <rect x="421" y="146" width="300" height="130" fill="url(#shape-weight-grid)" />
    <rect class="weight-label-paper" x="494" y="189" width="154" height="44" />
    <text class="memory-text matrix-name" x="571" y="219">96 MiB</text>
    <text class="math-symbol" x="793" y="219">=</text>
    <rect class="matrix-vary output-tile" x="862" :y="$clicks === 0 ? 268 : $clicks === 1 ? 228 : 144" width="276" :height="$clicks === 0 ? 8 : $clicks === 1 ? 48 : 132" />
    <rect class="matrix-vary" x="862" :y="$clicks === 0 ? 268 : $clicks === 1 ? 228 : 144" width="276" :height="$clicks === 0 ? 8 : $clicks === 1 ? 48 : 132" fill="url(#shape-token-grid)" />
    <text class="annotation" x="144" y="312">{{ $clicks === 0 ? '1' : $clicks === 1 ? '64' : '8192' }} × 4096</text>
    <text class="annotation" x="571" y="312">4096 × 12288</text>
    <text class="annotation" x="1000" y="312">{{ $clicks === 0 ? '1' : $clicks === 1 ? '64' : '8192' }} × 12288</text>
    <path class="rule-line" d="M 0 337 H 1168" />
    <text class="metric-label" x="185" y="369">单个 GEMM 的计算量</text>
    <text class="metric-value trace-text" x="185" y="409">{{ $clicks === 0 ? '0.101 GFLOPs' : $clicks === 1 ? '6.44 GFLOPs' : '824.63 GFLOPs' }}</text>
    <text class="metric-label" x="584" y="369">输入 X ＋ 输出 Y</text>
    <text class="metric-value" x="584" y="409">{{ $clicks === 0 ? '32 KiB' : $clicks === 1 ? '2 MiB' : '256 MiB' }}</text>
    <text class="metric-label" x="982" y="369">单层 MLP 的权重</text>
    <text class="metric-value" x="982" y="409">3 × 96 = 288 MiB</text>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">全部权重参与计算，只得到一行输出</span>
    <span v-else-if="$clicks === 1">更多 token 共用权重，输入与输出也随之增大</span>
    <span v-else>矩阵形状变了，分块与资源预算也要重新选择</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
回到 infra-book 第二章的模型侧计算。固定 gate_proj K=4096、N=12288、BF16 输入/权重/输出。m 是当前参与投影的 token 总数，等长请求 m=BP；已有上下文不算成当前 MLP 的输入行。输入矩阵图只表达一行、较少行、很多行，不按实际 1:64:8192 比例缩放，精确行数看维度标签。
每个线性投影权重 4096×12288=50331648 个参数，BF16 为 100663296B=96MiB。三个 MLP 投影（down 的维度次序相反）合计 150994944 个参数、288MiB。图中 288MiB 是一个 MLP 层，不是 36 层全模型。
初始：m=1，F=2mKN=100663296 FLOPs，约 0.101GFLOPs；X=8KiB、Y=24KiB，合计 32KiB。数学上退化为向量与矩阵的乘法。若直接套用上一页的 128 行输出 tile，最多只包含一行有效输出，不能因前一页的 F/R 更高就断言大 tile 适合此形状。实际实现可能用其他 GEMV/GEMM 路径。
[click] 64 条独立请求各推进一个 token，m=64。F=6442450944 FLOPs，约 6.44GFLOPs；X=0.5MiB、Y=1.5MiB，合计 2MiB。权重集合保持 96MiB，多行提供权重复用机会，但实际 DRAM 流量仍取决于缓存、分块和实现。图不把逻辑权重容量当作每次必然只从显存读一次。此比较只看 MLP，不计算额外请求的 KV 状态和排队延迟，也不宣称 batch 增大会降低单请求时延。
[click] 单请求一次 prefill 8192 个 token，m=8192。F=824633720832 FLOPs，约 824.63GFLOPs；X=64MiB、Y=192MiB，合计 256MiB。三个 MLP GEMM 的矩阵工作约为 2473.90GFLOPs；还需另计 SiLU 与逐元素乘法。本页三个场景统一使用 GFLOPs，便于直接比较。这里列出的输入加输出只是本次 GEMM 两个张量的逻辑字节，不是完整 MLP 临时内存峰值，也不包含额外工作区或框架预留。
本页不提供估算时长或加速倍数，重点是同一权重矩阵面对不同 m 时的形状、算量、激活大小和分块适配。上一页的 64×64 与 128×128 都是用于解释的候选输出 tile，不是对某块具体 GPU 的最优配置建议。
来源：https://bojieli.github.io/ai-infra-book/manuscripts/02-模型架构.html
来源：https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
分块形状适配参考：https://docs.nvidia.com/cutlass/latest/media/docs/cpp/efficient_gemm.html
-->

---
class: diagram-page
clicks: 2
---

# Roofline：搬运数据与执行计算，谁先限制速度？

::left::

<figure class="gemm-figure roofline-primer" :data-phase="Math.min($clicks, 2)" aria-label="A100 80GB SXM 的理想 Roofline，采用 BF16 稠密 Tensor Core 峰值 312 TFLOP 每秒，显存带宽 2.039 TB 每秒。双对数坐标。带宽线和算力线的交点约为 153 FLOP 每字节。曲线表示吞吐上限，不表示实测。">
  <p class="gemm-context">A100 80GB SXM · BF16 稠密计算 · 理论上限</p>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <text class="left-label memory-text" x="12" y="92">显存带宽</text>
    <text class="left-label matrix-name" x="12" y="130">2.039 TB/s</text>
    <g v-if="$clicks >= 1" class="step-arrival">
      <text class="left-label trace-text" x="12" y="190">计算吞吐上限</text>
      <text class="left-label matrix-name" x="12" y="228">312 TFLOP/s</text>
    </g>
    <text class="left-label" x="12" y="303">I = 计算量 / 传输量</text>
    <text class="left-label annotation" x="12" y="341">每搬运 1 B，做多少 FLOP？</text>
    <text v-if="$clicks >= 2" class="left-label trace-text" x="12" y="410">拐点 ≈ 153 FLOP/B</text>
    <text class="plot-axis-title" x="790" y="69">计算吞吐（TFLOP/s，对数）</text>
    <path class="plot-axis" d="M 450 92 V 360 H 1144" />
    <path class="plot-grid" d="M 450 360.000 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="367.000">1</text>
    <path class="plot-grid" d="M 450 273.333 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="280.333">10</text>
    <path class="plot-grid" d="M 450 186.667 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="193.667">100</text>
    <path class="plot-grid" d="M 450 100.000 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="107.000">1000</text>
    <path class="plot-tick-line" d="M 498.013 360 V 368" /><text class="plot-tick" x="498.013" y="393">1</text>
    <path class="plot-tick-line" d="M 657.510 360 V 368" /><text class="plot-tick" x="657.510" y="393">10</text>
    <path class="plot-tick-line" d="M 817.007 360 V 368" /><text class="plot-tick" x="817.007" y="393">100</text>
    <path class="plot-tick-line" d="M 976.503 360 V 368" /><text class="plot-tick" x="976.503" y="393">1000</text>
    <path class="plot-tick-line" d="M 1136.000 360 V 368" /><text class="plot-tick" x="1136.000" y="393">10000</text>
    <text class="plot-axis-title" x="793" y="431">运算强度 I（FLOP/B，对数）</text>
    <path v-if="$clicks === 0" class="roof-memory" d="M 450 359.273 L 927.152 100" />
    <g v-else>
    <path class="roof-memory" d="M 450 359.273 L 846.472 143.840" />
    <path class="roof-compute" d="M 846.472 143.840 H 1136" />
    </g>
    <text v-if="$clicks === 0" class="memory-text" x="955" y="213">带宽 × I</text>
    <g v-if="$clicks >= 1" class="step-arrival">
      <text class="trace-text" x="1030" y="124">算力上限</text>
      <text class="memory-text" x="653" y="203">带宽上限</text>
    </g>
    <g v-if="$clicks >= 2" class="step-arrival">
    <path class="plot-guide" d="M 846.472 143.840 V 360" />
      <circle class="roof-point" cx="846.472" cy="143.840" r="6" />
      <text class="annotation" x="655" y="338">带宽约束</text>
      <text class="annotation" x="1007" y="338">算力约束</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">每字节做的运算少，数据供给先限制计算吞吐</span>
    <span v-else-if="$clicks === 1">数据复用提高后，计算单元也有自己的上限</span>
    <span v-else>比较运算强度与拐点，判断先受哪一项约束</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
本页把前面“计算量”接到“运行速度”。设 F 是浮点运算次数，R 是跨 HBM 接口的传输字节，C 是相应精度与运算路径的峰值 FLOP/s，β 是 HBM 峰值 B/s。在充分重叠的理想模型中，T≥max(F/C,R/β)，从而 P=F/T≤min(C,βI)，I=F/R。这里是上下界分析，未计 launch、同步、尾部、指令开销、低并行度，也不保证实现能达到任何一条上限。
采用真实规格 A100 80GB SXM：BF16 dense Tensor Core 312×10^12 FLOP/s，HBM 带宽 2039×10^9 B/s。排除标注 sparsity 的 624 TFLOP/s，也不混用 80GB PCIe 的 1935 GB/s。交点为 312/2.039=153.0161844 FLOP/B。纵轴计算吞吐单位 TFLOP/s 与前页计算工作量 GFLOPs 不同；前页三个工作量仍统一 GFLOPs。
横轴范围 0.5 到 10000 FLOP/B，纵轴 1 到 1000 TFLOP/s，均为以 10 为底的对数轴；图中坐标按数值精确生成。第一步只显示带宽这一条约束，因此其中高于算力的部分只是假设尚未加入算力限制的边界，不代表合法完整 roofline。
[click] 加上计算上限后取两条约束中的较低者，截去超过算力的带宽线。斜线与水平线分别用暖色与蓝色。
[click] 显示交点。左侧在该模型下受带宽上限约束；右侧的 ceiling 由算力决定。高 I 不足以证明真实 kernel compute bound；并行不足或其他开销仍可导致性能远低于屋顶。上下文长度、attention 和 KV 访问必须另行计数，不能由一个 GEMM 推断整个模型的瓶颈。
GPU 规格：https://resources.nvidia.com/en-us-gpu/nvidia-a100-datashee-1
Roofline 与适用条件：https://docs.nvidia.com/deeplearning/performance/dl-performance-gpu-background/index.html#understanding-performance
-->

---
class: diagram-page
clicks: 2
---

# 同一个 GEMM，在 Roofline 上的位置为何不同？

::left::

<figure class="gemm-figure roofline-cases" :data-phase="Math.min($clicks, 2)" aria-label="Qwen3-8B gate_proj 的三个输入形状，沿用 A100 80GB SXM 的 BF16 稠密 Roofline。假设权重和输入各从显存读一次，输出写一次，运算强度约为 1、62.69、2234.18 FLOP 每字节。空心点表示这些假设下的吞吐上限位置，不是实测值。">
  <p class="gemm-context">gate_proj · BF16；假设 W、X 各从显存读一次，Y 写回一次</p>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <text class="left-label matrix-name trace-text" x="12" y="88">{{ $clicks === 0 ? '单请求 decode' : $clicks === 1 ? '64 请求 decode' : '8192 token prefill' }}</text>
    <text class="left-label annotation" x="12" y="140">计算量 F</text>
    <text class="left-label" x="12" y="176">{{ $clicks === 0 ? '0.101 GFLOPs' : $clicks === 1 ? '6.44 GFLOPs' : '824.63 GFLOPs' }}</text>
    <text class="left-label annotation" x="12" y="233">假设的显存传输量 R</text>
    <text class="left-label" x="12" y="269">{{ $clicks === 0 ? '96.03 MiB' : $clicks === 1 ? '98 MiB' : '352 MiB' }}</text>
    <text class="left-label annotation" x="12" y="326">运算强度 I = F / R</text>
    <text class="left-label trace-text" x="12" y="362">{{ $clicks === 0 ? '≈ 1 FLOP/B' : $clicks === 1 ? '≈ 63 FLOP/B' : '≈ 2234 FLOP/B' }}</text>
    <text class="left-label annotation" x="12" y="420">A100 80GB SXM · 上限估算</text>
    <text class="plot-axis-title" x="790" y="69">计算吞吐（TFLOP/s，对数）</text>
    <path class="plot-axis" d="M 450 92 V 360 H 1144" />
    <path class="plot-grid" d="M 450 360.000 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="367.000">1</text>
    <path class="plot-grid" d="M 450 273.333 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="280.333">10</text>
    <path class="plot-grid" d="M 450 186.667 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="193.667">100</text>
    <path class="plot-grid" d="M 450 100.000 H 1136" /><text class="plot-tick plot-y-tick" x="433" y="107.000">1000</text>
    <path class="plot-tick-line" d="M 498.013 360 V 368" /><text class="plot-tick" x="498.013" y="393">1</text>
    <path class="plot-tick-line" d="M 657.510 360 V 368" /><text class="plot-tick" x="657.510" y="393">10</text>
    <path class="plot-tick-line" d="M 817.007 360 V 368" /><text class="plot-tick" x="817.007" y="393">100</text>
    <path class="plot-tick-line" d="M 976.503 360 V 368" /><text class="plot-tick" x="976.503" y="393">1000</text>
    <path class="plot-tick-line" d="M 1136.000 360 V 368" /><text class="plot-tick" x="1136.000" y="393">10000</text>
    <text class="plot-axis-title" x="793" y="431">运算强度 I（FLOP/B，对数）</text>
    <path class="roof-memory" d="M 450 359.273 L 846.472 143.840" />
    <path class="roof-compute" d="M 846.472 143.840 H 1136" />
    <path class="plot-guide" d="M 846.472 143.840 V 360" />
    <text class="annotation" x="846.472" y="117">拐点 ≈ 153</text>
    <path class="roof-projection" :d="`M ${$clicks === 0 ? 497.991 : $clicks === 1 ? 784.665 : 1032.187} ${$clicks === 0 ? 333.196 : $clicks === 1 ? 177.424 : 143.840} V 360`" />
    <circle class="roof-point moving-roof-point" :cx="$clicks === 0 ? 497.991 : $clicks === 1 ? 784.665 : 1032.187" :cy="$clicks === 0 ? 333.196 : $clicks === 1 ? 177.424 : 143.840" r="7" />
    <text class="roof-estimate" :x="$clicks === 0 ? 644 : $clicks === 1 ? 659 : 940" :y="$clicks === 0 ? 317 : $clicks === 1 ? 155 : 225">{{ $clicks === 0 ? '≤ 2.04 TFLOP/s' : $clicks === 1 ? '≤ 127.83 TFLOP/s' : '≤ 312 TFLOP/s' }}</text>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">一行输入难以复用权重，带宽上限远低于算力上限</span>
    <span v-else-if="$clicks === 1">更多输入共享权重，运算强度提高，但尚未跨过拐点</span>
    <span v-else>该假设下已跨过拐点；实际实现还要兑现数据复用</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
延续上一页同一张硬件 roofline。固定 gate_proj k=4096,n=12288，BF16 输入、权重、输出（每元素 2B），FP32 片上累加。仅分析该独立 GEMM，不包括 attention、KV Cache、整个 MLP 或整模型。将 W、X 各从 HBM 读取一次、Y 向 HBM 写回一次作为清楚可复算的理想传输假设：F=2mkn，R=2(kn+mk+mn)，I=F/R。R 是这种假设下的传输量，不是显存占用峰值。真实缓存驻留、重复读取、融合与额外工作区可能改变 R，尤其不能把矩阵容量直接当作实测 HBM 流量。
m=1：F=100663296 FLOPs；R=100696064B=96.03125MiB；I=0.9996745851；P上限=min(312,2.039I)=2.038336479 TFLOP/s。
[click] m=64：F=6442450944；R=102760448B=98MiB；I=62.6938775510；P上限=127.832816327 TFLOP/s。合批增加可复用的行数，但不保证降低单请求等待时间；若为了凑批等待请求，队列等待还需另计。
[click] m=8192：F=824633720832；R=369098752B=352MiB；I=2234.181818182；该模型的吞吐上限为312 TFLOP/s。prefill 单请求 8192 个已知输入与 64 请求 decode 是两种不同来源的行数，不能通过普通合批提前计算同一请求尚未生成的位置。
空心点严格绘在假设下的 min(C,βI) 屋顶上，只表示上限，不是实测性能、运行时间、实测瓶颈或加速倍数。实际性能点往往在屋顶下方。三场景每步只显示当前场景与当前点。
下一页回到实现：更好的分块可以减少重复加载，使实际传输量更接近理想假设，但要平衡共享内存、寄存器与并行度。下面分块页的32与64FLOP/B按每轮输入块加载计数，不能直接与本页跨HBM接口的完整GEMM口径混用。
模型维度：https://bojieli.github.io/ai-infra-book/manuscripts/02-模型架构.html
GPU 规格：https://resources.nvidia.com/en-us-gpu/nvidia-a100-datashee-1
Roofline：https://docs.nvidia.com/deeplearning/performance/dl-performance-gpu-background/index.html#understanding-performance
-->

---
class: diagram-page
clicks: 2
---

# 输出块变大，要付出多少片上空间？

::left::

<figure class="gemm-figure tile-comparison" :data-phase="Math.min($clicks, 2)" aria-label="教学比较：固定 BF16 输入、FP32 累加、K 步长 32、单缓冲，把输出块从 64 乘 64 增到 128 乘 128。每轮输入块从 8 KiB 变为 16 KiB，按输入读取计算的运算强度从 32 变为 64 FLOP 每字节，FP32 累加器逻辑数据则从 16 KiB 增至 64 KiB。更大的片上资源需求可能减少同时驻留的线程块。">
  <p class="gemm-context">输出块 Bₘ × Bₙ；BF16 输入，FP32 累加，K 步长 32，单缓冲</p>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <pattern id="small-output-grid" x="258" y="190" width="16" height="16" patternUnits="userSpaceOnUse"><path class="grid-line" d="M 16 0 H 0 V 16" /></pattern>
      <pattern id="large-output-grid" x="814" y="126" width="16" height="16" patternUnits="userSpaceOnUse"><path class="grid-line" d="M 16 0 H 0 V 16" /></pattern>
    </defs>
    <text class="matrix-name trace-text" x="290" y="66">输出块 64 × 64</text>
    <rect class="output-tile" x="258" y="190" width="64" height="64" />
    <rect x="258" y="190" width="64" height="64" fill="url(#small-output-grid)" />
    <rect class="tile-input" x="216" y="190" width="32" height="64" />
    <rect class="tile-input" x="258" y="148" width="64" height="32" />
    <text class="annotation memory-text" x="370" y="172">W 块</text>
    <text class="annotation memory-text" x="178" y="230">X 块</text>
    <g class="larger-tile-reveal" :class="{ 'is-revealed': $clicks >= 1 }">
      <text class="matrix-name trace-text" x="878" y="66">输出块 128 × 128</text>
      <rect class="output-tile" x="814" y="126" width="128" height="128" />
      <rect x="814" y="126" width="128" height="128" fill="url(#large-output-grid)" />
      <rect class="tile-input" x="772" y="126" width="32" height="128" />
      <rect class="tile-input" x="814" y="84" width="128" height="32" />
      <text class="annotation memory-text" x="992" y="108">W 块</text>
      <text class="annotation memory-text" x="733" y="198">X 块</text>
    </g>
    <text v-if="$clicks === 0" class="annotation" x="878" y="187">扩大输出块，会改变什么？</text>
    <text class="comparison-label" x="584" y="323">每轮输入</text>
    <text class="comparison-label" x="584" y="371">计算 / 输入读取</text>
    <text class="comparison-label" x="584" y="419">累加器</text>
    <rect class="resource-input" x="110" y="302" width="60" height="26" />
    <text class="resource-value" x="412" y="323">8 KiB</text>
    <rect class="resource-compute" x="110" y="350" width="64" height="26" />
    <text class="resource-value" x="412" y="371">32 FLOP/B</text>
    <g :class="{ 'resource-focus': $clicks >= 2 }">
      <rect class="resource-register" x="110" y="398" width="48" height="26" />
      <text class="resource-value" x="412" y="419">16 KiB</text>
    </g>
    <g class="larger-tile-reveal" :class="{ 'is-revealed': $clicks >= 1 }">
      <rect class="resource-input" x="704" y="302" width="120" height="26" />
      <text class="resource-value" x="1068" y="323">16 KiB</text>
      <rect class="resource-compute" x="704" y="350" width="128" height="26" />
      <text class="resource-value" x="1068" y="371">64 FLOP/B</text>
      <g :class="{ 'resource-focus': $clicks >= 2 }">
        <rect class="resource-register growing-register" x="704" y="398" :width="$clicks >= 2 ? 192 : 0" height="26" />
        <text v-if="$clicks >= 2" class="resource-value" x="1068" y="419">64 KiB</text>
        <text v-else class="resource-value" x="1068" y="419">?</text>
      </g>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">每轮读入 8 KiB，完成 262,144 次浮点运算</span>
    <span v-else-if="$clicks === 1">输入块增至 2 倍，乘加工作增至 4 倍</span>
    <span v-else>累加空间也增至 4 倍，可能减少同时驻留的线程块</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
这页比较的是教学 tile 配置，不是 cuBLAS 调参结果或实测速度。输入 BF16 每元素 2B、累加 FP32 每元素 4B，固定 BK=32，单级输入缓冲，没有 padding、对齐、额外寄存器与同步元数据。输出 tile 的边长在图上精确扩大两倍，面积扩大四倍；每一行条形只在同一指标内比较，跨行不共用数值尺度。
小块 BM=BN=64：输入逻辑字节 2(BM×BK+BK×BN)=8192B=8KiB，等于该示意的单级输入缓冲容量。每轮 FLOPs=2×BM×BN×BK=262144，因此输入读取口径的 F/R=32FLOP/B。输出块 FP32 累加器合计 4×BM×BN=16384B=16KiB。
[click] 大块 BM=BN=128：输入 16384B=16KiB；每轮 FLOPs=1048576，是小块的四倍；F/R=64FLOP/B。图中 X 块和 W 块各有一条边翻倍，所以输入块面积合计翻倍，输出面积则翻四倍。左右使用相同的空间尺度和排列方向，输入块位置不表示加载顺序。
[click] FP32 累加器合计 65536B=64KiB，是原来的四倍。这些值是跨线程合计的逻辑累加数据，不是每个线程用 64KiB，也不是共享内存用量。传统寄存器累加实现需要把它们分配到线程寄存器；实际寄存器分配、线程数和硬件限额共同决定占用。输入缓冲增加与累加器增加都会增加片上资源压力，可能减少同时驻留的块，不能由这些字节数直接得出速度或精确 occupancy。
承接 Roofline：这里用每轮输入块的加载量解释局部复用，与前页完整 GEMM 的 HBM 接口口径不同。
本页的 F/R 只统计每轮输入块的逻辑加载，忽略输出写回、缓存命中和重复 DRAM 传输，不能拿它直接当实测的 DRAM 运算强度。若换双缓冲，输入缓冲容量还需翻倍；没有在本页展开。m 或 n 很小时，大 tile 还会出现边界无效区域，因此不能把较大的 tile 直接判定为总是更快，输入行数已经在前面比较：m=1 或 m=64 时，128 行 tile 无法填满；m=8192 时两种输出块都能填满。下一页保持输出块不变，单独改变 K 步长与缓冲级数。
模型参数依据：https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
分块与资源取舍参考：https://docs.nvidia.com/cutlass/latest/media/docs/cpp/efficient_gemm.html
-->

---
class: diagram-page
clicks: 2
---

# GEMM 设置：每轮读多少，提前准备多少？

::left::

<figure class="gemm-figure pipeline-settings" :data-phase="Math.min($clicks, 2)" aria-label="固定输出块 64 乘 64，K 总长4096，BF16输入和FP32累加。K步长从32变64，循环从128轮减为64轮，单级输入缓冲从8变16KiB，输入读取口径的运算强度仍为32FLOP每字节。再使用双缓冲，输入缓冲合计32KiB，允许加载下一块与计算当前块重叠，累加器始终16KiB。">
  <p class="gemm-context">固定输出块 64 × 64，K = 4096；BF16 输入，FP32 累加</p>
  <svg class="execution-drawing gemm-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs><marker id="pipeline-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker></defs>
    <text class="matrix-name trace-text" x="240" y="83">{{ $clicks === 0 ? 'K 步长 32 · 单缓冲' : $clicks === 1 ? 'K 步长 64 · 单缓冲' : 'K 步长 64 · 双缓冲' }}</text>
    <rect class="matrix-base" x="24" y="109" width="432" height="48" />
    <path class="grid-line" d="M 96 109 V 157 M 168 109 V 157 M 240 109 V 157 M 312 109 V 157 M 384 109 V 157" />
    <rect class="pipeline-window tile-input" x="24" y="109" :width="$clicks === 0 ? 72 : 144" height="48" />
    <text x="60" y="142">32</text><text x="132" y="142">32</text><text x="276" y="142">…</text><text x="420" y="142">32</text>
    <text class="annotation" x="240" y="198">{{ $clicks === 0 ? '4096 / 32 = 128 轮' : '4096 / 64 = 64 轮' }}</text>
    <rect class="operand-buffer" x="24" y="231" width="202" height="92" rx="3" />
    <text class="annotation" x="125" y="266">当前输入块</text><text class="memory-text" x="125" y="303">{{ $clicks === 0 ? '8 KiB' : '16 KiB' }}</text>
    <g v-if="$clicks >= 2" class="step-arrival">
      <rect class="operand-buffer" x="254" y="231" width="202" height="92" rx="3" />
      <text class="annotation" x="355" y="266">下一输入块</text><text class="memory-text" x="355" y="303">16 KiB</text>
    </g>
    <text v-else class="annotation" x="355" y="286">用完后再装下一块</text>
    <path class="rule-line" d="M 512 65 V 329" />
    <text class="matrix-name" x="858" y="83">执行顺序示意</text>
    <text class="annotation" x="601" y="169">读取</text><text class="annotation" x="601" y="235">计算</text>
    <rect class="tile-input" x="666" y="140" width="102" height="42" /><text class="memory-text" x="717" y="169">读 0</text>
    <rect class="output-tile" x="778" y="206" width="102" height="42" /><text class="trace-text" x="829" y="235">算 0</text>
    <rect class="tile-input pipeline-task" :x="$clicks >= 2 ? 778 : 890" y="140" width="102" height="42" /><text class="memory-text pipeline-task" :x="$clicks >= 2 ? 829 : 941" y="169">读 1</text>
    <rect class="output-tile pipeline-task" :x="$clicks >= 2 ? 890 : 1002" y="206" width="102" height="42" /><text class="trace-text pipeline-task" :x="$clicks >= 2 ? 941 : 1053" y="235">算 1</text>
    <path class="pipeline-overlap" v-if="$clicks >= 2" d="M 778 131 V 122 H 880 V 131" />
    <text v-if="$clicks >= 2" class="annotation" x="829" y="298">算当前块，同时读下一块</text>
    <path class="rule-line" d="M 0 345 H 1168" />
    <text class="metric-label" x="185" y="382">共享内存中的输入缓冲</text>
    <text class="metric-value memory-text" x="185" y="420">{{ $clicks === 0 ? '8 KiB' : $clicks === 1 ? '16 KiB' : '2 × 16 = 32 KiB' }}</text>
    <text class="metric-label" x="584" y="382">FP32 累加器</text><text class="metric-value" x="584" y="420">16 KiB</text>
    <text class="metric-label" x="982" y="382">计算 / 输入读取</text><text class="metric-value" x="982" y="420">32 FLOP/B</text>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">先固定输出块，再选择沿 K 分多少轮计算</span>
    <span v-else-if="$clicks === 1">K 步长翻倍：循环减半，缓冲翻倍，复用比不变</span>
    <span v-else>双缓冲占用更多共享内存，换取读取与计算重叠的机会</span>
  </figcaption>
</figure>

::footer::

<span>计算 · 单卡执行与优化</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
这页把另外两个常见 GEMM 设置与上一页的输出块大小分开。输出块 BM×BN 固定为64×64，累加数据仍是64×64×4=16KiB。只比较逻辑数据量，未加padding、对齐、同步元数据、输入片段寄存器和其他临时值。图中的K条省略中间大多数段，右侧时序只表达允许的依赖和重叠，不表示实测时长、等时延、加速比或自动获得完美流水。
BK=32、1个输入buffer：每轮逻辑输入2(64×32+32×64)=8192B=8KiB，每轮F=2×64×64×32=262144FLOPs，128轮。F/Rinput=32FLOP/B。
[click] BK=64：每轮输入16KiB，每轮F=524288FLOPs，64轮。输入和运算同步翻倍，因此F/Rinput仍为32；完整输出块的总计算量、逻辑输入总量都保持不变。更大的BK减少mainloop轮次，可能摊薄循环、同步等每轮开销，但并非所有指令、同步都严格减半，也不保证更快。与放大BM、BN相比，不能把增加BK说成同样提高输入复用比。这里固定kernel数学任务，实际库会结合MMA指令、线程布局、传输粒度等选择BK。
[click] 同一BK=64使用2个输入buffer：一份用于计算当前块，另一份接收下一块；共享内存合计32KiB，累加器仍16KiB，运算强度仍32FLOP/B。读取与计算在调度、同步和异步搬运支持下有机会重叠；先填充、最后排空仍存在，也可能受同一资源竞争影响。增加stage会增加共享内存或寄存器需求，可能减少同时驻留的块。页上只画两轮，完整程序需要反复轮换缓冲。
讲述到此可复述三项选择：BM/BN决定一个块负责多少输出与可复用的数据；BK决定一次推进多少K与每轮缓冲；buffer/stage数决定可提前准备多少数据与潜在重叠。对单请求decode，BM过大会有无效行；对m=64，BM=128也不能填满；m=8192时二者都能整除，才更值得比较复用与资源压力。64和128是教学候选配置，不是指定硬件上的最优值，具体线程/warp数量还受指令路径与资源分配影响。
比较完成后回到任务目标：在正确结果的前提下测量该形状的kernel耗时及实际HBM流量，并结合服务吞吐与单请求延迟决定是否采用。提高occupancy或运算强度中的任何单项都不是最终目标。
来源：https://docs.nvidia.com/cutlass/latest/media/docs/cpp/efficient_gemm.html#pipelining
-->


---
class: chapter-page
clicks: 0
---

# 网络 · 多卡分工与通信

<!--
承接单卡优化：即使算子已经高效，单卡容量与吞吐仍有上限。先判断何时需要更多GPU，再看MLP分片带来的通信；扩展到几类并行分工、等待与互连范围，最后用跨超节点P/D部署追踪KV交接。模型切分时，每卡计算量减小，但需要传递中间结果；不同请求的副本并行不一定产生这些层内通信。
-->


---
class: diagram-page
clicks: 1
---

# 一张卡，什么时候不够用？

::left::

<figure class="gemm-figure network-figure" :data-phase="Math.min($clicks, 1)" aria-label="以 Qwen3-8B 的 BF16 权重和 KV Cache 为教学算例。一条8192 token请求的KV为1.125GiB；64条为72GiB，加约15.3GiB权重，超过图中80GiB容量预算。条形按容量成比例，未计工作空间。">
  <p class="gemm-context">Qwen3-8B · BF16 · 每条请求缓存 8192 token</p>
  <svg class="execution-drawing gemm-drawing network-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <text class="left-label matrix-name" x="34" y="86">{{ $clicks === 0 ? '1 条请求' : '64 条并发请求' }}</text>
    <text class="annotation" x="834" y="86">显存预算 80 GiB</text>
    <rect class="capacity-outline" x="34" y="112" width="800" height="112" />
    <rect class="tile-input" x="34" y="112" width="153" height="112" />
    <rect class="output-tile capacity-growth" x="187" y="112" :width="$clicks === 0 ? 11.25 : 720" height="112" />
    <text class="memory-text" x="110" y="156">权重</text>
    <text class="memory-text" x="110" y="195">≈ 15.3 GiB</text>
    <path class="budget-limit" d="M 834 102 V 239" />
    <path class="trace-line" :d="$clicks === 0 ? 'M 193 228 V 262 H 285' : 'M 547 228 V 244'" />
    <text class="trace-text" :x="$clicks === 0 ? 421 : 547" y="271">{{ $clicks === 0 ? 'KV Cache：1.125 GiB' : 'KV Cache：72 GiB' }}</text>
    <text v-if="$clicks === 0" class="annotation" x="570" y="178">还要留出工作空间</text>
    <g v-else class="step-arrival">
      <path class="hot-line" d="M 907 168 H 944" />
      <text class="left-label hot-text" x="959" y="158">已超出</text>
    <text class="left-label hot-text" x="959" y="193">显存预算</text>
    </g>
    <path class="rule-line" d="M 34 312 H 1134" />
    <text class="metric-label" x="226" y="358">显存容量</text>
    <text x="226" y="402">放得下？</text>
    <text class="metric-label" x="584" y="358">显存带宽</text>
    <text x="584" y="402">读得够快？</text>
    <text class="metric-label" x="942" y="358">计算吞吐</text>
    <text x="942" y="402">算得够快？</text>
    <path class="rule-line" d="M 405 340 V 411 M 763 340 V 411" />
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">权重放得下，还要为每条请求留出 KV Cache</span>
    <span v-else>容量或速度不够时，可以让更多 GPU 分担</span>
    </figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span>
    <span>步骤 {{ Math.min($clicks, 1) + 1 }} / 2</span>
    <span>{{ $page }} / {{ $nav.total }}</span>

<!--
从前面的单卡 GEMM 转向多卡。先说明容量、带宽、计算吞吐是不同的限制：计算资源并不是用来“管理内存”的同一个量。图中采用 80 GiB 显存容量预算作教学示意，不是某一型号 GPU 的实测可用显存；硬件标称 GB 与 GiB 不能直接等同。条形按 10 px/GiB 绘制，权重约 15.3 GiB，未计工作空间与其他运行时开销。
Qwen3-8B：36 层、8 个 KV heads、head_dim=128，BF16 每元素 2B。单 token 的全层 KV=2×36×8×128×2=147456B=144KiB；8192 token 请求为 1.125GiB。假设各请求独立、KV 全部保留，不做前缀共享或 KV 量化。
[click] 64 条请求的 KV=72GiB，权重加 KV 约87.3GiB，已经超过80GiB预算。Qwen3-8B 的权重本身可以放进一张大显存卡，不要把这页说成“8B 模型必须多卡”。增加独立模型副本可以分担并发；同一模型也可分片。量化、减少驻留请求等也是容量不足时可考虑的方案，这里选择多卡展开下一页。
下方只提示三种单卡上限，并未由本例证明带宽或算力也已耗尽。后续将追踪同一个 MLP 分到两张卡后，哪些数据必须交换。
配置：https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
容量分析：https://jax-ml.github.io/scaling-book/transformers/
推理：https://jax-ml.github.io/scaling-book/inference/
-->


---
class: diagram-page
clicks: 1
---

# 把一个 MLP 分给两张 GPU

::left::

<figure class="gemm-figure network-figure" :data-phase="Math.min($clicks, 1)" aria-label="两张GPU各处理中间维度6144的gate、up、SiLU和down分片。输入相同，中间激活本地计算，下投影产生部分和Y0、Y1。点击后通过AllReduce相加，两卡各得到完整输出Y。">
  <p class="gemm-context">同一个 MLP：4096 → 12288 → 4096</p>
  <svg class="execution-drawing gemm-drawing network-drawing" viewBox="0 0 1168 510" aria-hidden="true">
<defs>
    <marker id="mlp-shard-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="device" x="270" y="62" width="652" height="163" rx="3" />
    <rect class="device" x="270" y="250" width="652" height="163" rx="3" />
    <rect class="operation" x="10" y="193" width="180" height="84" rx="3" />
    <text x="100" y="226">同一份输入 X</text>
    <text class="annotation" x="100" y="260">[m, 4096]</text>
    <path d="M 198 235 H 230" />
    <path d="M 230 235 V 149 H 285" marker-end="url(#mlp-shard-arrow)" />
    <path d="M 230 235 V 337 H 285" marker-end="url(#mlp-shard-arrow)" />
    <text class="matrix-name" x="596" y="95">GPU 0 · 中间维度 6144</text>
    <rect class="output-tile" x="293" y="120" width="170" height="58" rx="3" />
    <text class="operation-label" x="378" y="156">gate / up</text>
    <path class="" d="M 464 149 H 498" marker-end="url(#mlp-shard-arrow)" />
    <rect class="output-tile" x="507" y="120" width="132" height="58" rx="3" />
    <text class="" x="573" y="156">SiLU ×</text>
    <path class="" d="M 640 149 H 674" marker-end="url(#mlp-shard-arrow)" />
    <rect class="output-tile" x="683" y="120" width="213" height="58" rx="3" />
    <text class="operation-label" x="789" y="156">down_proj</text>
    <text class="annotation" x="378" y="208">4096 → 6144</text>
    <text class="annotation" x="789" y="208">6144 → 4096</text>
    <path class="" d="M 922 149 H 960" marker-end="url(#mlp-shard-arrow)" />
    <rect :class="$clicks === 0 ? 'operation' : 'output-tile'" x="970" y="113" width="174" height="86" rx="3" />
    <text x="1057" y="145">{{ $clicks === 0 ? '部分结果 Y₀' : '完整输出 Y' }}</text>
    <text class="annotation" x="1057" y="180">[m, 4096]</text>
    <text class="matrix-name" x="596" y="283">GPU 1 · 中间维度 6144</text>
    <rect class="tile-input" x="293" y="308" width="170" height="58" rx="3" />
    <text class="operation-label" x="378" y="344">gate / up</text>
    <path class="" d="M 464 337 H 498" marker-end="url(#mlp-shard-arrow)" />
    <rect class="tile-input" x="507" y="308" width="132" height="58" rx="3" />
    <text class="" x="573" y="344">SiLU ×</text>
    <path class="" d="M 640 337 H 674" marker-end="url(#mlp-shard-arrow)" />
    <rect class="tile-input" x="683" y="308" width="213" height="58" rx="3" />
    <text class="operation-label" x="789" y="344">down_proj</text>
    <text class="annotation" x="378" y="396">4096 → 6144</text>
    <text class="annotation" x="789" y="396">6144 → 4096</text>
    <path class="" d="M 922 337 H 960" marker-end="url(#mlp-shard-arrow)" />
    <rect :class="$clicks === 0 ? 'operation' : 'output-tile'" x="970" y="301" width="174" height="86" rx="3" />
    <text x="1057" y="333">{{ $clicks === 0 ? '部分结果 Y₁' : '完整输出 Y' }}</text>
    <text class="annotation" x="1057" y="368">[m, 4096]</text>
    <g v-if="$clicks >= 1" class="step-arrival">
      <path class="trace-line" d="M 1057 225 V 207" marker-end="url(#mlp-shard-arrow)" />
      <path class="trace-line" d="M 1057 271 V 293" marker-end="url(#mlp-shard-arrow)" />
      <text class="trace-text" x="1057" y="255">AllReduce</text>
      <text class="trace-text" x="596" y="442">Y = Y₀ + Y₁</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">
    <span v-if="$clicks === 0">每张卡计算一半，中间激活留在本地</span>
    <span v-else>down_proj 产生部分和，跨卡相加才得到完整输出</span>
    </figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span>
    <span>步骤 {{ Math.min($clicks, 1) + 1 }} / 2</span>
    <span>{{ $page }} / {{ $nav.total }}</span>

<!--
采用与前文一致的 Qwen3-8B 稠密 SwiGLU MLP。输入 X[m,4096] 在两卡各保留一份；gate、up 的输出维度12288按相同方式分为6144+6144，各卡本地执行SiLU与逐元素乘法。down的输入维度按相同分区切开，因此局部下投影产生两个形状相同的部分和Y0、Y1，完整Y=Y0+Y1。这是代数分解，不是近似模型。
图中“gate / up”合并表示两个各为4096×6144的权重分片；SiLU只作用于gate分支，再与up分支相乘。“SiLU ×”是简写，详细计算图在第6页。三个投影每卡权重合计144MiB，原MLP合计288MiB；这不包含attention、其他层、KV等。
[click] 若两卡都需要完整输出，用AllReduce求和并让两卡得到同样的Y。竖向双箭头只表达集合通信关系，不指定底层算法或真实链路。中间激活可保持分片，不必先AllGather。若后续只需要输出分片，可以采用ReduceScatter等不同布局，这页不展开。
每卡数学工作量减半，不代表实际加速两倍：有通信、同步以及较小GEMM的效率问题。继续用下一页解释多卡中的等待。
矩阵分片：https://jax-ml.github.io/scaling-book/sharding/
模型配置：https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
-->


---
class: diagram-page
clicks: 4
---

# 多张卡，可以怎样分工？

::left::

<figure class="gemm-figure network-figure" :data-phase="Math.min($clicks, 4)" aria-label="依次介绍DP分请求、TP分矩阵、PP分层、CP分上下文、EP分专家。每次只出现一种图，并配一个主要问题。EP明确采用MoE模型，其他示意沿用稠密模型。">
  <p class="gemm-context">{{ ['DP 数据并行：不同副本处理不同请求', 'TP 张量并行：多张卡共同计算同一层', 'PP 流水线并行：不同卡负责不同层段', 'CP 上下文并行：分担同一条长序列', 'EP 专家并行：换成 MoE 模型，按专家分工'][Math.min($clicks, 4)] }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing" viewBox="0 0 1168 510" aria-hidden="true">
<defs>
    <marker id="parallel-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <g transform="translate(-90 0)">
    <rect class="device" x="270" y="126" width="310" height="232" rx="3" />
    <text class="matrix-name" x="425" y="160">GPU 0</text>
    <rect class="device" x="770" y="126" width="310" height="232" rx="3" />
    <text class="matrix-name" x="925" y="160">GPU 1</text>
    <g v-if="$clicks === 0" class="step-arrival">
    <text class="trace-text" x="425" y="79">请求 A</text>
    <path class="" d="M 425 89 V 119" marker-end="url(#parallel-arrow)" />
    <text class="annotation" x="425" y="202">完整模型</text>
    <rect class="output-tile" x="323" y="219" width="204" height="26" rx="3" />
    <rect class="output-tile" x="323" y="259" width="204" height="26" rx="3" />
    <rect class="output-tile" x="323" y="299" width="204" height="26" rx="3" />
    <text class="trace-text" x="925" y="79">请求 B</text>
    <path class="" d="M 925 89 V 119" marker-end="url(#parallel-arrow)" />
    <text class="annotation" x="925" y="202">完整模型</text>
    <rect class="output-tile" x="823" y="219" width="204" height="26" rx="3" />
    <rect class="output-tile" x="823" y="259" width="204" height="26" rx="3" />
    <rect class="output-tile" x="823" y="299" width="204" height="26" rx="3" />
    <text class="annotation" x="675" y="412">各自完成推理，分别维护 KV Cache</text>
    </g>
    <g v-else-if="$clicks === 1" class="step-arrival">
    <text class="annotation" x="425" y="203">同一层的权重分片</text>
    <rect class="output-tile" x="335" y="224" width="180" height="88" rx="3" />
    <path class="grid-line" d="M 380 224 V 312" />
    <path class="grid-line" d="M 425 224 V 312" />
    <path class="grid-line" d="M 470 224 V 312" />
    <text class="annotation" x="425" y="341">部分结果 Y₀</text>
    <text class="annotation" x="925" y="203">同一层的权重分片</text>
    <rect class="tile-input" x="835" y="224" width="180" height="88" rx="3" />
    <path class="grid-line" d="M 880 224 V 312" />
    <path class="grid-line" d="M 925 224 V 312" />
    <path class="grid-line" d="M 970 224 V 312" />
    <text class="annotation" x="925" y="341">部分结果 Y₁</text>
    <path class="" d="M 580 269 H 643" marker-end="url(#parallel-arrow)" />
    <path class="" d="M 770 269 H 707" marker-end="url(#parallel-arrow)" />
    <circle class="operation" cx="675" cy="269" r="25" />
    <text class="" x="675" y="279">＋</text>
    <path class="" d="M 675 295 V 371" marker-end="url(#parallel-arrow)" />
    <text class="trace-text" x="675" y="410">相加得到完整输出</text>
    </g>
    <g v-else-if="$clicks === 2" class="step-arrival">
    <text class="annotation" x="425" y="203">第 1–18 层</text>
    <rect class="output-tile" x="335" y="224" width="180" height="25" rx="3" />
    <rect class="output-tile" x="335" y="265" width="180" height="25" rx="3" />
    <rect class="output-tile" x="335" y="306" width="180" height="25" rx="3" />
    <text class="annotation" x="925" y="203">第 19–36 层</text>
    <rect class="output-tile" x="835" y="224" width="180" height="25" rx="3" />
    <rect class="output-tile" x="835" y="265" width="180" height="25" rx="3" />
    <rect class="output-tile" x="835" y="306" width="180" height="25" rx="3" />
    <path class="" d="M 580 269 H 762" marker-end="url(#parallel-arrow)" />
    <text class="trace-text" x="675" y="240">激活</text>
    <text class="annotation" x="345" y="395">GPU 0</text>
<text class="annotation" x="345" y="437">GPU 1</text>
<rect class="output-tile" x="430" y="372" width="160" height="31" />
<text class="compact-label trace-text" x="510" y="395">请求 A</text>
<rect class="tile-input" x="600" y="372" width="160" height="31" />
<text class="compact-label memory-text" x="680" y="395">请求 B</text>
<rect class="wait-region" x="430" y="414" width="160" height="31" />
<text class="compact-label annotation" x="510" y="437">等待</text>
<rect class="output-tile" x="600" y="414" width="160" height="31" />
<text class="compact-label trace-text" x="680" y="437">请求 A</text>
<rect class="tile-input" x="770" y="414" width="160" height="31" />
<text class="compact-label memory-text" x="850" y="437">请求 B</text>
    </g>
    <g v-else-if="$clicks === 3" class="step-arrival">
    <text class="annotation" x="425" y="203">同一条序列的一部分</text>
    <rect class="output-tile" x="308" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="332" y="253">1</text>
    <rect class="output-tile" x="368" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="392" y="253">2</text>
    <rect class="output-tile" x="428" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="452" y="253">3</text>
    <rect class="output-tile" x="488" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="512" y="253">4</text>
    <rect class="tile-input" x="308" y="286" width="229" height="44" rx="3" />
    <text class="memory-text" x="422" y="316">本地 KV</text>
    <text class="annotation" x="925" y="203">同一条序列的一部分</text>
    <rect class="output-tile" x="808" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="832" y="253">5</text>
    <rect class="output-tile" x="868" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="892" y="253">6</text>
    <rect class="output-tile" x="928" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="952" y="253">7</text>
    <rect class="output-tile" x="988" y="225" width="49" height="40" rx="3" />
    <text class="annotation" x="1012" y="253">8</text>
    <rect class="tile-input" x="808" y="286" width="229" height="44" rx="3" />
    <text class="memory-text" x="922" y="316">本地 KV</text>
    <path class="" d="M 590 268 H 760" marker-end="url(#parallel-arrow)" marker-start="url(#parallel-arrow)" />
    <text class="annotation" x="675" y="214">Attention</text>
    <text class="annotation" x="675" y="250">通信</text>
    <text class="annotation" x="675" y="411">Attention 仍需要其他分片的信息</text>
    </g>
    <g v-else class="step-arrival">
    <text class="trace-text" x="675" y="76">token 路由</text>
    <path class="hot-line" d="M 675 86 V 95 H 425 V 119" marker-end="url(#parallel-arrow)" />
    <path class="" d="M 675 95 H 925 V 119" marker-end="url(#parallel-arrow)" />
    <rect class="tile-input" x="302" y="218" width="116" height="69" rx="3" />
    <text class="" x="360" y="260">专家 0</text>
    <rect class="output-tile" x="432" y="218" width="116" height="69" rx="3" />
    <text class="" x="490" y="260">专家 1</text>
    <rect class="output-tile" x="802" y="218" width="116" height="69" rx="3" />
    <text class="" x="860" y="260">专家 2</text>
    <rect class="output-tile" x="932" y="218" width="116" height="69" rx="3" />
    <text class="" x="990" y="260">专家 3</text>
    <text class="hot-text" x="360" y="317">热门</text>
    <rect class="tile-input" x="304" y="182" width="28" height="21" rx="3" />
    <rect class="tile-input" x="341" y="182" width="28" height="21" rx="3" />
    <rect class="tile-input" x="378" y="182" width="28" height="21" rx="3" />
    <rect class="output-tile" x="807" y="182" width="28" height="21" rx="3" />
    <text class="annotation" x="675" y="411">token 派发给专家，计算后返回结果</text>
    </g>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ ['主要问题：请求负载不均，权重也要重复存储', '主要问题：层内通信频繁，过细分片还会降低 GEMM 效率', '主要问题：阶段不均或任务不足，会留下流水线空闲', '主要问题：Attention 通信，以及分片后的负载均衡', '主要问题：热门专家造成负载与网络流量集中'][Math.min($clicks, 4)] }}</figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span>
    <span>步骤 {{ Math.min($clicks, 4) + 1 }} / 5</span>
    <span>{{ $page }} / {{ $nav.total }}</span>

<!--
本页只做五种分工的直观介绍，不推导最优并行度或混合并行配置。两个GPU框保持位置相同，每次只显示一种方式。图中的请求数、层条数、token数量与专家数仅为示意。
DP：这里指稠密模型推理副本，每份副本处理不同请求、维护独立KV，副本之间没有训练的梯度同步。模型权重重复占用容量；请求长度、缓存亲和性会导致负载不均；增加副本主要扩展并发，不能直接缩短同一请求的计算路径。单个副本也可以由多GPU组成，但本页不展开。
[click] TP：回指上一页Qwen MLP。图中为down投影的部分结果求和，某些其他分片布局需要AllGather或ReduceScatter，不能说所有TP算子都必须AllReduce。小消息启动成本、同步等待和较小GEMM的效率都会限制收益。
[click] PP：用Qwen的36层举例分为1–18与19–36层。实际每段耗时不一定与层数成比例，还要安排embedding/head等。底部时序中，请求A进入GPU1时，GPU0可以同时处理请求B；初始等待块表达流水线空闲，不是实测时长。不同请求或微批可以在不同阶段交错执行，但单条请求的同一次前向仍需依次经过各段；自回归依赖和并发不足会带来空闲，不能借用训练中的“零气泡”术语断言推理没有空闲。
[click] CP：示意长序列按token分段，KV及相关工作分到各卡，Attention仍存在跨分片依赖。双箭头泛指通信，不指定环式Attention、KV收集或局部输出归约算法。因果Attention若简单按连续区间均分，工作量也可能不均。Prefill与Decode的CP执行不同，本页只做概念介绍。Megatron语境的SP只分部分逐token算子的激活，通常与TP结合，与CP不同。
[click] EP：明确切换为MoE模型，当前Qwen3-8B是稠密模型，本身不包含这些专家。token按路由派发到专家，计算后返回，常涉及AllToAll；路由偏斜使热门专家及相应链路成为瓶颈。示意只突出派发关系，返回动作由文字说明。
推理DP：https://docs.vllm.ai/en/latest/serving/data_parallel_deployment/
TP、PP、EP：https://jax-ml.github.io/scaling-book/gpus/
CP与SP：https://docs.nvidia.com/megatron-core/developer-guide/latest/user-guide/features/context_parallel.html
这些来源部分讨论训练，页上仅采用通用分工与通信机制，不移用训练阈值或训练同步行为。
-->


---
class: diagram-page
clicks: 2
---

# 多卡协作，为什么会等待？

::left::

<figure class="gemm-figure network-figure" :data-phase="Math.min($clicks, 2)" aria-label="三个独立场景依次展示独立请求负载不均、共享链路争用，以及同一次AllReduce中的慢流导致相关计算等待。这些问题不限定于Scale-up或Scale-out。">
  <p class="gemm-context">{{ $clicks < 2 ? 'GPU 的工作分配和通信依赖，都会影响等待' : '同一次 AllReduce，还差一条必要的数据流没有完成' }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing " viewBox="0 0 1168 510" aria-hidden="true">
<defs>
      <marker id="cluster-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <g v-if="$clicks < 2">    <text class="matrix-name trace-text" x="584" y="79">{{ $clicks === 0 ? '负载不均' : '链路争用' }}</text>
    <rect class="device" x="40" y="106" width="370" height="303" rx="4" />
    <rect class="device" x="758" y="106" width="370" height="303" rx="4" />
    <text class="annotation" x="225" y="137">GPU 组 A</text>
    <text class="annotation" x="943" y="137">GPU 组 B</text>
    <path :class="$clicks === 1 ? 'hot-line' : 'quiet-line'" d="M 318 196 H 370 V 258 H 798 V 196 H 850 M 318 340 H 370 V 258 M 798 258 V 340 H 850" />
    <text class="annotation" x="584" y="218">共享链路</text>
<rect :class="$clicks === 0 ? 'tile-input' : 'output-tile'" x="88" y="158" width="230" height="76" rx="3" />
    <text class="" x="203" y="188">GPU 0</text>
    <text class="annotation" x="203" y="219">{{ $clicks === 0 ? '长请求排队' : '发送数据' }}</text>
    <rect :class="$clicks === 1 ? 'output-tile' : 'operation'" x="88" y="302" width="230" height="76" rx="3" />
    <text class="" x="203" y="332">GPU 1</text>
    <text class="annotation" x="203" y="363">{{ $clicks === 0 ? '空闲' : '发送数据' }}</text>
    <rect :class="$clicks === 1 ? 'output-tile' : 'operation'" x="850" y="158" width="230" height="76" rx="3" />
    <text class="" x="965" y="188">GPU 2</text>
    <text class="annotation" x="965" y="219">{{ $clicks === 0 ? '少量请求' : '等待数据' }}</text>
    <rect :class="$clicks === 1 ? 'output-tile' : 'operation'" x="850" y="302" width="230" height="76" rx="3" />
    <text class="" x="965" y="332">GPU 3</text>
    <text class="annotation" x="965" y="363">{{ $clicks === 0 ? '空闲' : '等待数据' }}</text>
    <g v-if="$clicks === 0" class="step-arrival">
      <rect class="tile-input" x="88" y="246" width="42" height="24" />
    <rect class="tile-input" x="139" y="246" width="42" height="24" />
    <rect class="tile-input" x="190" y="246" width="42" height="24" />
    <rect class="tile-input" x="241" y="246" width="42" height="24" />
      <text class="annotation" x="584" y="311">请求分配不均</text>
    </g>
    <g v-else-if="$clicks === 1" class="step-arrival">
      <rect class="packet" x="445" y="245" width="32" height="26" />
    <rect class="packet" x="487" y="245" width="32" height="26" />
    <rect class="packet" x="529" y="245" width="32" height="26" />
    <rect class="packet" x="571" y="245" width="32" height="26" />
      <path class="hot-line" d="M 629 239 V 277 M 642 239 V 277" />
      <path class="hot-line" d="M 659 258 H 731" marker-end="url(#cluster-arrow)" />
      <text class="hot-text" x="584" y="311">多路传输在此排队</text>
    </g>
    </g>
    <g v-else class="step-arrival">
      <text class="annotation" x="125" y="150">GPU 0</text>
      <text class="annotation" x="125" y="222">GPU 1</text>
      <text class="annotation" x="125" y="294">GPU 2</text>
      <text class="annotation" x="125" y="366">GPU 3</text>
      <rect class="output-tile" x="250" y="121" width="280" height="42" />
      <rect class="wait-region" x="530" y="121" width="370" height="42" />
      <text class="trace-text" x="390" y="150">传输</text>
      <text class="annotation" x="715" y="150">等待</text>
      <rect class="output-tile" x="250" y="193" width="320" height="42" />
      <rect class="wait-region" x="570" y="193" width="330" height="42" />
      <rect class="output-tile" x="250" y="265" width="260" height="42" />
      <rect class="wait-region" x="510" y="265" width="390" height="42" />
      <rect class="tile-input" x="250" y="337" width="650" height="42" />
      <text class="hot-text" x="575" y="366">慢流：排队或重传</text>
      <path class="budget-limit" d="M 900 104 V 393" />
      <text class="hot-text" x="900" y="83">数据到齐</text>
      <path class="quiet-line" d="M 900 142 H 925 M 900 214 H 925 M 900 286 H 925 M 900 358 H 925" />
      <rect class="output-tile" x="925" y="121" width="180" height="42" />
      <rect class="output-tile" x="925" y="193" width="180" height="42" />
      <rect class="output-tile" x="925" y="265" width="180" height="42" />
      <rect class="output-tile" x="925" y="337" width="180" height="42" />
      <text class="trace-text" x="1015" y="150">下一步计算</text>
      <path d="M 250 415 H 1110" marker-end="url(#cluster-arrow)" />
      <text class="annotation" x="1080" y="445">时间</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ $clicks === 0 ? '请求数相同，也不一定有相同的工作量' : $clicks === 1 ? '多路数据共用链路，传输会相互争抢带宽' : '慢流尚未完成，依赖完整结果的计算就要等待' }}</figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
上一页讲分工，本页讲多卡协作的通用代价，再由下一页介绍互连范围。这三个场景独立，不表示一次执行连续发生的三个阶段，也不将它们限定为Scale-out网络才有的问题。
初始：独立请求分配给不同推理副本，长短输入、输出长度和缓存亲和性都可能造成工作量不均。这是请求调度或计算负载问题，独立副本不需要共同完成一次AllReduce。两组GPU框只用于安排图面，不定义物理服务器或互连域。
[click] 多条数据流竞争共享链路，总需求超出可用带宽时产生排队。连线不指定PCIe、NVLink、网卡或实际拓扑；此类争用可能出现在不同互连范围中。
[click] 换为同一次AllReduce。各行抽象参与GPU的通信与依赖等待，一条必要的数据流因排队、链路异常或重传延后，使相关归约结果延后。实际AllReduce包含多个阶段，流与GPU不严格一一对应，也不要求所有rank同一时刻返回。共同完成线只突出依赖关系，不表示额外的全局barrier；无关计算仍可能与通信重叠。重传适用于存在该恢复机制的传输路径，并非所有互连行为都相同。
GPU框、队列数量与时间条长度均为定性示意，不编码实测吞吐、时延或性能比例。
负载分配：https://docs.vllm.ai/en/latest/serving/data_parallel_deployment/
节点内与跨节点集合通信：https://jax-ml.github.io/scaling-book/gpus/
网络排队、重传与尾延迟：https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/troubleshooting/networking_troubleshooting.html
-->


---
class: diagram-page
clicks: 0
---

# 这些 GPU 怎样连接？

::left::

<figure class="gemm-figure network-figure" data-phase="0" aria-label="两组GPU分别位于两个高速互连域。超节点内部通过Scale-up互连，两个超节点的网卡经交换网络形成Scale-out连接。并行方式与互连范围是两个不同维度。">
  <p class="gemm-context">超节点内部是 Scale-up，超节点之间通过 Scale-out 互连</p>
  <svg class="execution-drawing gemm-drawing network-drawing scaleout-drawing" viewBox="0 0 1168 510" aria-hidden="true">
<defs>
      <marker id="topology-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="device" x="20" y="92" width="290" height="320" rx="4" />
    <rect class="device" x="858" y="92" width="290" height="320" rx="4" />
    <text class="matrix-name" x="165" y="132">超节点 A</text>
    <text class="matrix-name" x="1003" y="132">超节点 B</text>
    <text class="annotation" x="165" y="385">Scale-up</text>
    <text class="annotation" x="1003" y="385">Scale-up</text>
    <path class="fabric-line" d="M 90 220 V 292 M 230 220 V 292 M 90 254 H 230 M 938 220 V 292 M 1078 220 V 292 M 938 254 H 1078" />
    <rect class="output-tile" x="40" y="168" width="100" height="52" rx="3" />
    <text x="90" y="202">GPU 0</text>
    <rect class="output-tile" x="180" y="168" width="100" height="52" rx="3" />
    <text x="230" y="202">GPU 1</text>
    <rect class="output-tile" x="40" y="292" width="100" height="52" rx="3" />
    <text x="90" y="326">GPU 2</text>
    <rect class="output-tile" x="180" y="292" width="100" height="52" rx="3" />
    <text x="230" y="326">GPU 3</text>
    <rect class="output-tile" x="888" y="168" width="100" height="52" rx="3" />
    <text x="938" y="202">GPU 4</text>
    <rect class="output-tile" x="1028" y="168" width="100" height="52" rx="3" />
    <text x="1078" y="202">GPU 5</text>
    <rect class="output-tile" x="888" y="292" width="100" height="52" rx="3" />
    <text x="938" y="326">GPU 6</text>
    <rect class="output-tile" x="1028" y="292" width="100" height="52" rx="3" />
    <text x="1078" y="326">GPU 7</text>
    <path class="trace-line" d="M 238 254 H 342" marker-end="url(#topology-arrow)" />
    <path class="trace-line" d="M 440 254 H 469" marker-end="url(#topology-arrow)" />
    <path class="trace-line" d="M 699 254 H 728" marker-end="url(#topology-arrow)" />
    <path class="trace-line" d="M 826 254 H 930" marker-end="url(#topology-arrow)" />
    <rect class="operation" x="350" y="225" width="82" height="58" rx="3" />
    <rect class="operation" x="736" y="225" width="82" height="58" rx="3" />
    <text x="391" y="263">网卡</text>
    <text x="777" y="263">网卡</text>
    <text class="trace-text" x="584" y="184">Scale-out</text>
    <rect class="operation" x="477" y="211" width="214" height="86" rx="3" />
    <text x="584" y="263">交换网络</text>
  </svg>
  <figcaption class="gemm-takeaway">同一种并行方式，可以跨越不同的互连范围</figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
前两页回答怎样分工、为什么等待，本页回答GPU在物理上怎样连接。这里按高速Scale-up互连域划分超节点，内部可以包含多台服务器；跨一台服务器的边界不自动等于跨出Scale-up域。GPU数量和网卡符号仅为示意，不对应固定产品规格。网卡代表一个超节点的对外连接能力，可能实际包含多张NIC或多条rail。
以常见NVIDIA系统为背景，Scale-up可由NVLink/NVSwitch承担，Scale-out可通过网卡和InfiniBand或以太网交换网络连接不同高速域。图中省略PCIe与交换机层级，不给定带宽，也不将某一种协议作为所有系统的必要条件。
DP、TP、PP、CP、EP描述计算分工，Scale-up/Scale-out描述本页采用的互连范围；实际放置可以使同一种并行方式留在域内，也可以跨域。不能将TP严格等同于Scale-up、DP或P/D严格等同于Scale-out。下一页选用跨超节点的P/D部署作为具体案例。
GPU网络层级与NVL72互连域：https://jax-ml.github.io/scaling-book/gpus/
-->


---
class: diagram-page
clicks: 1
---

# P/D 分离：把输入处理与持续生成分开

::left::

<figure class="gemm-figure network-figure" :data-phase="Math.min($clicks, 1)" aria-label="先展示共享GPU时Prefill对持续生成的干扰，再选择跨超节点部署：超节点A的P池产生KV，经Scale-out网络交接给超节点B的D池。P/D分离不必然跨超节点，这里只展示一种明确的部署选择。">
  <p class="gemm-context">{{ $clicks === 0 ? '请求 A 正在输出，此时又来了一个长请求 B' : '部署示例：P 池与 D 池分别位于两个超节点' }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing " viewBox="0 0 1168 510" aria-hidden="true">
<defs>
      <marker id="pd-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <g v-if="$clicks === 0" class="step-arrival">
      <rect class="device" x="83" y="87" width="1002" height="314" rx="4" />
      <text class="matrix-name" x="584" y="127">共用一组 GPU</text>
      <text class="annotation" x="165" y="212">请求 A</text>
    <text class="annotation" x="165" y="304">请求 B</text>
      <rect class="output-tile" x="247" y="180" width="94" height="47" />
    <text class="trace-text" x="294" y="212">生成</text>
      <rect class="output-tile" x="353" y="180" width="94" height="47" />
    <text class="trace-text" x="400" y="212">生成</text>
      <rect class="wait-region" x="460" y="180" width="310" height="47" />
    <text class="annotation" x="615" y="212">输出间隔变长</text>
      <rect class="output-tile" x="783" y="180" width="94" height="47" />
    <text class="trace-text" x="830" y="212">生成</text>
      <rect class="output-tile" x="889" y="180" width="94" height="47" />
    <text class="trace-text" x="936" y="212">生成</text>
      <rect class="tile-input" x="460" y="272" width="310" height="47" />
    <text class="memory-text" x="615" y="304">长请求的 Prefill</text>
      <path class="memory-line" d="M 460 237 V 263 M 770 237 V 263" />
      <path d="M 247 366 H 987" marker-end="url(#pd-arrow)" />
    <text class="annotation" x="617" y="394">执行顺序示意</text>
    </g>
    <g v-else class="step-arrival">
      <rect class="device" x="90" y="89" width="355" height="277" rx="4" />
      <rect class="device" x="723" y="89" width="355" height="277" rx="4" />
      <text class="matrix-name" x="267" y="131">超节点 A（Prefill）</text>
    <text class="matrix-name" x="900" y="131">超节点 B（Decode）</text>
      <rect class="tile-input" x="130" y="158" width="275" height="53" />
    <text class="memory-text" x="267" y="193">处理输入</text>
      <rect class="output-tile" x="763" y="158" width="275" height="53" />
    <text class="trace-text" x="900" y="193">逐 token 生成</text>
      <rect class="tile-input" x="130" y="270" width="275" height="53" />
    <text class="memory-text" x="267" y="305">产生 KV Cache</text>
      <rect class="tile-input" x="763" y="270" width="275" height="53" />
    <text class="memory-text" x="900" y="305">继续使用 KV Cache</text>
      <path d="M 267 215 V 260" marker-end="url(#pd-arrow)" />
    <path d="M 900 262 V 219" marker-end="url(#pd-arrow)" />
      <path class="trace-line" d="M 408 296 H 753" marker-end="url(#pd-arrow)" />
      <text class="trace-text" x="584" y="266">Scale-out</text>
      <text class="annotation" x="584" y="339">KV 交接</text>
      <text class="annotation" x="267" y="410">单独安排输入处理</text>
      <text class="annotation" x="900" y="410">持续服务生成请求</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ $clicks === 0 ? '长请求的 Prefill，可能影响其他请求持续输出' : '减少阶段干扰，也增加跨超节点的 KV 交接' }}</figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span><span>步骤 {{ Math.min($clicks, 1) + 1 }} / 2</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
上一页建立互连范围，本页把P/D分离放到一个明确的物理部署中。P/D分离是按推理阶段安排不同服务资源，本身并不要求跨超节点，也不等同于一种网络。
初始：示意某种混合调度中，新来的长请求B执行Prefill，使A的下一次生成延后。这是可能的资源竞争或调度现象，chunked prefill等方法也可缓解干扰。时间块仅表达执行顺序，不表示实测时长或加速比。
[click] 本例特意选择两个超节点：P池部署在A，D池部署在B，KV交接经过二者之间的Scale-out网络。各池可以在内部采用上一节介绍的并行分工；两侧都需要能运行完整模型的权重，可各自分片，不是P负责模型前半层、D负责后半层。单次请求的P产生各层KV，D接收后持续生成，新增KV通常在D侧维护，不会在每个token时往返传全量缓存。图中省略请求元数据、采样状态及传输实现。
P/D也可以放在同一高速互连域内的不同GPU。DistServe在跨机带宽受限时，将对应层段的P/D实例放在同一节点，通过NVLink交接KV。因此是否经过Scale-out由物理放置决定。
P/D可分别安排批大小和资源，但两池处理能力仍需匹配，并会新增KV传输和排队代价；不能据此保证所有工作负载吞吐提升。下一页扩展P池节点数量，始终追踪KV交接中的网络瓶颈，不跳回AllReduce。
P/D原理：https://jax-ml.github.io/scaling-book/inference/
DistServe及节点内放置（§4.2）：https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf
实现说明：https://docs.vllm.ai/en/latest/features/disagg_prefill/
-->


---
class: diagram-page
clicks: 2
---

# KV 交接，可能堵在哪里？

::left::

<figure class="gemm-figure network-figure" :data-phase="Math.min($clicks, 2)" aria-label="同一张跨超节点P/D传输图：三个P超节点经网卡及两条网络路径向一个D超节点交接不同请求的KV。每次只突出一个独立的瓶颈假设：发送端出口、路径负载不均、接收端汇聚。没有AllReduce或独立请求之间的同步屏障。">
  <p class="gemm-context">{{ ['多个 P 超节点向 D 池交接 KV：先看发送端出口', '另一种情况：总带宽有余量，流量却集中到路径 A', '另一种情况：多个 P 超节点同时汇入一个 D 超节点'][Math.min($clicks, 2)] }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing scaleout-drawing" viewBox="0 0 1168 510" aria-hidden="true">
<defs>
      <marker id="kv-fabric-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="output-tile" x="40" y="90" width="180" height="60" rx="3" />
    <rect class="output-tile" x="40" y="220" width="180" height="60" rx="3" />
    <rect class="output-tile" x="40" y="350" width="180" height="60" rx="3" />
    <text class="trace-text" x="130" y="129">P 超节点 0</text>
    <text class="trace-text" x="130" y="259">P 超节点 1</text>
    <text class="trace-text" x="130" y="389">P 超节点 2</text>
    <path :class="$clicks === 0 ? 'hot-line' : 'trace-line'" d="M 228 120 H 292" marker-end="url(#kv-fabric-arrow)" />
    <path class="trace-line" d="M 228 250 H 292" marker-end="url(#kv-fabric-arrow)" />
    <path class="trace-line" d="M 228 380 H 292" marker-end="url(#kv-fabric-arrow)" />
    <rect :class="$clicks === 0 ? 'tile-input' : 'operation'" x="300" y="97" width="74" height="46" rx="3" />
    <rect class="operation" x="300" y="227" width="74" height="46" rx="3" />
    <rect class="operation" x="300" y="357" width="74" height="46" rx="3" />
    <text x="337" y="129">网卡</text>
    <text x="337" y="259">网卡</text>
    <text x="337" y="389">网卡</text>
    <path class="trace-line" d="M 374 120 H 440 V 250 M 374 250 H 480 M 374 380 H 440 V 250" />
    <path :class="$clicks === 1 ? 'hot-line' : 'trace-line'" d="M 480 250 V 130 H 720 V 250" />
    <path :class="$clicks === 1 ? 'quiet-line' : 'trace-line'" d="M 480 250 V 370 H 720 V 250" />
    <text class="annotation" x="600" y="69">Scale-out 网络</text>
    <text class="annotation" x="600" y="105">路径 A</text>
    <text class="annotation" x="600" y="412">路径 B</text>
    <path :class="$clicks === 2 ? 'hot-line' : 'trace-line'" d="M 720 250 H 857" marker-end="url(#kv-fabric-arrow)" />
    <rect :class="$clicks === 2 ? 'tile-input' : 'operation'" x="865" y="225" width="85" height="50" rx="3" />
    <text x="907" y="259">网卡</text>
    <path class="trace-line" d="M 958 250 H 992" marker-end="url(#kv-fabric-arrow)" />
    <rect class="output-tile" x="1000" y="220" width="148" height="60" rx="3" />
    <text class="trace-text" x="1074" y="259">D 超节点</text>
    <g v-if="$clicks === 0" class="step-arrival">
      <rect class="packet" x="228" y="110" width="12" height="20" />
      <rect class="packet" x="246" y="110" width="12" height="20" />
      <rect class="packet" x="264" y="110" width="12" height="20" />
      <text class="hot-text" x="337" y="78">出口受限</text>
    </g>
    <g v-else-if="$clicks === 1" class="step-arrival">
      <rect class="packet" x="510" y="119" width="30" height="22" />
      <rect class="packet" x="552" y="119" width="30" height="22" />
      <rect class="packet" x="594" y="119" width="30" height="22" />
      <rect class="packet" x="636" y="119" width="30" height="22" />
      <text class="hot-text" x="600" y="181">拥堵</text>
      <text class="annotation" x="600" y="344">空闲</text>
    </g>
    <g v-else class="step-arrival">
      <rect class="output-tile" x="395" y="109" width="28" height="22" />
      <rect class="output-tile" x="395" y="239" width="28" height="22" />
      <rect class="output-tile" x="395" y="369" width="28" height="22" />
      <rect class="packet" x="744" y="239" width="26" height="22" />
      <rect class="packet" x="782" y="239" width="26" height="22" />
      <rect class="packet" x="820" y="239" width="26" height="22" />
      <text class="hot-text" x="907" y="202">接收受限</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ ['P 侧出口不足，KV 在发送前排队', '有些路径拥堵，有些路径却没有充分利用', '多路 KV 汇入同一接收端，D 侧入口成为瓶颈'][Math.min($clicks, 2)] }}</figcaption>
</figure>

::footer::

<span>网络 · 多卡分工与通信</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
沿用上一页跨超节点的P/D分池部署，将P池扩展到多个超节点，追踪不同请求的KV交接。三个状态共用拓扑，但分别假设不同位置是瓶颈，不能理解为每个部署依次必然出现三种问题。这些机制也可能存在于其他互连中，本页不宣称它们是Scale-out独有或首次出现的问题。
P超节点0、1、2代表三个发送域；D超节点是本例选中的接收域，不表示系统中只能有一个D实例。各域内部GPU与分片细节省略，网卡符号抽象可用对外带宽，可对应多个NIC。线条汇合只表示共享网络路径，不代表KV在网络中求和、合并或构成AllReduce。路径A/B为替代传输路径，中间交换机层级省略。
初始：假设P0发送需求超过它的可用出口带宽，中间网络和D接收有余量，待发送KV排队。内部计算快、内部互连快，也不能绕过这个出口约束。
[click] 出口与接收端有余量，但多条数据流集中到路径A，路径B空闲。静态ECMP映射冲突等机制可能形成热点，总带宽不能代表每条路径的可用带宽。实际故障位置需结合流量和路径观测判断；本页不推导具体路由算法。
[click] 发送端和路径有余量，多个P同时传送不同请求的KV，总到达速率超过D的接收能力，形成多对一汇聚（incast）。此时增加中间路径不能消除固定接收端的瓶颈；可错开发送、限速、分散接收目标或增加接收能力。队列可能位于发送端、最后一跳交换机等位置，图中方块不指定实际存放位置。每条请求独立完成交接，不要求全部请求的KV共同到齐。
所有队列块数量与线宽都是定性示意，不表示真实速率。KV如何存放、分页及PagedAttention留到存储部分。
GPU网络与对外带宽：https://jax-ml.github.io/scaling-book/gpus/
路径负载不均和incast：https://resources.nvidia.com/en-us-accelerated-networking-resource-library/nvidia-spectrum-x
P/D放置与交接：https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf
-->


---
class: chapter-page
clicks: 0
---

# 存储 · KV 管理与内存池

<!--
承接P/D的KV交接，先看KV在显存里的增长，再用PagedAttention解释分配，接着把可复用前缀放到外部池。最后比较RDMA的显式数据搬运与CXL.mem的主机地址访问。网络部分关心多卡协作和拥堵；这里关心缓存生命周期、外部容量和访问代价，不将RDMA或CXL划成只属于存储的技术。
-->


---
class: diagram-page
clicks: 2
---

# KV Cache 为什么越来越占显存？

::left::

<figure class="gemm-figure storage-figure" :data-phase="Math.min($clicks, 2)" aria-label="追踪Qwen3-8B同一条请求的KV：Prefill缓存8192个token，Decode读取历史并追加新KV，最后展示32条独立请求的容量。以BF16全层逻辑KV估算，144KiB每token，8192token为1.125GiB，32份为36GiB。">
  <p class="gemm-context">{{ ['沿用 Qwen3-8B：BF16 KV，先缓存 8192 个输入 token', '进入 Decode：读取已有 KV，并追加新 token 的 KV', '上下文不共享时，每条并发请求都要保存自己的 KV'][Math.min($clicks, 2)] }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing storage-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="kv-growth-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="device" x="35" y="76" width="690" height="350" rx="3" />
    <text class="matrix-name" x="380" y="115">{{ $clicks &lt; 2 ? 'GPU' : 'GPU 显存' }}</text>
    <g v-if="$clicks < 2" class="step-arrival">
    <rect class="operation" x="80" y="147" width="150" height="56" rx="3" />
    <text class="" x="155" y="184">{{ $clicks === 0 ? '8192 token' : '新 token' }}</text>
    <path class="trace-line" d="M 234 175 H 325" marker-end="url(#kv-growth-arrow)" />
    <rect class="output-tile" x="335" y="147" width="275" height="56" rx="3" />
    <text class="trace-text" x="472" y="184">{{ $clicks === 0 ? 'Prefill' : 'Decode' }}</text>
    <rect class="tile-input" x="80" y="280" width="76" height="58" rx="3" />
    <rect class="tile-input" x="164" y="280" width="76" height="58" rx="3" />
    <rect class="tile-input" x="248" y="280" width="76" height="58" rx="3" />
    <rect class="tile-input" x="332" y="280" width="76" height="58" rx="3" />
    <rect class="tile-input" x="416" y="280" width="76" height="58" rx="3" />
    <rect class="tile-input" x="500" y="280" width="76" height="58" rx="3" />
    <text class="annotation" x="324" y="372">显存中的历史 K / V</text>
    <g v-if="$clicks === 0" class="step-arrival">
    <path class="hot-line" d="M 472 207 V 270" marker-end="url(#kv-growth-arrow)" />
    <text class="annotation" x="955" y="167">每个 token · 全层合计</text>
    <text class="metric-value" x="955" y="217">144 KiB</text>
    <path class="rule-line" d="M 800 245 H 1120" />
    <text class="" x="955" y="296">8192 token × 144 KiB</text>
    <text class="trace-text" x="955" y="344">= 1.125 GiB</text>
    </g>
    <g v-else class="step-arrival">
    <path class="hot-line" d="M 325 272 V 235 H 405 V 211" marker-end="url(#kv-growth-arrow)" />
    <text class="hot-text" x="290" y="229">读取</text>
    <path class="trace-line" d="M 610 175 H 650 V 270" marker-end="url(#kv-growth-arrow)" />
    <rect class="output-tile" x="612" y="280" width="76" height="58" rx="3" />
    <text class="trace-text" x="650" y="318">新增</text>
    <text class="matrix-name" x="955" y="168">本步读历史 KV</text>
    <text class="" x="955" y="238">再追加一份新 K / V</text>
    <path class="rule-line" d="M 800 270 H 1120" />
    <text class="trace-text" x="955" y="326">+1 token → +144 KiB</text>
    <text class="annotation" x="955" y="388">旧 token 仍会被反复读取</text>
    </g>
    </g>
    <g v-else class="step-arrival">
    <text class="annotation" x="120" y="187">请求 1</text>
    <rect class="tile-input" x="220" y="150" width="440" height="46" rx="3" />
    <text class="" x="440" y="182">8192 token 的 KV</text>
    <text class="annotation" x="120" y="249">请求 2</text>
    <rect class="tile-input" x="220" y="212" width="440" height="46" rx="3" />
    <text class="" x="440" y="244">8192 token 的 KV</text>
    <text class="annotation" x="120" y="373">请求 32</text>
    <rect class="tile-input" x="220" y="336" width="440" height="46" rx="3" />
    <text class="" x="440" y="368">8192 token 的 KV</text>
    <text class="annotation" x="440" y="304">⋮</text>
    <text class="matrix-name" x="955" y="168">每条请求 1.125 GiB</text>
    <text class="" x="955" y="236">32 条独立请求</text>
    <path class="rule-line" d="M 800 265 H 1120" />
    <text class="trace-text" x="955" y="323">KV 合计 36 GiB</text>
    <text class="annotation" x="955" y="384">另需权重与运行空间</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ ['保存 K / V，后续生成时不用重新计算它们', '缓存会持续增长；历史 KV 仍在每步 Attention 中使用', '长上下文与更多并发，会一起推高 KV 容量'][Math.min($clicks, 2)] }}</figcaption>
</figure>

::footer::

<span>存储 · KV 管理与内存池</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
承接上一页的KV交接：网络传来的KV最终还要占用存储。继续使用Qwen3-8B作为教学部署实例，数值是根据模型配置计算的逻辑KV大小，不是实测显存，也不是固定的每卡占用。
初始：Prefill对输入计算各层的K和V并缓存。全层KV字节数/token = 2（K和V）× 36层 × 8个KV头 × 128维 × 2字节（BF16）= 147456 B = 144 KiB。8192个已缓存token合计1.125 GiB。这里使用GQA的8个KV头，不是32个Query头。没有KV量化、前缀共享或滑动窗口；不计块尾空闲、对齐、元数据和其他运行空间。图中六个方块是连续历史的示意，不表示PagedAttention块数。
[click] 一步Decode处理上一步采样出的新token，产生这一token的新Q/K/V。Attention使用历史和当前的K/V，新K/V加入缓存。图上将历史读取与新增写入分开画，未展开Attention内部的数据依赖。新增一个已处理token，全层KV增加144 KiB。保存KV省掉的是历史K/V的重复投影计算，不会消除当前Query与历史KV的Attention计算和内存读取。较早token的KV不因此自动变成冷数据。
[click] 若32条独立请求各有8192个已缓存token，且没有共享前缀，则逻辑KV合计32×1.125=36 GiB。生成继续进行时容量还会增加。图为一份完整模型实例的总需求；如果模型跨卡切分，各卡KV占用由头分片、复制及实现决定。这里不宣称单卡一定放得下权重与这些KV。
Qwen3-8B配置：https://huggingface.co/Qwen/Qwen3-8B/blob/main/config.json
KV与推理阶段：https://jax-ml.github.io/scaling-book/inference/

-->


---
class: diagram-page
clicks: 2
---

# PagedAttention：把 KV 分成小块

::left::

<figure class="gemm-figure storage-figure" :data-phase="Math.min($clicks, 2)" aria-label="先比较两个请求连续预留的浪费，再用块表把A的逻辑块映射到分散的显存块。最后A多一个token，领取新的物理块，块尾保留一个空位。示意块大小为2token。">
  <p class="gemm-context">{{ ['生成长度还不知道：如果先按最大长度预留显存呢？', '改为按需分块：逻辑顺序由块表记录', 'A 再生成一个 token：从空闲位置领取一个新块'][Math.min($clicks, 2)] }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing storage-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="paging-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <g v-if="$clicks === 0" class="step-arrival">
    <text class="matrix-name" x="635" y="94">连续预留：每条请求最多 8 token</text>
    <text class="compact-label" x="120" y="192">请求 A · 6 token</text>
    <rect class="output-tile" x="250" y="150" width="99" height="70" rx="3" />
    <text class="" x="299" y="194">KV</text>
    <rect class="output-tile" x="359" y="150" width="99" height="70" rx="3" />
    <text class="" x="408" y="194">KV</text>
    <rect class="output-tile" x="468" y="150" width="99" height="70" rx="3" />
    <text class="" x="517" y="194">KV</text>
    <rect class="output-tile" x="577" y="150" width="99" height="70" rx="3" />
    <text class="" x="626" y="194">KV</text>
    <rect class="output-tile" x="686" y="150" width="99" height="70" rx="3" />
    <text class="" x="735" y="194">KV</text>
    <rect class="output-tile" x="795" y="150" width="99" height="70" rx="3" />
    <text class="" x="844" y="194">KV</text>
    <rect class="wait-region" x="904" y="150" width="99" height="70" rx="3" />
    <text class="annotation" x="953" y="194">预留</text>
    <rect class="wait-region" x="1013" y="150" width="99" height="70" rx="3" />
    <text class="annotation" x="1062" y="194">预留</text>
    <text class="compact-label" x="120" y="326">请求 B · 4 token</text>
    <rect class="tile-input" x="250" y="284" width="99" height="70" rx="3" />
    <text class="" x="299" y="328">KV</text>
    <rect class="tile-input" x="359" y="284" width="99" height="70" rx="3" />
    <text class="" x="408" y="328">KV</text>
    <rect class="tile-input" x="468" y="284" width="99" height="70" rx="3" />
    <text class="" x="517" y="328">KV</text>
    <rect class="tile-input" x="577" y="284" width="99" height="70" rx="3" />
    <text class="" x="626" y="328">KV</text>
    <rect class="wait-region" x="686" y="284" width="99" height="70" rx="3" />
    <text class="annotation" x="735" y="328">预留</text>
    <rect class="wait-region" x="795" y="284" width="99" height="70" rx="3" />
    <text class="annotation" x="844" y="328">预留</text>
    <rect class="wait-region" x="904" y="284" width="99" height="70" rx="3" />
    <text class="annotation" x="953" y="328">预留</text>
    <rect class="wait-region" x="1013" y="284" width="99" height="70" rx="3" />
    <text class="annotation" x="1062" y="328">预留</text>
    <text class="annotation" x="686" y="406">已用 10 个位置，另有 6 个位置被预留</text>
    </g>
    <g v-else class="step-arrival">
    <text class="matrix-name" x="205" y="94">请求 A 的块表</text>
    <text class="annotation" x="205" y="132">逻辑块 → 显存块</text>
    <rect class="operation" x="65" y="150" width="280" height="226" rx="3" />
    <text class="trace-text" x="205" y="190">0 → 5</text>
    <text class="trace-text" x="205" y="238">1 → 1</text>
    <text class="trace-text" x="205" y="286">2 → 7</text>
    <g v-if="$clicks === 2" class="step-arrival">
    <text class="trace-text" x="205" y="334">3 → 3</text>
    </g>
    <path class="trace-line" d="M 358 255 H 500" marker-end="url(#paging-arrow)" />
    <text class="annotation" x="430" y="221">按表读取</text>
    <text class="matrix-name" x="830" y="94">显存：每块容纳 2 token</text>
    <text class="annotation" x="598" y="153">块 0</text>
    <rect class="tile-input" x="530" y="168" width="133" height="62" rx="3" />
    <text class="hot-text" x="596" y="207">B0</text>
    <text class="annotation" x="753" y="153">块 1</text>
    <rect class="output-tile" x="685" y="168" width="133" height="62" rx="3" />
    <text class="trace-text" x="751" y="207">A1</text>
    <text class="annotation" x="908" y="153">块 2</text>
    <rect class="wait-region" x="840" y="168" width="133" height="62" rx="3" />
    <text class="annotation" x="906" y="207">空闲</text>
    <text class="annotation" x="1063" y="153">块 3</text>
    <g v-if="$clicks === 2" class="step-arrival">
    <rect class="output-tile" x="995" y="168" width="64" height="62" rx="3" />
    <rect class="wait-region" x="1064" y="168" width="64" height="62" rx="3" />
    <text class="trace-text" x="1027" y="207">A3</text>
    </g>
    <g v-else class="step-arrival">
    <rect class="wait-region" x="995" y="168" width="133" height="62" rx="3" />
    <text class="annotation" x="1061" y="207">空闲</text>
    </g>
    <text class="annotation" x="598" y="294">块 4</text>
    <rect class="tile-input" x="530" y="309" width="133" height="62" rx="3" />
    <text class="hot-text" x="596" y="348">B1</text>
    <text class="annotation" x="753" y="294">块 5</text>
    <rect class="output-tile" x="685" y="309" width="133" height="62" rx="3" />
    <text class="trace-text" x="751" y="348">A0</text>
    <text class="annotation" x="908" y="294">块 6</text>
    <rect class="wait-region" x="840" y="309" width="133" height="62" rx="3" />
    <text class="annotation" x="906" y="348">空闲</text>
    <text class="annotation" x="1063" y="294">块 7</text>
    <rect class="output-tile" x="995" y="309" width="133" height="62" rx="3" />
    <text class="trace-text" x="1061" y="348">A2</text>
    <text class="annotation" x="205" y="418">{{ $clicks === 1 ? 'A：3 块　B：2 块' : 'A 新增 1 token，分配新块' }}</text>
    <text class="annotation" x="830" y="418">{{ $clicks === 1 ? '逻辑上连续，物理位置可以分散' : '新块只用一半，另一半留给后续 token' }}</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ ['预留的空位，会挤占其他请求可用的显存', 'Attention 按块表找到 KV，无需一整段连续显存', '分块减少浪费，不会压缩 KV 本身'][Math.min($clicks, 2)] }}</figcaption>
</figure>

::footer::

<span>存储 · KV 管理与内存池</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
上一页的36GiB是实际KV数据量；本页再看显存分配方式会不会额外浪费容量。固定一个小例子：A有6个token，B有4个token，最多各生成到8个token。两种方式均展示16个token位置的总容量。每块2token只为绘图清楚，不是vLLM推荐或默认配置。
初始：一种朴素连续分配方案按每请求最大长度预留8个位置，A占用6个，B占用4个，另外6个空位被预留而无法交给其他请求。本图展示预留浪费；连续分配还可能有不同请求结束后产生的外部碎片，但此处不另外堆一个例子。
[click] PagedAttention将逻辑KV分成固定token数的块。A的逻辑块0、1、2分别映射到物理块5、1、7；B使用0、4。A/B共用5个物理块，另外3个可用于其他请求。块表给Attention kernel提供物理地址映射，kernel按映射读取对应的K/V，而不是先将整个KV搬成一段连续区域。图中只画A的块表，B也有自己的块表。A0表示A的逻辑块0，不是单个token；每个实心块此时包含2个token的KV。
[click] A新增1个token时，逻辑块3映射到原本空闲的物理块3。末块只用一个位置，第二个位置供后续token填入。固定块分配减少预留及外部碎片，仍可能存在末块未填满的内部浪费；新KV本身没有压缩。请求结束后，不再被任何请求或前缀缓存引用的块可以归还。共享相同前缀、引用计数和写时复制是可进一步建立的机制，本页不展开。
这里介绍原始PagedAttention的分块与映射思想，不承诺当前vLLM所有attention backend都采用同一个历史kernel。KV块也不是CUDA线程块。
原论文：https://arxiv.org/abs/2309.06180
原始机制图解：https://vllm.ai/blog/2023-06-20-vllm

-->


---
class: diagram-page
clicks: 1
---

# 把 KV 的存储容量，从计算节点中分离

::left::

<figure class="gemm-figure storage-figure" :data-phase="Math.min($clicks, 1)" aria-label="先建立外部KV缓存池。计算节点A将已完成请求的可复用前缀保存到池中，腾出显存。节点B遇到匹配前缀时再取回到GPU，以取回的代价换取前缀Prefill计算的节省。">
  <p class="gemm-context">{{ $clicks === 0 ? '请求结束后，相同前缀的 KV 还可能再次用到' : '另一条请求到来：先查池中是否已有可复用的前缀' }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing storage-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="pool-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="device" x="35" y="80" width="350" height="150" rx="3" />
    <text class="matrix-name" x="210" y="117">计算节点 A</text>
    <rect class="output-tile" x="65" y="142" width="290" height="60" rx="3" />
    <text class="trace-text" x="210" y="180">GPU：服务其他请求</text>
    <rect class="device" x="35" y="276" width="350" height="150" rx="3" />
    <text class="matrix-name" x="210" y="313">计算节点 B</text>
    <rect class="output-tile" x="65" y="337" width="290" height="60" rx="3" />
    <text class="trace-text" x="210" y="376">{{ $clicks === 0 ? 'GPU：等待新请求' : 'GPU：继续处理请求' }}</text>
    <rect class="device" x="755" y="80" width="378" height="346" rx="3" />
    <text class="matrix-name" x="944" y="124">外部内存池</text>
    <rect class="tile-input" x="790" y="158" width="308" height="76" rx="3" />
    <text class="hot-text" x="944" y="205">保留的前缀 KV</text>
    <rect class="wait-region" x="790" y="259" width="146" height="60" rx="3" />
    <rect class="wait-region" x="952" y="259" width="146" height="60" rx="3" />
    <text class="" x="863" y="298">空闲</text>
    <text class="" x="1025" y="298">空闲</text>
    <text class="annotation" x="944" y="379">按 KV 块查找、回收</text>
    <g v-if="$clicks === 0" class="step-arrival">
    <path class="hot-line" d="M 386 173 H 745" marker-end="url(#pool-arrow)" />
    <text class="hot-text" x="570" y="141">保存可复用的前缀</text>
    <text class="annotation" x="570" y="217">让出 GPU 显存</text>
    <text class="annotation" x="570" y="351">活跃请求的 KV</text>
    <text class="annotation" x="570" y="390">仍保留在 GPU</text>
    </g>
    <g v-else class="step-arrival">
    <path class="hot-line" d="M 790 210 H 710 V 366 H 395" marker-end="url(#pool-arrow)" />
    <text class="hot-text" x="550" y="325">命中相同前缀，取回</text>
    <text class="annotation" x="555" y="410">省去对应的 Prefill</text>
    <text class="matrix-name" x="560" y="135">新的请求到达 B</text>
    <text class="annotation" x="560" y="187">使用相同模型与前缀</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ $clicks === 0 ? '把暂不使用的 KV 放到池中，给活跃请求腾出显存' : '复用能省下 Prefill，但要付出 KV 取回的时间' }}</figcaption>
</figure>

::footer::

<span>存储 · KV 管理与内存池</span><span>步骤 {{ Math.min($clicks, 1) + 1 }} / 2</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
PagedAttention改善分配效率，但无法无限减小真实KV容量。下一步可以将一部分缓存保留在GPU之外，让存储容量与计算资源分别扩展。先建立逻辑上的KV缓存池，不预设RDMA或CXL。
初始：某条请求结束后，服务为了将来复用而保留其前缀KV。示意将这份暂不使用的KV保存到外部池，完成保存后可以释放它在GPU上的占用，GPU显存用来服务活跃请求。也可针对暂停请求设计卸载策略；不意味着所有请求都值得卸载，直接丢弃并重算也是选择。外部池可能由多个节点的DRAM或其他存储层构成；本图省略具体介质和传输机制。
[click] 节点B的新请求使用相同模型、兼容的缓存格式以及完全匹配的前缀和有关上下文条件时，可以查找并取回前缀KV，省去对应部分的Prefill。若后面还有未缓存的后缀，仍需计算后缀；不能任意拼接文档片段的KV。需比较查找、排队、传输、写入GPU等时间与重算这段前缀的时间，也需考虑缓存容量、命中率和重算资源。这里不承诺任何速度提升或给出虚构测量值。
活跃Decode仍频繁读取历史KV，早期token不等于冷数据。本节优先用已完成请求的可复用前缀解释池化，而不是声称可以每步从慢层取全量KV而没有代价。多GPU分片时还涉及KV布局匹配，图中省略。
这里是软件管理的KV数据池；后面的CXL页讲硬件内存容量池。拿到一段CXL内存不等于自动获得分布式KV查找、共享、驱逐或所有权协议。两层可以配合，但不是同一个概念。
实际系统参考Mooncake：利用集群DRAM/SSD组织KV缓存并传输；不声称Mooncake使用CXL。本页是统一的教学场景，不是其系统结构复刻。
Mooncake（FAST 2025）：https://www.usenix.org/conference/fast25/presentation/qin
项目：https://github.com/kvcache-ai/Mooncake

-->


---
class: diagram-page
clicks: 2
---

# RDMA：从远端内存取回 KV

::left::

<figure class="gemm-figure storage-figure" :data-phase="Math.min($clicks, 2)" aria-label="一次单边RDMA读取。先注册授权并由CPU提交工作请求，再由网卡从内存池DRAM搬运KV到主机缓冲区，最后展示支持GPUDirect RDMA时可直接接收至GPU HBM的路径。">
  <p class="gemm-context">{{ ['一次取回：指定远端 KV 的位置，以及本地接收位置', '提交请求后，由两端网卡完成数据搬运', '硬件与驱动支持时，可把 GPU 显存作为接收位置'][Math.min($clicks, 2)] }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing storage-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="rdma-kv-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="device" x="30" y="89" width="380" height="339" rx="3" />
    <text class="matrix-name" x="220" y="128">计算节点</text>
    <rect class="operation" x="75" y="148" width="270" height="53" rx="3" />
    <text class="" x="210" y="184">{{ $clicks === 0 ? 'CPU：提交读取请求' : 'CPU：检查传输完成' }}</text>
    <rect class="operation" x="290" y="239" width="85" height="54" rx="3" />
    <text class="" x="332" y="275">网卡</text>
    <rect class="device" x="775" y="89" width="363" height="339" rx="3" />
    <text class="matrix-name" x="956" y="128">内存池节点</text>
    <rect class="operation" x="800" y="239" width="85" height="54" rx="3" />
    <text class="" x="842" y="275">网卡</text>
    <rect class="tile-input" x="955" y="227" width="158" height="78" rx="3" />
    <text class="hot-text" x="1034" y="259">DRAM</text>
    <text class="hot-text" x="1034" y="290">前缀 KV</text>
    <rect class="output-tile" x="75" y="351" width="270" height="54" rx="3" />
    <text class="trace-text" x="210" y="387">GPU HBM</text>
    <path class="trace-guide" d="M 210 205 V 210 H 332 V 234" marker-end="url(#rdma-kv-arrow)" />
    <text class="annotation" x="585" y="174">{{ $clicks === 0 ? '地址 · 长度 · 访问权限' : '网卡搬运 KV' }}</text>
    <text class="annotation" x="585" y="309">RDMA 网络</text>
    <g v-if="$clicks < 2" class="step-arrival">
    <rect class="tile-input" x="55" y="239" width="170" height="54" rx="3" />
    <text class="hot-text" x="140" y="275">主机缓冲区</text>
    <path :class="$clicks === 0 ? 'quiet-line' : 'hot-line'" d="M 947 266 H 893" marker-end="url(#rdma-kv-arrow)" />
    <path :class="$clicks === 0 ? 'quiet-line' : 'hot-line'" d="M 792 266 H 383" marker-end="url(#rdma-kv-arrow)" />
    <path :class="$clicks === 0 ? 'quiet-line' : 'hot-line'" d="M 282 266 H 233" marker-end="url(#rdma-kv-arrow)" />
    <path :class="$clicks === 0 ? 'quiet-line' : 'trace-line'" d="M 140 301 V 343" marker-end="url(#rdma-kv-arrow)" />
    </g>
    <g v-if="$clicks === 0" class="step-arrival">
    <text class="annotation" x="585" y="370">两端先注册并授权缓冲区</text>
    </g>
    <g v-else-if="$clicks === 1" class="step-arrival">
    <text class="annotation" x="585" y="370">先到主机，再送入 GPU</text>
    </g>
    <g v-else class="step-arrival">
    <path class="hot-line" d="M 947 266 H 893" marker-end="url(#rdma-kv-arrow)" />
    <path class="hot-line" d="M 792 266 H 383" marker-end="url(#rdma-kv-arrow)" />
    <path class="trace-line" d="M 332 297 V 342" marker-end="url(#rdma-kv-arrow)" />
    <text class="trace-text" x="145" y="273">GPUDirect</text>
    <text class="trace-text" x="145" y="307">RDMA</text>
    <text class="trace-text" x="585" y="370">省去主机缓冲区中转</text>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ ['先注册并授权缓冲区，再显式提交传输', '单边 RDMA 读取，无需远端 CPU 逐次处理', 'GPUDirect RDMA：网卡直接把 KV 写入 GPU 显存'][Math.min($clicks, 2)] }}</figcaption>
</figure>

::footer::

<span>存储 · KV 管理与内存池</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
沿用上一页计算节点B从外部池取前缀KV的动作。本页固定为单边RDMA Read：请求方知道远端地址、长度和访问密钥/权限等信息，网卡将远端已授权缓冲区中的KV写入本地已注册的接收缓冲区。RDMA还包括Write等操作，实际KV传输系统可选择不同协议。
初始：两端预先完成连接与内存注册、权限配置等控制工作。CPU或运行时提交读取工作请求，本例不是通过普通CPU指针解引用直接访问远端KV。注册通常可以复用，不需要每次KV读取都重新注册。图中省略远端控制CPU、交换机与PCIe层级；不能把图示理解成CPU完全不参与。
[click] 展示普通主机缓冲区接收的一种路径：远端DRAM → 远端NIC → 网络 → 本地NIC → 本地主机缓冲区，再拷贝到GPU HBM供GPU使用。远端CPU无需为每个单边RDMA Read执行数据搬运或处理请求。本地需要使用正确的完成事件、同步和可见性规则，不能在传输完成前使用目标数据。图中CPU“检查传输完成”表示这类协调，不表示所有系统必须用同一种轮询方式。
[click] 在平台、NIC、GPU、驱动及PCIe拓扑支持时，GPUDirect RDMA允许将GPU显存作为RDMA接收/发送缓冲区。此例省去主机内存中转，数据直接由NIC写入GPU HBM；远端仍然是DRAM。它省掉一次中转，不会消除网络传输、注册和同步，也不保证所有拓扑都同样高效。图展示一种可支持的路径，不是任何GPU均可使用的能力。
RDMA机制与权限：https://networking-docs.nvidia.com/doca/archive/3-5-0/rdma-aware-networks-programming-guide
GPUDirect RDMA原理及平台限制：https://docs.nvidia.com/cuda/gpudirect-rdma/

-->


---
class: diagram-page
clicks: 2
---

# CXL：把池中内存接入主机地址空间

::left::

<figure class="gemm-figure storage-figure" :data-phase="Math.min($clicks, 2)" aria-label="CXL首先把池中不同内存区域分给主机A和B，池化不代表共享同一字节。聚焦A后显示CPU通过load/store和地址映射访问CXL.mem内存；最后展示需要另行支持的数据路径，才能将KV供GPU HBM上的计算使用。">
  <p class="gemm-context">{{ ['先分配容量：主机 A、B 获得各自的内存区域', '与 RDMA 显式提交传输不同，CPU 可读写映射后的地址', 'CPU 能寻址这块内存，还要确认 GPU 怎样使用其中的 KV'][Math.min($clicks, 2)] }}</p>
  <svg class="execution-drawing gemm-drawing network-drawing storage-drawing" viewBox="0 0 1168 510" aria-hidden="true">
    <defs>
      <marker id="cxl-pool-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse" overflow="visible"><path class="arrowhead" d="M 2 2 L 10 6 L 2 10" /></marker>
    </defs>
    <rect class="device" x="824" y="85" width="314" height="342" rx="3" />
    <text class="matrix-name" x="981" y="125">CXL 内存池</text>
    <text class="annotation" x="981" y="165">Type 3 内存</text>
    <rect class="output-tile" x="854" y="194" width="254" height="72" rx="3" />
    <text class="trace-text" x="981" y="239">分配给主机 A</text>
    <rect class="tile-input" x="854" y="294" width="254" height="72" rx="3" />
    <text class="hot-text" x="981" y="339">分配给主机 B</text>
    <rect class="operation" x="498" y="213" width="178" height="69" rx="3" />
    <text class="" x="587" y="257">CXL 交换机</text>
    <path class="trace-line" d="M 677 247 H 815" marker-end="url(#cxl-pool-arrow)" />
    <text class="annotation" x="750" y="213">CXL.mem</text>
    <g v-if="$clicks === 0" class="step-arrival">
    <rect class="device" x="30" y="89" width="322" height="145" rx="3" />
    <text class="matrix-name" x="191" y="129">主机 A</text>
    <rect class="output-tile" x="60" y="151" width="262" height="55" rx="3" />
    <text class="" x="191" y="188">CPU / 地址空间</text>
    <rect class="device" x="30" y="283" width="322" height="145" rx="3" />
    <text class="matrix-name" x="191" y="323">主机 B</text>
    <rect class="tile-input" x="60" y="345" width="262" height="55" rx="3" />
    <text class="" x="191" y="382">CPU / 地址空间</text>
    <path class="trace-line" d="M 353 178 H 430 V 232 H 489" marker-end="url(#cxl-pool-arrow)" />
    <path class="hot-line" d="M 353 372 H 453 V 265 H 489" marker-end="url(#cxl-pool-arrow)" />
    </g>
    <g v-else class="step-arrival">
    <rect class="device" x="30" y="85" width="368" height="342" rx="3" />
    <text class="matrix-name" x="214" y="124">主机 A</text>
    <rect class="output-tile" x="75" y="149" width="278" height="57" rx="3" />
    <text class="trace-text" x="214" y="187">CPU / Cache</text>
    <path class="trace-line" d="M 214 209 V 257" marker-end="url(#cxl-pool-arrow)" />
    <text class="compact-label" x="305" y="241">load / store</text>
    <rect class="address-window" x="75" y="266" width="278" height="53" rx="3" />
    <text class="" x="214" y="302">映射的内存地址</text>
    <path class="trace-line" d="M 355 292 H 440 V 247 H 490" marker-end="url(#cxl-pool-arrow)" />
    <rect class="output-tile" x="75" y="364" width="278" height="46" rx="3" />
    <text class="trace-text" x="214" y="396">GPU HBM</text>
    <g v-if="$clicks === 1" class="step-arrival">
    <text class="trace-text" x="603" y="360">按地址访问</text>
    <text class="annotation" x="603" y="404">无需逐次提交 RDMA 请求</text>
    </g>
    <g v-else class="step-arrival">
    <path class="hot-line" d="M 214 323 V 355" marker-end="url(#cxl-pool-arrow)" />
    <text class="hot-text" x="601" y="361">示例：拷贝到 HBM</text>
    <text class="annotation" x="601" y="405">GPU 路径取决于平台支持</text>
    </g>
    </g>
  </svg>
  <figcaption class="gemm-takeaway">{{ ['池化可以按需分配容量，不等于共享同一份 KV', 'CPU 用 load/store 访问，缓存一致性由硬件维护', '扩展容量之后，仍要核算延迟、带宽与搬运代价'][Math.min($clicks, 2)] }}</figcaption>
</figure>

::footer::

<span>存储 · KV 管理与内存池</span><span>步骤 {{ Math.min($clicks, 2) + 1 }} / 3</span><span>{{ $page }} / {{ $nav.total }}</span>

<!--
上一页的RDMA展示“提交一次数据传输”；本页转向“把外部内存映射进主机地址空间”。RDMA是一类远程内存访问机制，CXL是互连协议族，这里比较的是RDMA访问远端内存与CXL.mem访问池化内存的路径，并非将两个名词当作同一层级的互斥替代品。
初始：CXL Type 3设备提供内存扩展能力；通过支持的交换结构和管理软件，可以把内存池中的不同区域分配给不同主机。内存容量可与计算分别配置，适合调整主机之间的容量分配；不代表任何平台都可以无条件即时重新分配正在使用的页。图中A/B获得不同区域，表示pooling。CXL 2.0已支持这类池化，但同一设备物理内存位置不能由多主机同时映射为共享区域。CXL 3.0进一步定义支持硬件一致性的共享内存能力，使用仍取决于设备、交换结构和系统实现。本页没有画CXL 3.0共享场景，不能据此让A/B并发使用同一份KV。
[click] 系统通过地址映射和相关解码配置，将分配给A的设备内存接入A的系统物理地址空间，OS/运行时再使软件获得可访问地址。CPU随后可用普通load/store访问，允许CPU缓存并由硬件在受支持的一致性域内维护一致性；缓存命中不需要每次都到达外部设备。图中地址框为映射关系，不是另一个必经的DRAM中转缓冲区。CXL.mem路径省略root port及控制事务，用CXL交换机代表池化连接，不经RDMA网卡。硬件缓存一致性不替代软件的锁、所有权和并发控制，也不意味着所有主机自动组成全局一致性域。
[click] GPU HBM与CXL设备内存仍是不同介质。“CPU可寻址”不能推导出任意GPU可直接、高效地使用这块内存。本图选择一种保守的使用方式：运行时经受支持的数据路径将KV拷贝到HBM，再用于GPU计算；具体路径是否需要中转、能否直接访问或P2P传输，依赖GPU、root complex、IOMMU、驱动和平台实现。本图的箭头表达软件安排的拷贝，绝不宣称所有CXL平台都具备同样的GPU DMA能力。容量扩大不能消除延迟、带宽和搬运成本，也不保证CXL一定快于任意RDMA网络。
回到KV池：CXL提供容量和访问机制，软件仍须管理缓存索引、命中、分配、驱逐和生命周期；CXL硬件容量池本身不会自动变成跨主机共享KV服务。RDMA可连接更大范围的节点，CXL可作为主机的扩展内存层，两者也可能同时存在。本节不展开产品规格或未经验证的性能数字。
CXL 2.0池化与共享区别：https://computeexpresslink.org/blog/cxl-2-0-specification-memory-pooling-questions-from-the-webinar-part-2-2391/
CXL 3.0白皮书：https://computeexpresslink.org/wp-content/uploads/2023/12/CXL_3.0_white-paper_FINAL-1.pdf
主机地址映射：https://www.kernel.org/doc/html/v6.12/driver-api/cxl/memory-devices.html
CXL in Cloud Practice：https://pages.cs.wisc.edu/~markhill/papers/ieeetoc2026_cxl_practice.pdf

-->


