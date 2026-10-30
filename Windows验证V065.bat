@echo off
setlocal
cd /d "%~dp0"
echo [1/3] V0.6.5: JS physics and interaction regression tests
call npm test
if errorlevel 1 (echo ERROR: JS tests failed & exit /b 1)
echo [2/3] Original mesh art assets
python scripts\validate_mesh.py
if errorlevel 1 (echo ERROR: mesh validation failed & exit /b 2)
echo [3/3] Windows Rust/MSVC native compilation
where cargo >nul 2>&1
if errorlevel 1 (echo ERROR: Rust toolchain missing & exit /b 3)
cd src-tauri
cargo check
if errorlevel 1 (echo ERROR: Windows native compile failed & exit /b 4)
echo PASS: Compile checks completed. Desktop graphic/interaction requires real Windows runtime test.
exit /b 0
