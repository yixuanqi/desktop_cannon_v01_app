"""Chromium end-to-end browser-preview smoke tests; no Tauri/Rust required."""
import os, subprocess, time, urllib.request, pathlib, sys, shutil
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
port=1429
env=dict(os.environ, PORT=str(port))
server=subprocess.Popen(['node','scripts/dev-server.mjs'], cwd=root, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
try:
    for _ in range(50):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/preview.html', timeout=.2)
            break
        except Exception: time.sleep(.1)
    else: raise AssertionError('Node preview server did not respond')
    with sync_playwright() as pw:
        executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or shutil.which('chromium')
        launch_args = {'headless':True, 'args':['--no-sandbox','--disable-dev-shm-usage']}
        if executable: launch_args['executable_path'] = executable
        browser=pw.chromium.launch(**launch_args)
        page=browser.new_page(viewport={'width':1600,'height':900}, device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/preview.html', wait_until='networkidle')
        c=page.frame_locator('#cannon'); o=page.frame_locator('#overlay')
        c.locator('#bolt').wait_for()
        page.wait_for_timeout(700)
        assert c.locator('#scene').get_attribute('data-state') == 'idle', 'initial idle state'
        assert o.locator('#field').is_visible(), 'overlay canvas visible'
        assert page.evaluate("document.querySelector('#overlay').style.pointerEvents") == 'none', 'overlay iframe clickthrough preview'
        screenshot=root/'docs'/'browser_preview_idle.png';page.screenshot(path=str(screenshot),full_page=True)
        initial=page.locator('#cannon').bounding_box()
        body=c.locator('#recoil').bounding_box()
        bx=body['x']+body['width']*.45; by=body['y']+body['height']*.58
        page.mouse.move(bx,by);page.mouse.down();page.mouse.move(bx-95,by-45,steps=10);page.mouse.up()
        moved=page.locator('#cannon').bounding_box()
        assert moved['x'] < initial['x'] - 40, f'cannon body did not move: {initial} -> {moved}'
        assert moved['y'] < initial['y'] - 20, 'body drag should change cannon position'
        screenshot=root/'docs'/'browser_preview_moved.png';page.screenshot(path=str(screenshot),full_page=True)
        box=c.locator('#bolt').bounding_box()
        x=box['x']+box['width']*.65; y=box['y']+box['height']*.5
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+83,y+20,steps=12)
        assert c.locator('#scene').get_attribute('data-state') == 'charging', 'charging while held'
        strength=c.locator('#power-number').inner_text()
        assert int(strength.strip('%')) > 70, f'power should increase: {strength}'
        pitch=int(c.locator('#angle-number').inner_text().strip('°'))
        assert pitch >= 39, f'pitch should rise after pulling down: {pitch}'
        assert o.locator('canvas').evaluate('el=>Boolean(window.__overlayDebug.aim)'), 'trajectory preview should be active'
        screenshot=root/'docs'/'browser_preview_charging.png';page.screenshot(path=str(screenshot),full_page=True)
        page.mouse.up()
        page.wait_for_timeout(170)
        count=o.locator('canvas').evaluate('el=>window.__overlayDebug.projectiles.length')
        assert count == 1, f'Expected one fired ball, got {count}'
        page.screenshot(path=str(root/'docs'/'browser_preview_firing.png'),full_page=True)
        page.wait_for_timeout(1400)
        moving=o.locator('canvas').evaluate('el=>({balls:window.__overlayDebug.projectiles.length,frames:window.__overlayDebug.renderedFrames})')
        assert moving['frames']>10, f'ball animation did not render: {moving}'
        assert c.locator('#scene').get_attribute('data-state') in ('idle','hover')
        assert not errors, f'JavaScript errors: {errors}'
        browser.close()
        print('PASS Chromium preview: body reposition → diagonal bolt drag → power/pitch → trajectory preview → fire → projectile → recovery')
        print(f'Frames: {moving["frames"]}; power: {strength}; page errors: 0')
except Exception as exc:
    print('FAIL UI smoke:',exc)
    raise
finally:
    server.terminate()
    try: server.wait(timeout=3)
    except subprocess.TimeoutExpired:server.kill()
