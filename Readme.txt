安装环境要求包括：Node.js 18+（推荐使用 LTS 版本）、支持 HTML、CSS 和 JavaScript 的前端环境，推荐使用 Chrome 浏览器以确保最佳兼容性。需要已安装 npm，并支持以下依赖模块：express、cors、axios、dotenv 等。此外，用户需在阿里云 DashScope 申请 API Key，并通过 Ollama 安装并部署本地 Llava 模型，以实现本地图片情绪分析功能。
二、安装过程（本地部署典型流程）
1、下载或克隆项目至本地目录，例如 D:/桌面/小程序/xiaoai
2、安装 Node.js 后，进入后端目录并执行依赖安装：
npm install
3、安装并启动 Ollama 与 LLaVA 模型（如未安装，先执行）：
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llava
ollama run llava
4、启动本地代理服务：node server.js
5、在 .env 或 config.js 中配置 API Key。
6、在本目录的命令行中输入：node server.js便可运行成功。
三、注意事项：
1、图像上传建议控制在10MB以内，避免Base64过大造成延迟
2、若使用本地 LLaVA 模型，建议内存≥8GB
3、所有 API Key 请妥善保存，不建议直接暴露在客户端代码中
部署完成后，即可在本地浏览器中访问“心晴小站”，获得 AI 心理咨询与支持服务。
文件中
server.js是后端服务器，里面包含启动语音合成后端接口和生成启动的本地链接
ai.html是心理医生小艾的页面
index.html是主页面
artical1-4.html是文章页面
reading.html是阅读页面
bottle.html是漂流瓶页面
bottle.js是漂流瓶后端接口
video.html是图片识别界面
