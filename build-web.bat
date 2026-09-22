@echo off
rem ============================================================
rem  build-web.bat —— 构建前端生产产物到 web\dist
rem  之后可用 start-server.bat 同源托管（http://localhost:3001）。
rem ============================================================
chcp 65001 >nul
setlocal
cd /d "%~dp0web"
if not exist node_modules (
  echo 未检测到 web\node_modules，先执行 npm install ...
  call npm install
  if errorlevel 1 ( echo npm install 失败 & exit /b 1 )
)
echo 正在构建前端（npm run build）...
call npm run build
if errorlevel 1 (
  echo 构建失败，请检查上方错误输出。
  exit /b 1
)
echo.
echo 构建完成：web\dist。现在可以运行 start-server.bat 并按 http://localhost:3001 访问。
endlocal