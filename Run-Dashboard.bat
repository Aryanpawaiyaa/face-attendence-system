@echo off
setlocal
title FaceAttend Pro - Smart AI Attendance System (RTL8735BDM / AMB82-Mini)
cd /d "%~dp0backend"

echo =====================================================================
echo          FaceAttend Pro - Smart AI Attendance Dashboard
echo        Realtek Ameba-IoT RTL8735BDM / AMB82-Mini IoT Camera
echo =====================================================================
echo.
echo [*] Local Browser Dashboard : http://localhost:5001
echo [*] Network / Wi-Fi IP      : Check your Wi-Fi IPv4 (e.g., 172.24.16.165)
echo [*] Server Port             : 5001
echo [*] Embedded Storage Engine : Active (Zero-Dependency, No MongoDB needed)
echo [*] Neural Face Engine      : Active
echo.
echo Login Credentials:
echo   - Super Admin: superadmin@example.com / 123456789
echo   - Teacher:     teacher@example.com     / 123456789
echo.
echo Press Ctrl+C in this console when you wish to stop the server.
echo =====================================================================
echo.

start "" "http://localhost:5001"

if exist server.bundle.js (
    node server.bundle.js
) else (
    node src/server.js
)

pause
