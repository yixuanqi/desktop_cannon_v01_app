// Desktop Cannon V0.6.1: READ-ONLY Shell enumeration plus transient cell capture.
// It never changes Explorer positions, injects into Explorer, or mutates files.
// Small icon-cell pixels are captured into caller-owned RAM buffers only; nothing is written to disk.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <exdisp.h>
#include <shlguid.h>
#include <servprov.h>
#include <wrl/client.h>
#include <algorithm>
#include <cstring>
#include <cwchar>
#include <cstdint>
#include <cstdlib>

using Microsoft::WRL::ComPtr;

extern "C" {
struct DCIconPosition {
    int32_t item_index;
    int32_t screen_x;
    int32_t screen_y;
    int32_t cell_width;
    int32_t cell_height;
    int32_t image_size;
};
// HRESULT is returned as an int32; explicit negative means failure.
// The caller must invoke on an STA thread and initialize COM before calling.
int32_t dc_snapshot_positions(DCIconPosition *out, int32_t capacity, int32_t *out_count, uintptr_t *out_view_id) {
    if (!out || capacity <= 0 || capacity > 4096 || !out_count || !out_view_id) return E_INVALIDARG;
    *out_count = 0;
    *out_view_id = 0;
    ComPtr<IShellWindows> shell;
    HRESULT hr = CoCreateInstance(CLSID_ShellWindows, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&shell));
    if (FAILED(hr)) return hr;
    VARIANT desktop, empty;
    VariantInit(&desktop);
    VariantInit(&empty);
    desktop.vt = VT_I4;
    desktop.lVal = CSIDL_DESKTOP;
    long shell_hwnd = 0;
    ComPtr<IDispatch> dispatch;
    hr = shell->FindWindowSW(&desktop, &empty, SWC_DESKTOP, &shell_hwnd, SWFO_NEEDDISPATCH, &dispatch);
    if (FAILED(hr) || !dispatch) return FAILED(hr) ? hr : E_FAIL;
    ComPtr<IServiceProvider> services;
    hr = dispatch.As(&services);
    if (FAILED(hr)) return hr;
    ComPtr<IShellBrowser> browser;
    hr = services->QueryService(SID_STopLevelBrowser, IID_PPV_ARGS(&browser));
    if (FAILED(hr)) return hr;
    ComPtr<IShellView> shell_view;
    hr = browser->QueryActiveShellView(&shell_view);
    if (FAILED(hr)) return hr;
    ComPtr<IFolderView> view;
    hr = shell_view.As(&view);
    if (FAILED(hr)) return hr;
    HWND view_hwnd = nullptr;
    hr = shell_view->GetWindow(&view_hwnd);
    if (FAILED(hr) || !IsWindow(view_hwnd)) return FAILED(hr) ? hr : E_FAIL;
    *out_view_id = reinterpret_cast<uintptr_t>(view_hwnd);
    POINT spacing{80, 100};
    if (FAILED(view->GetSpacing(&spacing))) return E_FAIL;
    if (spacing.x < 16 || spacing.y < 16 || spacing.x > 512 || spacing.y > 512) return E_FAIL;
    // IFolderView2 is documented Shell API: icon size is preferable to
    // treating the entire grid spacing as a solid collision rectangle.
    int icon_size = 0;
    ComPtr<IFolderView2> view2;
    if (SUCCEEDED(shell_view.As(&view2))) {
        FOLDERVIEWMODE mode{};
        if (FAILED(view2->GetViewModeAndIconSize(&mode, &icon_size))) icon_size = 0;
    }
    // Do not fabricate pixel-precise bounds when Shell cannot report size.
    if (icon_size < 16 || icon_size > 256) icon_size = 0;
    ComPtr<IEnumIDList> enumerator;
    hr = view->Items(SVGIO_ALLVIEW, IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) return hr;
    int count = 0;
    for (;;) {
        PITEMID_CHILD item = nullptr;
        ULONG fetched = 0;
        hr = enumerator->Next(1, &item, &fetched);
        if (hr == S_FALSE) break;
        if (FAILED(hr)) return hr;
        if (!item || fetched != 1) break;
        POINT point{};
        HRESULT position_hr = view->GetItemPosition(reinterpret_cast<PCUITEMID_CHILD>(item), &point);
        CoTaskMemFree(item);
        if (FAILED(position_hr)) continue;
        if (count >= capacity) return HRESULT_FROM_WIN32(ERROR_INSUFFICIENT_BUFFER);
        // IFolderView yields view-client coordinates. UIA must validate the
        // visible image/label rectangles before any flying-icon effect.
        if (!ClientToScreen(view_hwnd, &point)) return HRESULT_FROM_WIN32(GetLastError());
        out[count] = DCIconPosition{count, point.x, point.y, spacing.x, spacing.y, icon_size};
        ++count;
    }
    *out_count = count;
    return S_OK;
}

// Foreground safety must recognize our own interactive cannon window and the
// Explorer taskbar. Otherwise grabbing the charging lever or clicking the tray
// turns the target list empty, even while the desktop icons remain visible.
// This is a conservative prototype gate, NOT a per-icon occlusion test.
// M3 must still independently verify visual visibility before masking icons.
int32_t dc_desktop_foreground() {
    HWND hwnd = GetForegroundWindow();
    if (!hwnd) return 0;
    wchar_t name[128]{};
    if (!GetClassNameW(hwnd, name, 128)) return 0;
    DWORD foreground_pid = 0;
    GetWindowThreadProcessId(hwnd, &foreground_pid);
    if (foreground_pid == GetCurrentProcessId()) return 1;
    if (wcscmp(name, L"Progman") == 0 || wcscmp(name, L"WorkerW") == 0 ||
        wcscmp(name, L"Shell_TrayWnd") == 0 || wcscmp(name, L"Shell_SecondaryTrayWnd") == 0)
        return 1;
    return 0;
}
}

// V0.6 experimental VISUAL-ONLY capture. No Explorer mutation and no file writes.
// Caller initializes COM in an STA. This captures ONLY the requested small cell.
extern "C" int32_t dc_capture_cell_bgra(int32_t x, int32_t y, int32_t width, int32_t height,
                                         unsigned char* out, int32_t out_len) {
    if (!out || width < 1 || height < 1 || width > 256 || height > 256 ||
        out_len < width * height * 4) return E_INVALIDARG;
    HDC screen = GetDC(nullptr);
    if (!screen) return E_FAIL;
    HDC mem = CreateCompatibleDC(screen);
    if (!mem) { ReleaseDC(nullptr, screen); return E_FAIL; }
    BITMAPINFO info{};
    info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth=width;
    info.bmiHeader.biHeight=-height; // top-down DIB
    info.bmiHeader.biPlanes=1;
    info.bmiHeader.biBitCount=32;
    info.bmiHeader.biCompression=BI_RGB;
    void* bits=nullptr;
    HBITMAP bmp=CreateDIBSection(screen, &info, DIB_RGB_COLORS, &bits, nullptr, 0);
    if(!bmp || !bits) {
        if(bmp) DeleteObject(bmp);
        DeleteDC(mem); ReleaseDC(nullptr, screen); return E_FAIL;
    }
    HGDIOBJ old=SelectObject(mem,bmp);
    BOOL ok=BitBlt(mem,0,0,width,height,screen,x,y,SRCCOPY);
    if(ok) memcpy(out,bits,static_cast<size_t>(width)*height*4);
    SelectObject(mem,old);
    DeleteObject(bmp); DeleteDC(mem); ReleaseDC(nullptr,screen);
    return ok ? S_OK : E_FAIL;
}

extern "C" int32_t dc_wallpaper_info(wchar_t* out_path, int32_t capacity, int32_t* out_position) {
    if(!out_path || capacity<260 || !out_position) return E_INVALIDARG;
    out_path[0] = L'\0'; *out_position = -1;
    ComPtr<IDesktopWallpaper> wallpaper;
    HRESULT hr=CoCreateInstance(CLSID_DesktopWallpaper,nullptr,CLSCTX_ALL,IID_PPV_ARGS(&wallpaper));
    if(FAILED(hr)) return hr;
    LPWSTR file=nullptr;
    // NULL means the same static wallpaper is used for all monitors.
    hr=wallpaper->GetWallpaper(nullptr,&file);
    if(FAILED(hr) || !file || !*file) { if(file) CoTaskMemFree(file); return E_FAIL; }
    size_t n=wcslen(file);
    if(n>=static_cast<size_t>(capacity)) { CoTaskMemFree(file); return E_INVALIDARG; }
    memcpy(out_path,file,(n+1)*sizeof(wchar_t));
    CoTaskMemFree(file);
    DESKTOP_WALLPAPER_POSITION mode{};
    hr=wallpaper->GetPosition(&mode);
    if(FAILED(hr)) return hr;
    *out_position=static_cast<int32_t>(mode);
    return S_OK;
}

// Only while a visual illusion is active: cancel if another application gets
// focus or the pointer enters the visually hidden real icon's hit area.
extern "C" int32_t dc_visual_guard(int32_t x,int32_t y,int32_t w,int32_t h) {
    if(!dc_desktop_foreground()) return 0;
    POINT cursor{};
    if(!GetCursorPos(&cursor)) return 0;
    if(cursor.x>=x && cursor.x<x+w && cursor.y>=y && cursor.y<y+h) return 0;
    return 1;
}

// V0.6.5: Obtain the icon itself from the Shell item. Do NOT crop it out of
// an estimated rectangle in a desktop screenshot: shortcuts and custom icons
// may extend beyond that estimate. On failure the caller safely declines to
// animate the icon; the ordinary hit sparks still work.
// COM must be initialized as STA by the caller. Never modify Explorer items.
extern "C" int32_t dc_shell_icon_bgra(int32_t screen_x, int32_t screen_y,
                                       int32_t requested_size, unsigned char* output,
                                       int32_t output_len, int32_t* actual_width,
                                       int32_t* actual_height) {
    if (!output || !actual_width || !actual_height || requested_size < 16 ||
        requested_size > 256 || output_len < requested_size * requested_size * 4)
        return E_INVALIDARG;
    *actual_width = *actual_height = 0;
    ComPtr<IShellWindows> windows;
    HRESULT hr = CoCreateInstance(CLSID_ShellWindows, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&windows));
    if (FAILED(hr)) return hr;
    VARIANT desktop{}, empty{};
    VariantInit(&desktop); VariantInit(&empty);
    desktop.vt = VT_I4; desktop.lVal = CSIDL_DESKTOP;
    long hwnd = 0;
    ComPtr<IDispatch> dispatch;
    hr = windows->FindWindowSW(&desktop, &empty, SWC_DESKTOP, &hwnd,
                               SWFO_NEEDDISPATCH, &dispatch);
    if (FAILED(hr) || !dispatch) return FAILED(hr) ? hr : E_FAIL;
    ComPtr<IServiceProvider> services;
    hr = dispatch.As(&services);
    if (FAILED(hr)) return hr;
    ComPtr<IShellBrowser> browser;
    hr = services->QueryService(SID_STopLevelBrowser, IID_PPV_ARGS(&browser));
    if (FAILED(hr)) return hr;
    ComPtr<IShellView> shell_view;
    hr = browser->QueryActiveShellView(&shell_view);
    if (FAILED(hr)) return hr;
    ComPtr<IFolderView> view;
    hr = shell_view.As(&view);
    if (FAILED(hr)) return hr;
    HWND view_hwnd = nullptr;
    hr = shell_view->GetWindow(&view_hwnd);
    if (FAILED(hr) || !IsWindow(view_hwnd)) return FAILED(hr) ? hr : E_FAIL;
    ComPtr<IShellFolder> folder;
    hr = view->GetFolder(IID_PPV_ARGS(&folder));
    if (FAILED(hr)) return hr;
    ComPtr<IEnumIDList> items;
    hr = view->Items(SVGIO_ALLVIEW, IID_PPV_ARGS(&items));
    if (FAILED(hr)) return hr;
    for (;;) {
        PITEMID_CHILD item = nullptr;
        ULONG fetched = 0;
        hr = items->Next(1, &item, &fetched);
        if (hr == S_FALSE) return HRESULT_FROM_WIN32(ERROR_NOT_FOUND);
        if (FAILED(hr)) return hr;
        if (!item || fetched != 1) return E_FAIL;
        POINT point{};
        const bool match = SUCCEEDED(view->GetItemPosition(item, &point)) &&
                           ClientToScreen(view_hwnd, &point) &&
                           std::abs(point.x - screen_x) <= 1 && std::abs(point.y - screen_y) <= 1;
        if (!match) { CoTaskMemFree(item); continue; }
        ComPtr<IShellItemImageFactory> factory;
        hr = SHCreateItemWithParent(nullptr, folder.Get(), item, IID_PPV_ARGS(&factory));
        CoTaskMemFree(item);
        if (FAILED(hr)) return hr;
        HBITMAP bitmap = nullptr;
        // Returns the item's icon/thumbnail (not its label or neighboring icons).
        // Extraction happens on the dedicated Rust STA worker, never the UI thread.
        SIZE size{requested_size, requested_size};
        hr = factory->GetImage(size, SIIGBF_SCALEUP, &bitmap);
        if (FAILED(hr) || !bitmap) return FAILED(hr) ? hr : E_FAIL;
        BITMAP bm{};
        if (!GetObjectW(bitmap, sizeof(bm), &bm) || bm.bmWidth < 1 || bm.bmHeight < 1 ||
            bm.bmWidth > requested_size || bm.bmHeight > requested_size) {
            DeleteObject(bitmap);
            return HRESULT_FROM_WIN32(ERROR_BAD_LENGTH);
        }
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = bm.bmWidth;
        info.bmiHeader.biHeight = -bm.bmHeight; // top-down BGRA
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        HDC dc = GetDC(nullptr);
        const int rows = dc ? GetDIBits(dc, bitmap, 0, static_cast<UINT>(bm.bmHeight),
                                        output, &info, DIB_RGB_COLORS) : 0;
        if (dc) ReleaseDC(nullptr, dc);
        DeleteObject(bitmap);
        if (rows != bm.bmHeight) return E_FAIL;
        *actual_width = bm.bmWidth;
        *actual_height = bm.bmHeight;
        return S_OK;
    }
}
