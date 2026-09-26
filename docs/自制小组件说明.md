# EPhone 自制小组件

在 EPhone 自由布局桌面打开「小组件库」→「制作、导入或添加我的小组件」。这里可以从空白制作、选择功能范例、把要求交给任意 AI、导入别人分享的作品，或管理自己的作品。自制小组件只放置在自由布局桌面。

## 让 AI 帮你制作

即使还没有任何作品，也可以直接点「让 AI 制作」。填写你想要的功能，点「复制给 AI」或「下载说明」，发给 ChatGPT 等 AI。无需自己描述格式：说明会默认要求 AI 返回完整的 `.ephonewidget` JSON，包含界面、功能、设置和权限声明。得到结果后点「导入 AI 结果」，直接粘贴或选择文件，先预览，再安装。也支持粘贴 AI 输出的 HTML、CSS、JavaScript 三段代码，应用会生成作品包。完整 HTML 文件可直接导入；外部脚本、内联事件等不受支持时会给出错误原因。

如果要修改已有作品，在「我的小组件」点它的「交给 AI」，说明会附上当前作品。相同 `id` 导入时会替换作品定义；需要并存时让 AI 使用新 `id`。AI 返回的内容仍须经过导入校验和预览，不能保证任意网页代码都能作为小组件运行。

## 自己制作

「制作小组件」从空白作品开始。「选择功能范例」可打开计数器、每日打卡和原有相框范例。编辑器中的「名称」「功能说明」「尺寸」描述作品；画布添加形状、文字、图片、按钮、时钟、日期图层，拖动调整位置，在属性区修改外观、绑定内容和点击动作。

「使用者可填写或组件保存的内容」负责声明需要保存的值，类型有文字、数字、日期、图片。**只添加内容项不会自动生成界面或行为**：可视化作品要把它绑定到图层，代码作品要调用 `EPhoneWidget.get/edit/set`。每项还可指定默认内容。画布提供文字、图片、按钮、时钟、日期、倒数、进度、清单等图层；还可根据某项内容的值决定图层是否显示。图层点击动作可设为编辑内容、数字加一/减一/归零、切换 0/1、翻面、打开填写菜单、打开 EPhone 应用。数字动作还要指定操作哪个数字项目。保存前使用「预览并试用」填写测试内容并点击组件；测试值不会写入桌面实例。

文字图层还可以绑定当前角色今日待办数、音乐状态或外部 HTTPS 数据。外部数据可填写 JSON 字段路径；运行时由 EPhone 请求数据，使用者首次使用时会看到授权提示。网页数据源仍须允许跨域读取。

需要翻面卡片时，在画布切换到「背面」放置背面图层，并在正面和背面各放一个点击动作设为「翻转组件」的按钮。需要打开 EPhone 内的应用时，把按钮点击动作设为「打开 EPhone 应用」并填写应用 ID。

## 功能范例与实例数据

计数器范例演示画布按钮怎样修改数字并保存；重要日子倒数演示填写日期后自动显示剩余天数；每日打卡范例演示代码模式怎样读取、保存和显示当前实例的累计天数。旧相框范例仍可从范例列表打开，用于演示个人图片填写，但不再是制作入口的默认作品。

每个放到桌面的实例分别保存填写值。例如同一个计数器放置两次，可以分别记录两个数字。导出作品会得到 `.ephonewidget` 文件，包含界面与功能，不包含这些实例的私人内容；接收者导入后填写自己的内容。

## 小组件包格式

`.ephonewidget` 是 UTF-8 JSON 文件。制作界面导出的文件可直接作为示例。主要字段：

| 字段 | 说明 |
| --- | --- |
| `format`, `formatVersion` | 固定为 `ephone-widget`、`1` |
| `id`, `name`, `author`, `description` | 作品身份与介绍 |
| `mode` | `visual` 使用图层；`code` 使用 HTML/CSS/JavaScript |
| `size` | `{ "w": 2, "h": 2 }`，宽高为桌面格数，取值 1～4 |
| `fields` | 使用者可填写或组件保存的内容，类型可为 `image`、`text`、`date`、`number`；可带 `defaultValue` |
| `layers` | 可视化画布的图层 |
| `html`, `css`, `script` | 代码模式的界面与逻辑 |
| `networkHosts` | 组件申请访问的 HTTPS 域名列表 |
| `dataScopes` | 组件申请读取的 EPhone 数据范围，目前支持 `todoCount`、`musicStatus` |

图片项目的个人照片由 EPhone 按桌面实例保存，不应写进分享包。编辑作品和替换作品定义不会主动覆盖这些个人内容。导入同 ID 作品时会明确显示替换选择；改动字段时需检查旧实例的字段是否仍被使用。

## 代码模式接口

代码在隔离页面中运行，可自由绘制组件界面及编写组件内部交互。使用以下异步接口与 EPhone 通信：

```js
const photo = EPhoneWidget.get('photo');
await EPhoneWidget.edit('photo');          // 让使用者选照片或填写文字
await EPhoneWidget.set('caption', '今天'); // 保存当前桌面实例的内容
await EPhoneWidget.openSettings();          // 打开统一填写菜单
await EPhoneWidget.openApp('music');          // 打开 EPhone 内的应用
const count = await EPhoneWidget.read('todoCount');
const weather = await EPhoneWidget.fetch('https://example.com/weather');
```

`get` 读取当前实例的项目值。`edit` 和 `set` 只能操作包内 `fields` 声明的项目。`read` 需要在 `dataScopes` 声明并经使用者授权。`fetch` 需要在 `networkHosts` 声明域名并经使用者授权，且目标服务须允许浏览器跨域访问。组件不能直接访问 EPhone 的聊天数据库或主页面。

下面是代码模式计数按钮的核心写法；完整包还须有前述元数据和 `fields` 中的 `count` 数字项目。也可在范例列表打开「每日打卡」查看完整的界面、样式和逻辑：

```html
<strong id="count">0</strong><button id="add" type="button">加一</button>
```

```js
const count = document.getElementById('count');
count.textContent = EPhoneWidget.get('count') || '0';
document.getElementById('add').addEventListener('click', async () => {
  const next = String((Number(EPhoneWidget.get('count')) || 0) + 1);
  await EPhoneWidget.set('count', next);
  count.textContent = next;
});
```

代码模式可实现自定义动画、计算、翻面和复杂布局；浏览器或 PWA 不保证应用关闭后继续执行脚本，也不能直接创建 iOS/Android 系统桌面 Widget。

## 导入、导出与权限

「导入小组件」选择文件；「粘贴 AI 结果」可直接处理完整 JSON、HTML 或标明语言的代码块；「分别粘贴三段代码」适合分别拿到 HTML、CSS、JavaScript 的情况。代码导入时会识别脚本中通过 `EPhoneWidget.get/edit/set` 使用的字段，并允许在编辑器里修改字段类型与名称。预览页显示作品说明、填写项与权限；安装前可进入编辑器调整。

「导出」先显示分享摘要，再下载文件。作品包不含当前桌面实例里的私人照片、文字或记录。外部 HTTPS 数据请求和 EPhone 数据读取需要在包内声明权限，实际使用时还需使用者授权。代码在隔离页面内运行，不能直接访问 EPhone 聊天数据库或主页面；网页数据源仍须允许浏览器跨域读取。不要把包含私人内容的完整应用备份交给 AI。
