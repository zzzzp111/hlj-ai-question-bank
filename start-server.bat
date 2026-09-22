@echo off
rem ============================================================
rem  start-server.bat —— 启动后端（生产/本地均走同源托管）
rem  位置：仓库根目录；用 %~dp0 推导路径，换机可用。
rem  依赖：先执行过 cd web && npm install && npm run build（见 build-web.bat）。
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "server\.env" (
  echo [提示] 未检测到 server\.env，将以 Mock 模式运行（无需 Key 即可演示）。
  echo        如需接入真实模型，请先 copy server\.env.example server\.env 并填入 LLM_API_KEY。
  echo.
)

if not exist "web\dist\index.html" (
  echo [提示] 未发现 web\dist 生产构建产物，后端将只提供 /api 接口（不托管前端页面）。
  echo        生产同源访问请先运行 build-web.bat 再启动本脚本；开发调试请用 start-web-dev.bat。
  echo.
)

cd /d "%~dp0server"
echo 正在启动后端，监听 http://localhost:3001 ...
echo 日志同时写入 logs\server.log
if not exist logs mkdir logs
npm start >> "%~dp0logs\server.log" 2>&1

endlocal