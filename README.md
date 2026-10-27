# ptiris' slides

多份独立 Slidev 报告的源码与静态网站。GitHub 仓库名为 `ptiris-slides`，网站展示名称为 **ptiris' slides**。

## 目录约定

```text
decks/
  inference-infra/       # 当前的推理基础设施报告
    slides.md            # 一份完整报告；所有文字与图内标签在这里编辑
    style.css            # 本报告的样式
    public/              # 图片、字体等本地资源
    layouts/             # 通用布局；不放具体案例的文字
    reference/           # 讲解提纲、来源和设计说明
    package.json         # 本报告的依赖与 Slidev 命令
    README.md            # 报告说明
  another-talk/          # 后续报告使用同样的结构
site.json                # 网站名称、部署路径、报告清单和首页顺序
scripts/                 # 统一开发、导出与构建入口
.github/workflows/       # GitHub Actions 构建与发布
package.json             # npm workspaces
package-lock.json        # 全仓库共用的唯一依赖锁文件
```

- 一份报告对应 `decks/<slug>/`，不是一个文件夹对应一页幻灯片。
- `slug` 使用小写英文、数字和连字符，如 `inference-infra`；它也是网址的一部分，发布后尽量保持不变。
- 每份报告独立保存样式、布局和资源，避免对其他报告产生影响。
- 所有演示文字放在该报告的 `slides.md`；不为每一页单独创建 Vue 组件。
- `Ref/`、QA 截图、构建产物、依赖和本地配置不提交。字体授权与报告引用来源随源码保留。

## 本地使用

使用 Node.js 24，在仓库根目录运行：

```sh
npm ci
npm run dev -- inference-infra
```

Slidev 默认在 `http://localhost:3030` 打开当前报告。可以继续传递 Slidev 参数：

```sh
npm run dev -- inference-infra --port 3032
npm run export -- inference-infra
```

导出 PDF 等格式需要额外安装 Slidev 所要求的浏览器依赖；静态网站构建不需要。

## 新增报告

1. 新建 `decks/<slug>/`，放入 `slides.md` 和所需资源。
2. 新建该报告的 `package.json`，使用唯一名称 `@ptiris-slides/<slug>`，包含 `dev`、`build`、`export` 三个脚本。可参考 [当前报告的配置](decks/inference-infra/package.json)，主题和额外依赖在本报告中声明。
3. 在 `site.json` 的 `decks` 数组中加入 `{ "slug": "<slug>", "title": "报告标题", "description": "简短介绍" }`。数组顺序就是首页顺序。
4. 在仓库根目录运行 `npm install`，更新唯一的 `package-lock.json`。
5. 用 `npm run dev -- <slug>` 预览，再用 `npm run build` 验证整个网站。

无需复制发布流程，也无需给每份报告新建仓库。新的报告会在下一次构建中加入首页。

## 构建与网址

```sh
npm run build
```

构建结果如下：

```text
dist/
  index.html                  # 报告目录首页
  inference-infra/             # 当前报告的独立静态应用
    index.html
    assets/
    fonts/
    images/
  <slug>/                     # 其他报告
```

`site.json` 中的 `base` 默认是 `/ptiris-slides/`。每份报告使用自己的 `base` 和 hash 路由，支持直接分享某页，也能在 GitHub Pages 上刷新页面。图片与字体必须放在本报告的 `public/` 中，并用 Slidev/Vite 支持的资源引用方式。

GitHub Pages 网址：

- 首页：`https://ptiris.github.io/ptiris-slides/`
- 当前报告：`https://ptiris.github.io/ptiris-slides/inference-infra/`
- 指定页：`https://ptiris.github.io/ptiris-slides/inference-infra/#/24`

演讲者备注目前随构建保留，其中包括报告的参考来源和计算过程。

## GitHub Pages 发布

Pages 使用 **GitHub Actions** 发布。每次推送到 `main`，工作流会安装依赖、构建首页和所有报告，并自动部署。Pull Request 只验证构建，不发布网站。

更新报告后推送到 `main` 即可上线，也可在 Actions 中手动运行 **Build and deploy slides**。构建失败时不会发布，线上继续保留上一次成功部署的版本。

## 当前报告

- [Introduction to Inference Infra](decks/inference-infra/README.md)
- [编辑内容](decks/inference-infra/slides.md)
- [图示与排版约定](decks/inference-infra/reference/authoring.md)
