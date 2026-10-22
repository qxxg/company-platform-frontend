# company-platform-frontend

公司管理系统 PC Web 前端（独立仓库）。技术栈为 Vue 3、Vite 7、Element Plus、Pinia、Vue Router、Axios 和 ECharts 6，使用 OAuth2 授权码 + PKCE 登录认证中心，通过网关访问后端接口。

> 后端是独立仓库 `company-platform-backend`（目录 `company-platform`）。本仓库不依赖后端源码，只通过网关 `/api/**` 调用接口；克隆后请把两个仓库放在同一目录下：
>
> ```text
> workspace/
>   company-platform/        # 后端 company-platform-backend
>   company-platform-web/    # 前端 company-platform-frontend（本仓库）
> ```

## 1. 本地启动

前置条件：

- Node.js 24+（当前开发环境为 `v24.18.0`）
- 认证中心 `platform-auth` 已启动：`http://localhost:9000`
- 网关 `platform-gateway` 已启动：`http://localhost:8080`
- `pc-web` 客户端已把当前前端回调地址注册到认证中心

```powershell
# 首次安装依赖
npm.cmd install

# 开发模式，监听 0.0.0.0:5173
npm.cmd run dev

# 生产构建，输出 dist/
npm.cmd run build
```

也可以从后端仓库根目录启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev/start-web.ps1 -Install
```

浏览器访问 `http://localhost:5173`，点击“统一认证登录”后会跳转到认证中心的登录页。登录成功后回调到 `/login/oauth2/code/pc-web`，前端用授权码换取 access token。

## 2. 环境变量

Vite 只暴露以 `VITE_` 开头的变量。开发环境读取 `.env.development`，生产构建读取 `.env.production`。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | Axios 基础路径；开发环境由 Vite 代理到网关 |
| `VITE_DEV_API_TARGET` | `http://localhost:8080` | 开发代理目标，生产构建不使用 |
| `VITE_AUTH_BASE_URL` | 空 | 认证中心地址；为空时使用当前主机名的 `9000` 端口 |
| `VITE_OAUTH_CLIENT_ID` | `pc-web` | OAuth2 公共客户端 ID |
| `VITE_OAUTH_REDIRECT_URI` | 空 | 回调地址；为空时使用当前页面 origin 加固定回调路径 |

使用内网 IP 访问时，例如 `http://192.168.3.43:5173`，认证中心地址会自动推导为 `http://192.168.3.43:9000`。因此必须同时满足：

1. 认证中心的 `AUTH_ISSUER` 与浏览器访问认证中心的地址一致；
2. 认证中心允许该 Origin 跨域访问令牌端点；
3. `pc-web` 已注册 `http://192.168.3.43:5173/login/oauth2/code/pc-web` 作为回调地址。

## 3. OAuth2 / PKCE 登录流程

1. `LoginView` 生成 48 字节 `code_verifier` 和 32 字节 `state`；
2. 用 SHA-256 计算 `code_challenge`，把 verifier、state、登录后返回路径保存到 `sessionStorage`；
3. 跳转认证中心 `/oauth2/authorize`；
4. 用户在认证中心登录；
5. 回调页校验 `state`，调用 `/oauth2/token` 交换令牌；
6. access token 保存到 `localStorage`，路由守卫和 Axios 请求拦截器据此判断登录状态。

`pc-web` 是公开客户端，不保存 `client_secret`。当前 Spring Authorization Server 1.5 默认不向公共客户端签发 refresh token，所以 access token 过期后需要重新登录。生产环境如需无感续期，建议增加 BFF，用 HttpOnly Cookie 保存会话和后端刷新令牌，不要把长期令牌放进浏览器存储。

## 4. 页面与权限

| 页面 | 路由 | 权限 |
| --- | --- | --- |
| 登录入口 | `/login` | 公开 |
| OAuth 回调 | `/login/oauth2/code/pc-web` | 公开 |
| 工作台 | `/dashboard` | 登录即可（经营指标区需 `bi:dashboard:read`） |
| 经营大屏 | `/cockpit` | `bi:cockpit:read` |
| 客户列表 | `/customers` | `customer:read` |
| 新建客户 | `/customers/create` | `customer:write` |
| 客户 360 | `/customers/:id` | `customer:read` |
| 信用看板 | `/finance/credit` | `finance:credit:read` |
| 应收账款 | `/finance/receivables` | `finance:receivable:read` |
| 收款核销 | `/finance/receipts` | `finance:receipt:read` |
| 手工开票 | `/finance/invoices` | `finance:invoice:read` |
| 客户对账 | `/finance/statements` | `finance:statement:read` |
| 合同管理 | `/finance/contracts` | `finance:contract:read` |
| 费用报销 | `/finance/expenses` | `finance:expense:read` |
| 借款与还款 | `/finance/loans` | `finance:loan:read` |
| 订单列表 | `/orders` | `order:read` |
| 新建订单 | `/orders/create` | `order:create` |
| 订单详情 | `/orders/:orderNo` | `order:read` |
| 消息中心 | `/messages` | 登录即可 |
| AI 助手 | `/assistant` | `ai:assistant:use` |
| 设备台账 | `/equipment` | `equipment:read` |
| 排产队列 | `/production/schedule` | `production:schedule:read` |
| 维护工单 | `/production/maintenance` | `equipment:maintenance:read` |
| 点检保养 | `/production/inspections` | `equipment:inspection:read` |
| 插队申请 | `/production/jump-requests` | `production:queue:jump:apply` 或 `production:queue:jump:approve` |
| 仓储管理（仓库/物料/库存） | `/warehouse` | `warehouse:read` |
| 采购入库 | `/warehouse/purchase-receipts` | `warehouse:read` |
| 跨厂调拨 | `/warehouse/stock-transfers` | `warehouse:read` |
| 工单领料 | `/warehouse/material-issues` | `warehouse:read` |
| 审批中心（待办/我的申请） | `/approval` | `approval:read` |
| 审批流程与档位 | `/approval/definitions` | `approval:read` |
| 用户账号 | `/system/users` | `system:user:list` |
| 工厂组织 | `/system/factories` | `system:factory:list` |
| 角色与权限 | `/system/permissions` | 登录即可 |
| 个人中心 | `/profile` | 登录即可 |
| 业务模块路线图 | `/modules/:moduleKey` | 登录即可 |

权限声明来自 JWT 的 `permissions` 数组。前端隐藏菜单和按钮只是体验优化，后端接口仍通过 `@PreAuthorize` 独立校验，不能依赖前端做安全控制。

客户、合同、信用、应收、收款、开票、对账、费用报销、借款与还款、订单、设备台账、排产队列、维护工单、点检保养、插队申请、仓储管理、审批中心、设备数据上报、AI 助手、首页经营指标与经营大屏和消息中心页面已接入真实接口。客户数据范围在服务端校验：销售只能访问归属自己的客户，管理员/财务可访问全部；排产看板中销售只能看到自己工单对应的队列记录。AI 助手只读，工具调用仍透传当前用户 JWT，不会绕过这些范围控制。

### 4.1 经营指标与经营大屏

- 工作台（`/dashboard`）顶部是经营指标区：KPI 卡片、近 12 个月订单/收款趋势、本月订单状态环图、风险与待办、“待数据源”条；右上角“指标口径”按钮弹出全量指标定义（口径、分类、状态、数据源）。
- 经营大屏（`/cockpit`）是独立路由的 16:9 暗色页面：顶部标题栏 + 数据范围/最后同步时间/时钟，6 个 KPI 卡，主区为订单与收款趋势、设备状态环图、本月订单状态环图、工厂订单对比条形图和风险预警列表，底部显示数据范围、同步时间与待数据源数量。支持浏览器全屏与每 5 分钟自动刷新。
- 数据全部来自 `platform-bi` 的只读聚合接口（`/api/bi/dashboard`、`/api/bi/metrics`）。前端不做金额换算、不做数据范围过滤、不拼业务 SQL；后端已按 JWT 角色把范围拼进 SQL。
- 不可计算的指标不会出现在卡片里，只在“待数据源”里出现，避免用 0 或估算值冒充实测值。
- 图表由 `components/ChartPanel.vue` 封装 ECharts 6（只负责实例生命周期与自适应），业务 option 在页面里生成。

## 5. 客户、合同与订单页面说明

- 客户来源、归属业务员必填；销售新建客户时，归属和信用额度由后端收紧为本人/0。
- 客户名称、归属、信用额度、结算方式、开票信息属于审批字段，普通编辑对话框不提供这些字段的直接修改入口。
- 合同由财务新建，初始“待财务录入”；点击“正式录入”或“保存并正式录入”后，订单才能引用。
- 信用看板逐客户合并“未收应收”和“未关闭订单占用”，展示授信、已用、可用、最大逾期与风险标签；页面只读，不提供直接改额度入口。
- 应收账款页展示账龄与逾期（后端实时计算），并按筛选条件汇总应收总额、未收余额和逾期金额；登记应收只对财务开放，正式应收由发货/开票自动生成。
- 收款核销页先登记到账，再按未结应收分配；一张收款单可核销多张应收，未核销余额作为预收待认领。前端用 `BigInt` 比较金额，避免浮点误差。
- 手工开票页登记票面信息并跟踪“已登记 → 已寄出 → 客户签收”；发票号码全局唯一，开票金额受合同剩余额度限制。作废/红冲待审批中心上线后开放。
- 客户对账页按客户和期间生成快照，展示期初、本期应收、本期收款、本期开票和期末；明细包括应收、核销和开票流水，可打印/另存 PDF，客户确认后归档。
- 财务接口统一走 `/api/finance/**`（`api/finance.js`），后端当前由客户服务托管，后续拆分独立财务服务时前端路径不变。
- 订单号使用雪花 ID，后端序列化为字符串；前端始终按字符串处理，禁止转成 `Number`，否则会超过 JavaScript 安全整数范围。
- 金额字段 `totalAmount`、`contractAmount` 的单位是分。`utils/money.js` 使用整数运算和 BigInt 截断，不进行四舍五入。
- 列表查询使用 `GET /api/order/orders/page`，支持订单号、客户、工厂、状态和分页参数。
- 新建订单必须选择合作中客户和财务已录入合同。提交时后端强校验客户状态、合同归属/状态/有效期/币种/剩余额度、信用额度及逾期 30 天规则；前端仅做提示。
- 订单不能跨工厂；一台设备同一时间只能处理一笔订单，超出产能的订单进入 FIFO 队列。设备与排产模块落地后，订单状态和队列信息会继续展示在详情页。

## 6. 设备台账、排产与消息页面说明

- 设备台账（`/equipment`）维护设备编号、名称、类型、归属工厂、车间位置、可处理材料/工艺、门幅区间、产能、换型时间、良率和操作员资质要求；设备编号全公司唯一、归属单一工厂，创建后不可修改。
- 设备状态只有 `IDLE/RUNNING/MAINTENANCE/FAULT/DISABLED`；`RUNNING` 只能由开始工单进入，页面只允许人工切换空闲/保养/故障/停用，生产中的设备不能停机。停机时若仍有等待队列，队列保留并给相关业务员发交期风险消息。
- 排产队列（`/production/schedule`）按设备分组展示当前生产与等待队列，队列位置从 1 开始。排产人员可以新建工单（可先不选设备，进入“待排产”后再分配）、开始队首工单、完成工单和取消排队中的工单。
- 设备必须与订单同工厂，并满足材料、门幅和工艺要求；不符合时由后端拒绝入队，页面只做提示。
- 插队必须由销售对自己排队中的工单发起申请，目标位置必须早于当前位置；申请会同步提交审批中心，审批通过后队列立即重排，被顺延业务员和申请人都收到站内消息，系统不做经济补偿。插队申请页（`/production/jump-requests`）是只读记录页，审批动作在「审批中心 · 我的待办」完成。
- 顶栏铃铛显示未读站内消息数并展示最近 5 条，页面路由切换和 30 秒轮询都会刷新；消息中心（`/messages`）可查看全部/仅未读、标记已读，并跳转到关联订单。
- 订单详情页新增“生产工单”区块，展示工单号、设备、材料/工艺/门幅、队列位置、计划与实际时间、状态和备注；订单状态由工单联动更新。
- 维护工单（`/production/maintenance`）由厂长或管理员发起：新建后设备状态不变，开始维护时设备转为“保养中/故障维修”，等待队列保留并给受影响业务员发交期风险消息，完成后登记成本与停机时长、设备恢复空闲并重算队列计划时间。
- 维护费用全部由公司承担，页面只做成本记录（按分存储、前端按元输入并截断到两位小数），不生成应收也不计算设备使用费。
- 点检保养（`/production/inspections`）供操作员登记日/周/月点检结果；结果为异常时必须填写异常项数，并可一键生成“点检整改”维护工单。
- 销售和财务对维护与点检只有只读权限：销售用于判断交期风险，财务用于了解公司维保成本；写操作按钮按权限隐藏，服务端仍会二次校验。
- 仓储管理（`/warehouse`）包含仓库档案、物料档案和库存台账三个页签：每厂至少一个主仓，物料单价 4 位小数、损耗率 2 位小数，库存台账只读且不提供调整入口。
- 采购入库（`/warehouse/purchase-receipts`）先建草稿再确认收货：单价和损耗率取自物料档案，金额由服务端按“数量 × 单价”截断到分，收货后单据不可修改。
- 跨厂调拨（`/warehouse/stock-transfers`）先出库后入库，出库由调出工厂执行、入库由调入工厂执行；库存不足时整单失败，不会出现部分扣减。
- 工单领料（`/warehouse/material-issues`）建单不扣库存，确认发料才扣减并计入工单材料成本；领料仓库必须与工单同厂，工单需处于排队中或生产中。
- 工单材料成本只对拥有 `production:cost:read` 的角色展示（厂长、管理员、财务）；订单详情页的工单表会显示领料累计成本，缺少权限时该列不显示。
- 审批中心（`/approval`）包含「我的待办」和「我的申请」两个页签：待办按指定审批人或审批角色命中，同意时由审批中心回调业务服务落地变更；驳回必须填写意见，申请人可撤销自己的待审批申请。
- 审批流程与档位（`/approval/definitions`）由财务维护：同一业务类型可配置多档，按“下限含、上限不含”匹配，优先级数字小的先命中；金额按元输入、按分存储。
- 客户详情页的「申请调整信用额度」只提交申请（业务类型 `CREDIT_LIMIT`），额度在审批通过后才真正更新，页面始终不能直接改数。
- 金额与长度口径保持不变：金额按分截断，长度保留 2 位小数并截断，设备产能为米/小时；雪花单号一律按字符串处理，禁止转 `Number`。

## 7. 生产构建与部署

```powershell
npm.cmd run build
```

产物在 `dist/`。推荐的 Nginx 配置：

```nginx
server {
    listen 80;
    server_name _;

    root /srv/company-platform/platform-web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

生产部署还需要：

- 域名、ICP、HTTPS；
- 把实际前端域名注册到 `pc-web` 的 redirect URI 和 post-logout URI；
- 用 Nginx 或后端配置收敛 CORS 来源；
- 认证中心和网关使用同一套内部服务地址；
- 移除开发默认账号、默认密码和测试数据。

## 8. 目录结构

```text
src/
  api/           Axios 实例和客户/合同/订单/设备排产/系统/消息/BI 接口
  components/    通用布局、状态、空态、ECharts 容器组件
  constants/     业务枚举、路线图、角色名称
  layouts/       主布局（含消息铃铛与轮询）
  router/        路由、权限元数据、登录守卫
  stores/        Pinia 认证会话
  styles/        设计变量和全局样式
  utils/         OAuth、JWT、金额、格式化、错误处理
  views/         页面（production/ 设备与排产，messages/ 消息中心）
```
