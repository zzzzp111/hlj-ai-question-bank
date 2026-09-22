@echo off
rem ============================================================
rem  start-web-dev.bat —— 启动前端开发服务器（Vite dev，端口 5173）
rem  /api 由 vite.config.js 的 server.proxy 转发到后端 3001。
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0web"
if not exist node_modules (
  echo 未检测到 web\node_modules，先执行 npm install ...
  call npm install
  if errorlevel 1 ( echo npm install 失败 & exit /b 1 )
)
echo 正在启动前端开发服务器，访问 http://localhost:5173 ...
call npm run dev
endlocal