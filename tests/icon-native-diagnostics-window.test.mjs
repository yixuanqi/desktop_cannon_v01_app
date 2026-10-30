import test from 'node:test';
import assert from 'node:assert/strict';
import {formatNativeDiagnostics} from '../web/js/icon-interaction/native-diagnostics.mjs';
test('独立诊断窗口在 Shell 失败时显示明确错误',()=>{
 const s=formatNativeDiagnostics({build:'V0.5.3-DIAG-INDEPENDENT-WINDOW',pid:123,featureEnabled:false,debugEnabled:true,overlayVisible:true,cannonVisible:true,shell:{ok:false,error:'IFolderView unavailable'}});
 assert.match(s,/V0.5.3/);assert.match(s,/IFolderView unavailable/);
 assert.match(s,/图标检测框开关: 已开启/);
});
 test('Shell 成功时输出真实图标数量及物理坐标样本',()=>{
 const s=formatNativeDiagnostics({featureEnabled:true,debugEnabled:true,shell:{ok:true,rawCount:42,desktopForeground:false,coordinateSystem:'physical-screen-px',sampleCells:[{token:'cell:1',screenX:102,screenY:225,cellWidth:80,cellHeight:100}]}});
 assert.match(s,/42 个图标/);assert.match(s,/102,225/);assert.match(s,/前台安全标记: 不允许/);
});
