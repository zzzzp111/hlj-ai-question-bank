@echo off
rem ============================================================
rem  verify-all.bat —— 一键跑完三项验证（任一失败即 exit /b 1）
rem    1) server：npm run verify   （服务层断言，51 项全绿）
rem    2) server：npm run test:e2e （端到端用例）
rem    3) web：   npm run build    （前端构建零错误）
rem ============================================================
chcp 65001 >nul
setlocal
set ROOT=%~dp0
set FAIL=0

echo ============ [1/3] server npm run verify ============
cd /d "%ROOT%server"
if not exist node_modules (
  echo 未检测到 server\node_modules，先执行 npm install ...
  call npm install
  if errorlevel 1 set FAIL=1
)
if %FAIL%==0 (
  call npm run verify
  if errorlevel 1 set FAIL=1
)

echo.
echo ============ [2/3] server npm run test:e2e ============
if %FAIL%==0 (
  call npm run test:e2e
  if errorlevel 1 set FAIL=1
)

echo.
echo ============ [3/3] web npm run build ============
cd /d "%ROOT%web"
if not exist node_modules (
  echo 未检测到 web\node_modules，先执行 npm install ...
  call npm install
  if errorlevel 1 set FAIL=1
)
if %FAIL%==0 (
  call npm run build
  if errorlevel 1 set FAIL=1
)

echo.
if %FAIL%==0 (
  echo [verify-all] ✓ 三项验证全部通过。
  exit /b 0
) else (
  echo [verify-all] ✗ 存在失败项，请检查上方输出。
  exit /b 1
)
endlocal